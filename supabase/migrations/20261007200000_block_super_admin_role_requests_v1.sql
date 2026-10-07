-- Super Admin is reserved for direct Super Admin-controlled assignment.
-- It can never be requested through the user role-request workflow.

alter table public.role_requests
  drop constraint if exists role_requests_requested_role_not_super_admin;

alter table public.role_requests
  add constraint role_requests_requested_role_not_super_admin
  check (requested_role <> 'super_admin'::public.app_role);

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
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_role = 'super_admin'::public.app_role then
    raise exception 'Super Admin role cannot be requested';
  end if;

  if exists (
    select 1
    from public.user_roles ur
    where ur.user_id=v_user_id
      and ur.role=p_role
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
  do update set updated_at=now()
  returning * into v_request;

  perform private.notify_role_request_reviewers(
    v_request.id,
    v_email,
    v_full_name,
    p_role
  );

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
