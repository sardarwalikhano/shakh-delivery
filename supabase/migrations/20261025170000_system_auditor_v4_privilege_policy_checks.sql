-- SHAKH System Auditor v4: deeper privilege and policy posture checks.
-- Read-only inspection of catalog metadata; does not alter existing business policies.
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

  select count(*) into v_unsafe_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.prosecdef
    and (p.proconfig is null or not exists (
      select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
    ));

  select count(*) into v_anon_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  select count(*) into v_broad_policy
  from pg_policy pol
  join pg_class c on c.oid=pol.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and pol.polpermissive
    and (
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') in ('true','(true)')
      or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') in ('true','(true)')
    );

  v_checks := jsonb_build_array(
    jsonb_build_object(
      'id','database-rls-disabled','label','RLS لەسەر خشتەکانی public',
      'ok',v_no_rls=0,'severity',case when v_no_rls>0 then 'critical' else 'info' end,
      'detail',case when v_no_rls=0 then 'هەموو خشتەکانی public کە لەم پشکنینەدا دۆزرایەوە RLS ـیان چالاکە.' else 'ژمارەی خشتەکانی public بەبێ RLS: ' || v_no_rls::text end,
      'nextStep','خشتەکانی بێ RLS و ڕێگای دەستگەیشتن لە migration ـەکان بپشکنە؛ پێش گۆڕین، کاریگەرییەکان بسەلمێنە.'
    ),
    jsonb_build_object(
      'id','tables-without-policies','label','خشتەکانی public بەبێ RLS policy',
      'ok',v_no_policy=0,'severity',case when v_no_policy>0 then 'review' else 'info' end,
      'detail',case when v_no_policy=0 then 'هیچ خشتەیەکی public بەبێ policy نەدۆزرایەوە.' else 'ژمارەی خشتەکانی RLS چالاک بەبێ policy: ' || v_no_policy::text || '. هەندێک لەوانە ڕەنگە بە ئەنقەست deny-all بن.' end,
      'nextStep','هەر خشتەیەک جیاواز بپشکنە؛ policy مەزیاد بکە تەنها پاش دڵنیابوون لە مەبەستی دەستگەیشتن.'
    ),
    jsonb_build_object(
      'id','security-definer-functions','label','فانکشنەکانی SECURITY DEFINER',
      'ok',true,'severity',case when v_definer>0 then 'review' else 'info' end,
      'detail','ژمارەی فانکشنەکانی public بە SECURITY DEFINER: ' || v_definer::text || '. ژمارەکە بە تەنها هەڵە نییە.',
      'nextStep','فانکشنەکان بە تاکەکەسی بپشکنە: identity/permission check، ownership، search_path و EXECUTE grants.'
    ),
    jsonb_build_object(
      'id','security-definer-search-path','label','search_path ـی فانکشنە تایبەتەکان',
      'ok',v_unsafe_definer=0,'severity',case when v_unsafe_definer>0 then 'critical' else 'info' end,
      'detail',case when v_unsafe_definer=0 then 'هەموو فانکشنەکانی SECURITY DEFINER لە schema ـی public search_path ـی ڕێکخراویان هەیە.' else 'ژمارەی فانکشنەکانی SECURITY DEFINER بەبێ search_path ـی دیاریکراو: ' || v_unsafe_definer::text end,
      'nextStep','هەر فانکشنێک بپشکنە و search_path ـێکی سنووردار و متمانەپێکراو دیاری بکە؛ تەنها پاش code review بیگۆڕە.'
    ),
    jsonb_build_object(
      'id','security-definer-anon-execute','label','دەستگەیشتنی anon بە فانکشنەکانی SECURITY DEFINER',
      'ok',v_anon_definer=0,'severity',case when v_anon_definer>0 then 'critical' else 'info' end,
      'detail',case when v_anon_definer=0 then 'هیچ فانکشنێکی SECURITY DEFINER لە public بە anon دەستپێگەیشتوو نییە.' else 'ژمارەی فانکشنەکانی SECURITY DEFINER کە anon دەتوانێت بانگیان بکات: ' || v_anon_definer::text end,
      'nextStep','EXECUTE grants و مەبەستی هەر فانکشنێک بپشکنە؛ دەستپێگەیشتن لە anon بسڕەوە تەنها ئەگەر بەڕێوەبردنی ئێستا پێویستی پێی نەبێت.'
    ),
    jsonb_build_object(
      'id','permissive-broad-policies','label','RLS policy ـە گشتی و permissive ـەکان',
      'ok',true,'severity',case when v_broad_policy>0 then 'review' else 'info' end,
      'detail',case when v_broad_policy=0 then 'policy ـی permissive بە شرطی true بە شێوەی سادە نەدۆزرایەوە.' else 'ژمارەی policy ـە permissive ـەکان کە شرطی USING/WITH CHECK ـیان true ـە: ' || v_broad_policy::text || '. هەندێک لەوانە ڕەنگە مەبەستیان public read بێت.' end,
      'nextStep','ناوی خشتە و policy ـەکان بە پێی business logic و role ـەکان بپشکنە؛ policy بەبێ تاقیکردنەوە مەگۆڕە.'
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
revoke all on function public.run_system_audit() from public, anon;
grant execute on function public.run_system_audit() to authenticated;
