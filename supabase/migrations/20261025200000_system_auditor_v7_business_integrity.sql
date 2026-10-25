-- SHAKH System Auditor v7: safe read-only business data integrity checks.
-- No business rows are modified. Findings are advisory; thresholds are not guessed.
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
  v_no_rls bigint; v_no_policy bigint; v_definer bigint; v_unsafe_definer bigint;
  v_anon_definer bigint; v_broad_policy bigint; v_orphan_perm bigint; v_unmapped_perm bigint; v_duplicate_perm bigint;
  v_no_rls_names text; v_no_policy_names text; v_unsafe_names text; v_anon_names text; v_broad_names text;
  v_orphan_perm_names text; v_unmapped_perm_names text; v_duplicate_perm_names text;
  v_orphan_orders bigint := 0; v_orphan_deliveries bigint := 0; v_orphan_order_names text := ''; v_orphan_delivery_names text := '';
  v_data_checks jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.user_roles ur where ur.user_id=v_uid and ur.role='super_admin') then raise exception 'Super Admin access required'; end if;
  if not private.has_permission('audit.view') then raise exception 'Audit permission required'; end if;

  select count(*),coalesce(string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname),'') into v_no_rls,v_no_rls_names
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;
  select count(*),coalesce(string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname),'') into v_no_policy,v_no_policy_names
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
  and not exists(select 1 from pg_policy pol where pol.polrelid=c.oid);
  select count(*) into v_definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosecdef;
  select count(*),coalesce(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',', ' order by p.proname),'') into v_unsafe_definer,v_unsafe_names
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosecdef
  and (p.proconfig is null or not exists(select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'));
  select count(*),coalesce(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',', ' order by p.proname),'') into v_anon_definer,v_anon_names
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE');
  select count(*),coalesce(string_agg(format('%I.%I [%s]',n.nspname,c.relname,pol.polname),', ' order by c.relname,pol.polname),'') into v_broad_policy,v_broad_names
  from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and pol.polpermissive
  and (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') in ('true','(true)') or coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') in ('true','(true)'));
  select count(*),coalesce(string_agg(distinct rp.permission_code,', ' order by rp.permission_code),'') into v_orphan_perm,v_orphan_perm_names
  from public.role_permissions rp left join public.permissions p on p.code=rp.permission_code where p.code is null;
  select count(*),coalesce(string_agg(p.code,', ' order by p.code),'') into v_unmapped_perm,v_unmapped_perm_names
  from public.permissions p where not exists(select 1 from public.role_permissions rp where rp.permission_code=p.code);
  select count(*),coalesce(string_agg(d.role::text||':'||d.permission_code,', ' order by d.role::text,d.permission_code),'') into v_duplicate_perm,v_duplicate_perm_names
  from (select rp.role,rp.permission_code,count(*) mappings from public.role_permissions rp group by rp.role,rp.permission_code having count(*)>1) d;

  v_checks := jsonb_build_array(
   jsonb_build_object('id','database-rls-disabled','label','RLS لەسەر خشتەکانی public','ok',v_no_rls=0,'severity',case when v_no_rls>0 then 'critical' else 'info' end,'detail',case when v_no_rls=0 then 'هەموو خشتە پشکنراوەکان RLS ـیان چالاکە.' else 'ژمارە: '||v_no_rls||'. خشتەکان: '||v_no_rls_names end,'nextStep','RLS و grants و migration ـی خشتەکان بپشکنە؛ پێش گۆڕین تاقیکردنەوە بکە.'),
   jsonb_build_object('id','tables-without-policies','label','خشتەکانی public بەبێ policy','ok',v_no_policy=0,'severity',case when v_no_policy>0 then 'review' else 'info' end,'detail',case when v_no_policy=0 then 'خشتەیەکی public بەبێ policy نەدۆزرایەوە.' else 'ژمارە: '||v_no_policy||'. خشتەکان: '||v_no_policy_names end,'nextStep','دڵنیابە خشتەکە پێویستی بە client access هەیە؛ deny-all لەوانەیە مەبەست بێت.'),
   jsonb_build_object('id','security-definer-functions','label','فانکشنەکانی SECURITY DEFINER','ok',true,'severity',case when v_definer>0 then 'review' else 'info' end,'detail','کۆی فانکشنەکان: '||v_definer,'nextStep','identity، ownership، authorization، search_path و grants بۆ هەر فانکشنێک بپشکنە.'),
   jsonb_build_object('id','security-definer-search-path','label','SECURITY DEFINER بەبێ search_path','ok',v_unsafe_definer=0,'severity',case when v_unsafe_definer>0 then 'critical' else 'info' end,'detail',case when v_unsafe_definer=0 then 'هیچ فانکشنێک لەم پێوەرەدا نەدۆزرایەوە.' else 'کۆ: '||v_unsafe_definer||'. '||v_unsafe_names end,'nextStep','فانکشنەکان بە تاکەکەسی بپشکنە و search_path ـی متمانەپێکراو دابنێ.'),
   jsonb_build_object('id','security-definer-anon-execute','label','SECURITY DEFINER بەردەست بە anon','ok',v_anon_definer=0,'severity',case when v_anon_definer>0 then 'critical' else 'info' end,'detail',case when v_anon_definer=0 then 'هیچ فانکشنێک لەم پێوەرەدا نەدۆزرایەوە.' else 'کۆ: '||v_anon_definer||'. '||v_anon_names end,'nextStep','EXECUTE grant و پێویستی public access بپشکنە؛ بەبێ code review مەیسڕەوە.'),
   jsonb_build_object('id','permissive-broad-policies','label','RLS policy ـە گشتییەکان','ok',true,'severity',case when v_broad_policy>0 then 'review' else 'info' end,'detail',case when v_broad_policy=0 then 'policy ـی گشتی بە شرطی true نەدۆزرایەوە.' else 'کۆ: '||v_broad_policy||'. '||v_broad_names end,'nextStep','هەر policy بە پێی business logic بپشکنە؛ هەندێک public-read بەئەنقەستە.'),
   jsonb_build_object('id','orphan-role-permissions','label','Permission ـی نەناسراو','ok',v_orphan_perm=0,'severity',case when v_orphan_perm>0 then 'critical' else 'info' end,'detail',case when v_orphan_perm=0 then 'mapping ـی نەناسراو نییە.' else 'کۆ: '||v_orphan_perm||'. '||v_orphan_perm_names end,'nextStep','کۆدەکان لە migration و registry بەراورد بکە؛ mapping مەسڕەوە.'),
   jsonb_build_object('id','unmapped-permissions','label','Permission ـە بێ mapping','ok',v_unmapped_perm=0,'severity',case when v_unmapped_perm>0 then 'review' else 'info' end,'detail',case when v_unmapped_perm=0 then 'permission ـی بێ mapping نییە.' else 'کۆ: '||v_unmapped_perm||'. '||v_unmapped_perm_names end,'nextStep','بپشکنە ئایا permission ـەکە وەستاندراوە یان mapping ـی پێویستە.'),
   jsonb_build_object('id','duplicate-role-permissions','label','Mapping ـی دووبارە','ok',v_duplicate_perm=0,'severity',case when v_duplicate_perm>0 then 'review' else 'info' end,'detail',case when v_duplicate_perm=0 then 'mapping ـی دووبارە نییە.' else 'کۆ: '||v_duplicate_perm||'. '||v_duplicate_perm_names end,'nextStep','پێش unique constraint دڵنیابە لە نەبوونی duplicate و کاریگەریی migration.')
  );

  -- Conditional, read-only integrity checks: run only when known tables/columns exist.
  if to_regclass('public.orders') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='delivery_id')
     and to_regclass('public.deliveries') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='deliveries' and column_name='id') then
    execute 'select count(*) from public.orders o left join public.deliveries d on d.id=o.delivery_id where o.delivery_id is not null and d.id is null' into v_orphan_orders;
    v_data_checks := v_data_checks || jsonb_build_array(jsonb_build_object('id','orders-orphan-delivery','label','پەیوەندی ئۆردەر و گەیاندن','ok',v_orphan_orders=0,'severity',case when v_orphan_orders>0 then 'review' else 'info' end,'detail','ژمارەی orders بە delivery_id ـی بێ هاوتا: '||v_orphan_orders,'nextStep','تۆمارەکان وەک کێشەی یەکگرتوویی بپشکنە؛ هیچ تۆمارێک خۆکارانە مەگۆڕە.'));
  end if;
  if to_regclass('public.deliveries') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='deliveries' and column_name='order_id') then
    execute 'select count(*) from public.deliveries d left join public.orders o on o.id=d.order_id where d.order_id is not null and o.id is null' into v_orphan_deliveries;
    v_data_checks := v_data_checks || jsonb_build_array(jsonb_build_object('id','deliveries-orphan-order','label','پەیوەندی گەیاندن و ئۆردەر','ok',v_orphan_deliveries=0,'severity',case when v_orphan_deliveries>0 then 'review' else 'info' end,'detail','ژمارەی deliveries بە order_id ـی بێ هاوتا: '||v_orphan_deliveries,'nextStep','تۆمارەکان بپشکنە؛ هیچ داتایەک خۆکارانە مەسڕەوە.'));
  end if;
  v_checks := v_checks || v_data_checks;
  v_summary := jsonb_build_object('checks',v_checks,'summary',jsonb_build_object(
   'total',jsonb_array_length(v_checks),
   'critical',(select count(*) from jsonb_array_elements(v_checks) e(value) where value->>'severity'='critical'),
   'review',(select count(*) from jsonb_array_elements(v_checks) e(value) where value->>'severity'='review'),
   'passed',(select count(*) from jsonb_array_elements(v_checks) e(value) where value->>'ok'='true' and value->>'severity'<>'review')
  ));
  insert into private.system_audit_runs(initiated_by,summary,checks) values(v_uid,v_summary->'summary',v_checks) returning id into v_run_id;
  return v_summary || jsonb_build_object('run_id',v_run_id,'scanned_at',now());
end;
$$;
revoke all on function public.run_system_audit() from public, anon;
grant execute on function public.run_system_audit() to authenticated;
