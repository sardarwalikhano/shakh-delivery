-- Repair the role approval flow without changing existing role-request records,
-- permissions, policies, or unrelated application features.
--
-- The public RPC is intentionally SECURITY INVOKER; the privileged operation is
-- isolated in a SECURITY DEFINER function with an explicit permission check.
-- Approval grants the requested role in user_roles (the RBAC source of truth),
-- then marks the request approved in the same transaction.

create or replace function private.review_role_request_internal(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request public.role_requests%rowtype;
  v_status text := lower(btrim(p_status));
  v_reviewer uuid := (select auth.uid());
begin
  if v_reviewer is null then
    raise exception 'Not authenticated';
  end if;

  if not private.has_permission('role_requests.review') then
    raise exception 'Role request review is not permitted';
  end if;

  if v_status not in ('approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  select *
    into v_request
  from public.role_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Role request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Role request is already reviewed';
  end if;

  if v_status = 'approved' then
    -- user_roles, not profiles.role, is the authoritative RBAC table.
    insert into public.user_roles(user_id, role)
    values (v_request.user_id, v_request.requested_role)
    on conflict (user_id) do update
      set role = excluded.role,
          updated_at = now()
      where public.user_roles.role = 'customer'::public.app_role
        and public.user_roles.role <> excluded.role;

    -- If the user already has this role, approval is idempotent; if they have
    -- a different primary role, do not silently overwrite it.
    if not exists (
      select 1
      from public.user_roles ur
      where ur.user_id = v_request.user_id
        and ur.role = v_request.requested_role
    ) then
      raise exception 'Cannot activate requested role: user already has a different primary role';
    end if;

    update public.role_requests
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_reviewer,
        review_note = nullif(btrim(p_note), ''),
        updated_at = now()
    where id = v_request.id;

    insert into public.audit_logs(actor_user_id, action, resource_type, resource_id, metadata)
    values (
      v_reviewer,
      'role_request.approved',
      'role_request',
      v_request.id::text,
      jsonb_build_object(
        'user_id', v_request.user_id,
        'requested_role', v_request.requested_role,
        'role_activated', true,
        'review_note', nullif(btrim(p_note), '')
      )
    );

    perform private.create_notification(
      v_request.user_id,
      'role_request',
      'Role ـەکەت ڤەریفای کرا',
      'داواکاریی Role ـی ' || v_request.requested_role::text || ' پەسەند کرا و دەسەڵاتەکانی ئەم Role ـەت پێدرا.',
      'تمت الموافقة على الدور',
      'تمت الموافقة على طلب دور ' || v_request.requested_role::text || ' ومنحتك صلاحياته.',
      'Role request approved',
      'Your request for the ' || v_request.requested_role::text || ' role was approved and its permissions are now active.',
      '/account',
      'role_request',
      v_request.id,
      jsonb_build_object(
        'request_id', v_request.id,
        'requested_role', v_request.requested_role,
        'status', 'approved'
      )
    );
  else
    update public.role_requests
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = v_reviewer,
        review_note = nullif(btrim(p_note), ''),
        updated_at = now()
    where id = v_request.id;

    insert into public.audit_logs(actor_user_id, action, resource_type, resource_id, metadata)
    values (
      v_reviewer,
      'role_request.rejected',
      'role_request',
      v_request.id::text,
      jsonb_build_object(
        'user_id', v_request.user_id,
        'requested_role', v_request.requested_role,
        'review_note', nullif(btrim(p_note), '')
      )
    );

    perform private.create_notification(
      v_request.user_id,
      'role_request',
      'داواکاریی Role ڕەتکرایەوە',
      'داواکاریی Role ـی ' || v_request.requested_role::text || ' ڕەتکرایەوە.' ||
        case when nullif(btrim(p_note), '') is not null then ' تێبینی: ' || btrim(p_note) else '' end,
      'تم رفض طلب الدور',
      'تم رفض طلب دور ' || v_request.requested_role::text || '.' ||
        case when nullif(btrim(p_note), '') is not null then ' ملاحظة: ' || btrim(p_note) else '' end,
      'Role request rejected',
      'Your request for the ' || v_request.requested_role::text || ' role was rejected.' ||
        case when nullif(btrim(p_note), '') is not null then ' Note: ' || btrim(p_note) else '' end,
      '/account',
      'role_request',
      v_request.id,
      jsonb_build_object(
        'request_id', v_request.id,
        'requested_role', v_request.requested_role,
        'status', 'rejected'
      )
    );
  end if;

  select *
    into v_request
  from public.role_requests
  where id = p_request_id;

  return jsonb_build_object(
    'id', v_request.id,
    'user_id', v_request.user_id,
    'requested_role', v_request.requested_role,
    'status', v_request.status,
    'reviewed_at', v_request.reviewed_at,
    'reviewed_by', v_request.reviewed_by,
    'review_note', v_request.review_note,
    'role_activated', case when v_status = 'approved' then true else false end
  );
end;
$$;

revoke all on function private.review_role_request_internal(uuid, text, text) from public, anon, authenticated;
grant execute on function private.review_role_request_internal(uuid, text, text) to authenticated;

-- The existing public SECURITY INVOKER wrapper continues to call this helper.
-- Ensure its schema usage does not expose any additional private objects.
