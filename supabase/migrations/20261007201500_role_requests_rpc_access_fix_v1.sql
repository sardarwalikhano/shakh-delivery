-- Role-review RPC must not depend on the private schema when executed
-- as SECURITY INVOKER by an authenticated Super Admin.
create or replace function public.list_pending_role_requests()
returns table(
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  requested_role public.app_role,
  status text,
  requested_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select
    rr.id,
    rr.user_id,
    p.email,
    p.full_name,
    rr.requested_role,
    rr.status,
    rr.requested_at
  from public.role_requests rr
  join public.profiles p on p.id=rr.user_id
  where rr.status='pending'
    and exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role=ur.role
      where ur.user_id=(select auth.uid())
        and rp.permission_code='role_requests.review'
    )
  order by rr.requested_at asc;
$$;

revoke all on function public.list_pending_role_requests() from public, anon;
grant execute on function public.list_pending_role_requests() to authenticated;
