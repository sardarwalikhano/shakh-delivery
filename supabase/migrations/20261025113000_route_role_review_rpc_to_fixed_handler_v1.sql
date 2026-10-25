-- Route the public RPC used by the dashboard to the corrected approval
-- implementation. The previous patch defined the private helper but did not
-- replace this public entry point, so the dashboard could still execute the
-- legacy approval logic.
create or replace function public.review_role_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.review_role_request_internal(p_request_id, p_status, p_note);
$$;

revoke all on function public.review_role_request(uuid, text, text) from public, anon;
grant execute on function public.review_role_request(uuid, text, text) to authenticated;
