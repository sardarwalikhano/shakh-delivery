-- Commission percentages are configurable by the Super Admin (global default
-- plus optional per-captain overrides); the default remains 20 percent.
create table if not exists public.captain_commission_rules (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid references public.profiles(id) on delete cascade,
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists captain_commission_rules_one_per_captain
  on public.captain_commission_rules(captain_id) where captain_id is not null;
create unique index if not exists captain_commission_rules_one_default
  on public.captain_commission_rules((1)) where captain_id is null;

insert into public.captain_commission_rules(captain_id,commission_percent)
select null,20 where not exists(select 1 from public.captain_commission_rules where captain_id is null);

alter table public.captain_commission_rules enable row level security;
drop policy if exists captain_commission_rules_select_scoped on public.captain_commission_rules;
create policy captain_commission_rules_select_scoped on public.captain_commission_rules
for select to authenticated
using (captain_id is null or captain_id=(select auth.uid()) or (select private.has_permission('wallets.manage')));
revoke insert,update,delete on public.captain_commission_rules from anon,authenticated;

create or replace function private.captain_delivery_commission_percent(p_captain_id uuid)
returns numeric
language sql stable security definer
set search_path=pg_catalog,public,private
as $function$
  select coalesce(
    (select r.commission_percent from public.captain_commission_rules r where r.captain_id=p_captain_id),
    (select r.commission_percent from public.captain_commission_rules r where r.captain_id is null),
    20.00
  );
$function$;
revoke all on function private.captain_delivery_commission_percent(uuid) from public,anon,authenticated;

create or replace function public.get_captain_commission_overview()
returns table(
  captain_id uuid,
  full_name text,
  phone text,
  commission_percent numeric,
  is_custom boolean
)
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if private.has_permission('wallets.manage') then
    return query
      select ur.user_id,p.full_name,p.phone,
        coalesce(custom.commission_percent,default_rule.commission_percent,20.00)::numeric,
        custom.captain_id is not null
      from public.user_roles ur
      left join public.profiles p on p.id=ur.user_id
      left join public.captain_commission_rules custom on custom.captain_id=ur.user_id
      left join public.captain_commission_rules default_rule on default_rule.captain_id is null
      where ur.role::text='captain'
      order by lower(coalesce(p.full_name,p.phone,ur.user_id::text));
  else
    return query
      select ur.user_id,p.full_name,p.phone,
        coalesce(custom.commission_percent,default_rule.commission_percent,20.00)::numeric,
        custom.captain_id is not null
      from public.user_roles ur
      left join public.profiles p on p.id=ur.user_id
      left join public.captain_commission_rules custom on custom.captain_id=ur.user_id
      left join public.captain_commission_rules default_rule on default_rule.captain_id is null
      where ur.role::text='captain' and ur.user_id=auth.uid();
  end if;
end;
$function$;
revoke all on function public.get_captain_commission_overview() from public,anon;
grant execute on function public.get_captain_commission_overview() to authenticated;

create or replace function public.set_captain_commission_percent(p_captain_id uuid,p_percent numeric)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_rule public.captain_commission_rules%rowtype;
begin
  if auth.uid() is null or not private.has_permission('wallets.manage') then
    raise exception using errcode='42501',message='Only the Super Admin may change captain commission rates';
  end if;
  if p_percent is not null and (p_percent<0 or p_percent>100 or p_percent<>round(p_percent,2)) then
    raise exception using errcode='22023',message='Commission percentage must be between 0 and 100 with at most two decimal places';
  end if;
  if p_captain_id is null then
    if p_percent is null then raise exception using errcode='22023',message='The global default commission cannot be empty'; end if;
    update public.captain_commission_rules set commission_percent=p_percent,updated_by=auth.uid(),updated_at=now()
    where captain_id is null returning * into v_rule;
    if not found then
      insert into public.captain_commission_rules(captain_id,commission_percent,updated_by)
      values(null,p_percent,auth.uid()) returning * into v_rule;
    end if;
  else
    if not exists(select 1 from public.user_roles ur where ur.user_id=p_captain_id and ur.role::text='captain') then
      raise exception using errcode='22023',message='The selected account is not a captain';
    end if;
    if p_percent is null then
      delete from public.captain_commission_rules where captain_id=p_captain_id;
      insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
      values(auth.uid(),'captain.commission.reset','captain_commission_rule',p_captain_id::text,jsonb_build_object('uses_default',true));
      return jsonb_build_object('captain_id',p_captain_id,'uses_default',true);
    end if;
    update public.captain_commission_rules set commission_percent=p_percent,updated_by=auth.uid(),updated_at=now()
    where captain_id=p_captain_id returning * into v_rule;
    if not found then
      insert into public.captain_commission_rules(captain_id,commission_percent,updated_by)
      values(p_captain_id,p_percent,auth.uid()) returning * into v_rule;
    end if;
  end if;
  insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
  values(auth.uid(),'captain.commission.updated','captain_commission_rule',coalesce(v_rule.captain_id,'00000000-0000-0000-0000-000000000000'::uuid)::text,
    jsonb_build_object('captain_id',v_rule.captain_id,'commission_percent',v_rule.commission_percent));
  return jsonb_build_object('captain_id',v_rule.captain_id,'commission_percent',v_rule.commission_percent,'uses_default',v_rule.captain_id is null);
end;
$function$;
revoke all on function public.set_captain_commission_percent(uuid,numeric) from public,anon;
grant execute on function public.set_captain_commission_percent(uuid,numeric) to authenticated;

-- Same atomic reservation/release logic as the wallet migration, now using
-- the rate configured for the assigned captain or the global default.
create or replace function private.reserve_captain_delivery_commission_before()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_type text;
  v_id uuid;
  v_captain uuid;
  v_old_captain uuid;
  v_fee bigint:=0;
  v_commission bigint:=0;
  v_percent numeric(5,2):=20;
  v_balance bigint;
  v_held bigint;
  v_hold public.captain_delivery_commission_holds%rowtype;
  v_terminal boolean:=false;
  v_start boolean:=false;
begin
  if tg_table_name='deliveries' then
    v_type:='store_delivery'; v_id:=new.id; v_captain:=new.captain_id;
    v_fee:=coalesce((select round(o.delivery_fee_iqd,0)::bigint from public.orders o where o.id=new.order_id),0);
    v_terminal:=new.status::text in ('failed','cancelled');
  elsif tg_table_name='food_post_orders' then
    v_type:='food_post'; v_id:=new.id; v_captain:=new.captain_id; v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  elsif tg_table_name='apparel_post_orders' then
    v_type:='apparel_post'; v_id:=new.id; v_captain:=new.captain_id; v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  else
    v_type:='product_post'; v_id:=new.id; v_captain:=new.captain_id; v_fee:=round(coalesce(new.delivery_fee_iqd,0))::bigint;
    v_terminal:=new.delivery_status in ('failed','cancelled') or new.status in ('failed','cancelled','rejected');
  end if;

  if tg_op='UPDATE' then v_old_captain:=old.captain_id; end if;
  v_start:=(tg_op='INSERT' and v_captain is not null)
       or (tg_op='UPDATE' and v_old_captain is distinct from v_captain and v_captain is not null);

  if v_start then
    select * into v_hold from public.captain_delivery_commission_holds where order_type=v_type and order_id=v_id for update;
    if found and v_hold.status='charged' then raise exception 'A completed delivery cannot be reassigned'; end if;
    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;
      if v_hold.commission_iqd>0 then
        insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
        values(v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,'کۆمسیۆنی کاپتنی پێشوو ئازادکرا');
      end if;
      update public.captain_delivery_commission_holds set status='released',settled_at=now() where id=v_hold.id;
    end if;
    v_percent:=private.captain_delivery_commission_percent(v_captain);
    v_commission:=round(v_fee*v_percent/100,0)::bigint;
    insert into public.prepaid_wallet_accounts(user_id) values(v_captain) on conflict(user_id) do nothing;
    select balance_iqd,held_iqd into v_balance,v_held from public.prepaid_wallet_accounts where user_id=v_captain for update;
    if v_balance-v_held<v_commission then
      raise exception using errcode='22023',message='باڵانسی پریپەیدی کاپتن بۆ کۆمسیۆنی ئەم گەیاندنە بەس نییە؛ پێش وەرگرتنی ئۆردەر جزدانەکە پڕ بکەرەوە.';
    end if;
    if v_commission>0 then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd+v_commission,updated_at=now() where user_id=v_captain;
      insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
      values(v_captain,'hold',v_commission,v_type,v_id,'کۆمسیۆنی ڕێککەوتوو تا تەواوبوونی ئۆردەر گیرا');
    end if;
    insert into public.captain_delivery_commission_holds(captain_id,order_type,order_id,delivery_fee_iqd,commission_iqd,status)
    values(v_captain,v_type,v_id,v_fee,v_commission,'reserved')
    on conflict(order_type,order_id) do update set captain_id=excluded.captain_id,delivery_fee_iqd=excluded.delivery_fee_iqd,commission_iqd=excluded.commission_iqd,status='reserved',created_at=now(),settled_at=null;
    return new;
  end if;

  if v_terminal or v_captain is null then
    select * into v_hold from public.captain_delivery_commission_holds where order_type=v_type and order_id=v_id for update;
    if found and v_hold.status='reserved' then
      update public.prepaid_wallet_accounts set held_iqd=held_iqd-v_hold.commission_iqd,updated_at=now()
      where user_id=v_hold.captain_id and held_iqd>=v_hold.commission_iqd;
      if not found then raise exception 'Captain commission reservation is inconsistent'; end if;
      if v_hold.commission_iqd>0 then
        insert into public.prepaid_wallet_transactions(user_id,transaction_type,amount_iqd,reference_type,reference_id,description_ku)
        values(v_hold.captain_id,'hold_release',v_hold.commission_iqd,v_type,v_id,'کۆمسیۆنی گەیاندنی هەڵوەشاوە ئازادکرا');
      end if;
      update public.captain_delivery_commission_holds set status='released',settled_at=now() where id=v_hold.id;
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.reserve_captain_delivery_commission_before() from public,anon,authenticated;

notify pgrst,'reload schema';
