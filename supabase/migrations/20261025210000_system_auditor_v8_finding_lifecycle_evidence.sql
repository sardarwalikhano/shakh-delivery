-- SHAKH System Auditor v8: expose scan evidence and history for finding lifecycle comparison.
-- Read-only over audit history; does not mutate business records or existing security policies.
create or replace function public.get_system_audit_history()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id=v_uid and ur.role='super_admin') then
    raise exception 'Super Admin access required';
  end if;
  if not private.has_permission('audit.view') then raise exception 'Audit permission required'; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', runs.id,
        'scan_id', runs.id,
        'created_at', runs.created_at,
        'summary', runs.summary,
        'checks', runs.checks,
        'open_finding_ids', coalesce((
          select jsonb_agg(c.value->>'id')
          from jsonb_array_elements(coalesce(runs.checks, '[]'::jsonb)) as c(value)
          where coalesce((c.value->>'ok')::boolean, false) = false
             or c.value->>'severity' = 'review'
        ), '[]'::jsonb)
      )
      order by runs.created_at desc
    )
    from (
      select id, created_at, summary, checks
      from private.system_audit_runs
      order by created_at desc
      limit 20
    ) runs
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_system_audit_history() from public, anon;
grant execute on function public.get_system_audit_history() to authenticated;
