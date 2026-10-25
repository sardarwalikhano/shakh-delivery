-- SHAKH System Auditor v3: protected, read-only database posture scan and history.
create table if not exists private.system_audit_runs (
  id uuid primary key default gen_random_uuid(),
  initiated_by uuid not null,
  created_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  checks jsonb not null default '[]'::jsonb
);
alter table private.system_audit_runs enable row level security;
revoke all on table private.system_audit_runs from public, anon, authenticated;

create or replace function public.run_system_audit()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := (select auth.uid());
  v_checks jsonb;
  v_summary jsonb;
  v_run_id uuid;
  v_no_rls bigint;
  v_no_policy bigint;
  v_definer bigint;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id=v_uid and ur.role='super_admin') then
    raise exception 'Super Admin access required';
  end if;
  if not private.has_permission('audit.view') then raise exception 'Audit permission required'; end if;

  select count(*) into v_no_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;

  select count(*) into v_no_policy
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
    and not exists (select 1 from pg_policy pol where pol.polrelid=c.oid);

  select count(*) into v_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.prosecdef;

  v_checks := jsonb_build_array(
    jsonb_build_object(
      'id','database-rls-disabled',
      'label','RLS لەسەر خشتەکانی public',
      'ok',v_no_rls=0,
      'severity',case when v_no_rls>0 then 'critical' else 'info' end,
      'detail',case when v_no_rls=0 then 'هەموو خشتەکانی public کە لەم پشکنینەدا دۆزرایەوە RLS ـیان چالاکە.' else 'ژمارەی خشتەکانی public بەبێ RLS: ' || v_no_rls::text end,
      'nextStep','خشتەکانی بێ RLS لە migration و policy ـەکانیان بپشکنە؛ پێش گۆڕین، کاریگەرییەکان بسەلمێنە.'
    ),
    jsonb_build_object(
      'id','tables-without-policies',
      'label','خشتەکانی public بەبێ RLS policy',
      'ok',v_no_policy=0,
      'severity',case when v_no_policy>0 then 'review' else 'info' end,
      'detail',case when v_no_policy=0 then 'هیچ خشتەیەکی public بەبێ policy نەدۆزرایەوە.' else 'ژمارەی خشتەکانی RLS چالاک بەبێ policy: ' || v_no_policy::text || '. هەندێک لەوانە ڕەنگە بە ئەنقەست deny-all بن.' end,
      'nextStep','هەر خشتەیەک جیاواز بپشکنە؛ policy مەزیاد بکە تەنها پاش دڵنیابوون لە مەبەستی دەستگەیشتن.'
    ),
    jsonb_build_object(
      'id','security-definer-functions',
      'label','فانکشنەکانی SECURITY DEFINER',
      'ok',true,
      'severity',case when v_definer>0 then 'review' else 'info' end,
      'detail','ژمارەی فانکشنەکانی public بە SECURITY DEFINER: ' || v_definer::text || '. ئەمە بە تەنها هەڵە نییە؛ پێویستی بە پشکنینی authorization و search_path هەیە.',
      'nextStep','فانکشنەکان بە تاکەکەسی بپشکنە: auth.uid، permission check، ownership، search_path و EXECUTE grants.'
    )
  );

  v_summary := jsonb_build_object(
    'checks',v_checks,
    'summary',jsonb_build_object(
      'total',jsonb_array_length(v_checks),
      'critical',(select count(*) from jsonb_array_elements(v_checks) as elem(value) where value->>'severity'='critical'),
      'review',(select count(*) from jsonb_array_elements(v_checks) as elem(value) where value->>'severity'='review'),
      'passed',(select count(*) from jsonb_array_elements(v_checks) as elem(value) where value->>'ok'='true' and value->>'severity' <> 'review')
    )
  );

  insert into private.system_audit_runs(initiated_by,summary,checks)
  values(v_uid,v_summary->'summary',v_checks)
  returning id into v_run_id;

  return v_summary || jsonb_build_object('run_id',v_run_id,'scanned_at',now());
end;
$$;

create or replace function public.get_system_audit_history()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id=v_uid and ur.role='super_admin') then
    raise exception 'Super Admin access required';
  end if;
  if not private.has_permission('audit.view') then raise exception 'Audit permission required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'created_at',created_at,'summary',summary) order by created_at desc)
    from (select id,created_at,summary from private.system_audit_runs order by created_at desc limit 20) runs
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.run_system_audit() from public, anon;
revoke all on function public.get_system_audit_history() from public, anon;
grant execute on function public.run_system_audit() to authenticated;
grant execute on function public.get_system_audit_history() to authenticated;
