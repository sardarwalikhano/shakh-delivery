-- Final role-request RPC security hardening and Data API grants for posts.
-- Public RPCs are SECURITY INVOKER; privileged work stays in private helpers.

grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.role_post_categories to authenticated;

create or replace function public.request_role(p_role public.app_role)
returns jsonb
language sql
security invoker
set search_path = pg_catalog,public
as $$
  select private.request_role_internal(p_role);
$$;

revoke all on function public.request_role(public.app_role) from public,anon;
grant execute on function public.request_role(public.app_role) to authenticated;

create or replace function public.review_role_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog,public
as $$
  select private.review_role_request_internal(p_request_id,p_status,p_note);
$$;

revoke all on function public.review_role_request(uuid,text,text) from public,anon;
grant execute on function public.review_role_request(uuid,text,text) to authenticated;
