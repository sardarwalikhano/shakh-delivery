-- Fix Data API access for role requests and prevent duplicate role-request notifications.

grant select on public.role_requests to authenticated;

delete from public.notifications n
using public.notifications older
where n.type='role_request'
  and n.entity_type='role_request'
  and n.entity_id is not null
  and older.type='role_request'
  and older.entity_type='role_request'
  and older.entity_id=n.entity_id
  and older.user_id=n.user_id
  and (
    older.created_at < n.created_at
    or (older.created_at = n.created_at and older.id::text < n.id::text)
  );

create unique index if not exists role_request_notification_once_idx
on public.notifications(user_id, type, entity_type, entity_id)
where type='role_request' and entity_type='role_request' and entity_id is not null;

create or replace function public.request_role(p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.role_requests%rowtype;
  v_email text;
  v_full_name text;
  v_inserted boolean := false;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  if p_role = 'super_admin'::public.app_role then
    raise exception 'Super Admin role cannot be requested';
  end if;

  if exists (
    select 1 from public.user_roles ur
    where ur.user_id=v_user_id and ur.role=p_role
  ) then
    raise exception 'You already have this role';
  end if;

  select p.email,p.full_name
    into v_email,v_full_name
  from public.profiles p
  where p.id=v_user_id;

  insert into public.role_requests(user_id,requested_role,status)
  values(v_user_id,p_role,'pending')
  on conflict (user_id,requested_role) where status='pending'
  do nothing
  returning * into v_request;

  if found then
    v_inserted := true;
  else
    select *
      into v_request
    from public.role_requests rr
    where rr.user_id=v_user_id
      and rr.requested_role=p_role
      and rr.status='pending'
    order by rr.requested_at desc
    limit 1;
  end if;

  if v_request.id is null then
    raise exception 'Unable to create or find the role request';
  end if;

  if v_inserted then
    perform private.notify_role_request_reviewers(
      v_request.id,
      v_email,
      v_full_name,
      p_role
    );
  end if;

  return jsonb_build_object(
    'id',v_request.id,
    'requested_role',v_request.requested_role,
    'status',v_request.status,
    'requested_at',v_request.requested_at
  );
end;
$$;

revoke all on function public.request_role(public.app_role) from public,anon;
grant execute on function public.request_role(public.app_role) to authenticated;
