-- SHAKH System Auditor v5: actionable catalog evidence in findings.
-- No business rows, existing policies, grants, or application permissions are modified.
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
  v_unsafe_definer bigint;
  v_anon_definer bigint;
  v_broad_policy bigint;
  v_no_rls_names text;
  v_no_policy_names text;
  v_unsafe_names text;
  v_anon_names text;
  v_broad_names text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id=v_uid and ur.role='super_admin') then
    raise exception 'Super Admin access required';
  end if;
  if not private.has_permission('audit.view') then raise exception 'Audit permission required'; end if;

  select count(*), coalesce(string_agg(format('%I.%I',n.nspname,c.relname), ', ' order by c.relname),'')
    into v_no_rls, v_no_rls_names
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;

  select count(*), coalesce(string_agg(format('%I.%I',n.nspname,c.relname), ', ' order by c.relname),'')
    into v_no_policy, v_no_policy_names
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
    and not exists (select 1 from pg_policy pol where pol.polrelid=c.oid);

  select count(*) into v_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.prosecdef;

  select count(*), coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname),'')
    into v_unsafe_definer, v_unsafe_names
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.prosecdef
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'));

  select count(*), coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname),'')
    into v_anon_definer, v_anon_names
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  select count(*), coalesce(string_agg(format('%I.%I [%s]',n.nspname,c.relname,pol.polname), ', ' order by c.relname,pol.polname),'')
    into v_broad_policy, v_broad_names
  from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and pol.polpermissive
    and (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') in ('true','(true)')
      or coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') in ('true','(true)'));

  v_checks := jsonb_build_array(
    jsonb_build_object('id','database-rls-disabled','label','RLS لەسەر خشتەکانی public',
      'ok',v_no_rls=0,'severity',case when v_no_rls>0 then 'critical' else 'info' end,
      'detail',case when v_no_rls=0 then 'هەموو خشتەکانی public کە پشکنراون RLS ـیان چالاکە.' else 'ژمارە: '||v_no_rls::text||'. خشتەکان: '||v_no_rls_names end,
      'nextStep','پێش گۆڕین، مۆڵەت و migration ـی هەر خشتەیەک بپشکنە؛ پاشان تاقیکردنەوەی ڕۆڵەکان ئەنجام بدە.'),
    jsonb_build_object('id','tables-without-policies','label','خشتەکانی public بەبێ RLS policy',
      'ok',v_no_policy=0,'severity',case when v_no_policy>0 then 'review' else 'info' end,
      'detail',case when v_no_policy=0 then 'خشتەی public بەبێ policy نەدۆزرایەوە.' else 'ژمارە: '||v_no_policy::text||'. خشتەکان: '||v_no_policy_names||'. ئەمە دەتوانێت deny-all ـی بەئەنقەست بێت.' end,
      'nextStep','مەبەستی خشتەکە و پێویستی بە client access بپشکنە؛ policy مەزیاد بکە تەنها پاش code review.'),
    jsonb_build_object('id','security-definer-functions','label','فانکشنەکانی SECURITY DEFINER',
      'ok',true,'severity',case when v_definer>0 then 'review' else 'info' end,
      'detail','کۆی فانکشنەکان: '||v_definer::text||'. ژمارەکە بە تەنها هەڵە نییە.',
      'nextStep','identity، authorization، ownership، search_path و EXECUTE grants بۆ هەر فانکشنێک پشکنە.'),
    jsonb_build_object('id','security-definer-search-path','label','SECURITY DEFINER بەبێ search_path',
      'ok',v_unsafe_definer=0,'severity',case when v_unsafe_definer>0 then 'critical' else 'info' end,
      'detail',case when v_unsafe_definer=0 then 'فانکشنێکی ناگونجاو لەم پێوەرەدا نەدۆزرایەوە.' else 'ژمارە: '||v_unsafe_definer::text||'. فانکشنەکان: '||v_unsafe_names end,
      'nextStep','فانکشنە دیاریکراوەکان بخوێنەوە و search_path ـێکی سنووردار دابنێ؛ پێش deploy تاقی بکەرەوە.'),
    jsonb_build_object('id','security-definer-anon-execute','label','SECURITY DEFINER کە anon دەتوانێت بانگی بکات',
      'ok',v_anon_definer=0,'severity',case when v_anon_definer>0 then 'critical' else 'info' end,
      'detail',case when v_anon_definer=0 then 'فانکشنێکی بەردەست بە anon نەدۆزرایەوە.' else 'ژمارە: '||v_anon_definer::text||'. فانکشنەکان: '||v_anon_names end,
      'nextStep','EXECUTE grant و مەبەستی business هەر فانکشنێک بپشکنە؛ دەستگەیشتن تەنها بە پشتڕاستکردنەوەی کاریگەری سنووردار بکە.'),
    jsonb_build_object('id','permissive-broad-policies','label','RLS policy ـە گشتییەکان بۆ پشکنین',
      'ok',true,'severity',case when v_broad_policy>0 then 'review' else 'info' end,
      'detail',case when v_broad_policy=0 then 'policy ـی permissive بە شرطی true بە فۆرماتی سادە نەدۆزرایەوە.' else 'ژمارە: '||v_broad_policy::text||'. policy ـەکان: '||v_broad_names end,
      'nextStep','هەر policy بە پێی business logic پشکنە؛ public read دەتوانێت بەئەنقەست بێت، خۆکارانە مەیسڕەوە.')
  );

  v_summary := jsonb_build_object('checks',v_checks,'summary',jsonb_build_object(
    'total',jsonb_array_length(v_checks),
    'critical',(select count(*) from jsonb_array_elements(v_checks) as elem(value) where value->>'severity'='critical'),
    'review',(select count(*) from jsonb_array_elements(v_checks) as elem(value) where value->>'severity'='review'),
    'passed',(select count(*) from jsonb_array_elements(v_checks) as elem(value) where value->>'ok'='true' and value->>'severity' <> 'review')
  ));
  insert into private.system_audit_runs(initiated_by,summary,checks) values(v_uid,v_summary->'summary',v_checks) returning id into v_run_id;
  return v_summary || jsonb_build_object('run_id',v_run_id,'scanned_at',now());
end;
$$;
revoke all on function public.run_system_audit() from public, anon;
grant execute on function public.run_system_audit() to authenticated;
