-- Finance records are kept separate from money that is collected on behalf of
-- captains and sellers. Provider options exist but remain disabled until an
-- administrator explicitly configures and enables them.

create table if not exists public.payment_provider_settings (
  provider text primary key check (provider in ('fib','fastpay')),
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint payment_provider_settings_disabled_initially check (is_enabled = false)
);

insert into public.payment_provider_settings(provider, is_enabled)
values ('fib', false), ('fastpay', false)
on conflict (provider) do nothing;

alter table public.payment_provider_settings enable row level security;
revoke all on public.payment_provider_settings from anon, authenticated;

create table if not exists public.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete restrict,
  entry_kind text not null check (entry_kind in ('captain_earning','seller_sale','platform_delivery_fee','platform_sale_fee','listing_fee','payout','refund','adjustment')),
  amount_iqd numeric(14,2) not null check (amount_iqd > 0),
  status text not null default 'pending' check (status in ('pending','paid','reversed')),
  source_table text not null,
  source_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (entry_kind, source_table, source_id, owner_id)
);

create index if not exists financial_ledger_entries_owner_status_created_idx
  on public.financial_ledger_entries(owner_id, status, created_at desc);
create index if not exists financial_ledger_entries_kind_created_idx
  on public.financial_ledger_entries(entry_kind, created_at desc);
create unique index if not exists financial_ledger_entries_idempotent_source_idx
  on public.financial_ledger_entries(entry_kind, source_table, source_id,
    coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.financial_ledger_entries enable row level security;
revoke all on public.financial_ledger_entries from anon, authenticated;
grant select on public.financial_ledger_entries to authenticated;
grant update (status) on public.financial_ledger_entries to authenticated;

create policy financial_ledger_select_owner_or_super_admin
  on public.financial_ledger_entries for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select private.has_role((select auth.uid()), 'super_admin'::public.app_role))
  );

create policy financial_ledger_update_super_admin
  on public.financial_ledger_entries for update to authenticated
  using ((select private.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select private.has_role((select auth.uid()), 'super_admin'::public.app_role)));

-- Keep the ledger append-only through the Data API. Controlled database
-- functions/triggers can insert entries as part of order/payment transactions.
create or replace function private.prevent_financial_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode='42501', message='Financial ledger entries are immutable';
end;
$$;

drop trigger if exists financial_ledger_entries_immutable on public.financial_ledger_entries;
create trigger financial_ledger_entries_immutable
before delete on public.financial_ledger_entries
for each row execute function private.prevent_financial_ledger_mutation();

create or replace function private.guard_financial_ledger_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.entry_kind is distinct from old.entry_kind
    or new.amount_iqd is distinct from old.amount_iqd
    or new.source_table is distinct from old.source_table
    or new.source_id is distinct from old.source_id
    or new.note is distinct from old.note
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode='42501', message='Financial ledger amounts and sources are immutable';
  end if;
  if old.status <> 'pending' or new.status not in ('paid','reversed') then
    raise exception using errcode='42501', message='Ledger status may only move from pending to paid or reversed';
  end if;
  return new;
end;
$$;

create trigger financial_ledger_entries_guard_update
before update on public.financial_ledger_entries
for each row execute function private.guard_financial_ledger_update();

-- Once cash has actually been recorded, create an immutable allocation for
-- the seller, captain, and platform. Six 1,000 IQD delivery charges produce
-- 1,500 IQD platform share and 4,500 IQD captain share (25% / 75%).
create or replace function private.allocate_food_post_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.food_post_orders%rowtype;
  v_platform_delivery numeric(14,2);
  v_captain_delivery numeric(14,2);
begin
  select * into v_order
  from public.food_post_orders
  where id = new.order_id;
  if not found then return new; end if;

  v_platform_delivery := round(v_order.delivery_fee_iqd * 0.25, 2);
  v_captain_delivery := v_order.delivery_fee_iqd - v_platform_delivery;

  if v_order.seller_id is not null and v_order.line_total_iqd > 0 then
    insert into public.financial_ledger_entries(owner_id, entry_kind, amount_iqd, source_table, source_id, note)
    values (v_order.seller_id, 'seller_sale', v_order.line_total_iqd, 'food_post_orders', v_order.id, v_order.order_number)
    on conflict do nothing;
  end if;
  if v_order.captain_id is not null and v_captain_delivery > 0 then
    insert into public.financial_ledger_entries(owner_id, entry_kind, amount_iqd, source_table, source_id, note)
    values (v_order.captain_id, 'captain_earning', v_captain_delivery, 'food_post_orders', v_order.id, v_order.order_number)
    on conflict do nothing;
  end if;
  if v_platform_delivery > 0 then
    insert into public.financial_ledger_entries(entry_kind, amount_iqd, source_table, source_id, note)
    values ('platform_delivery_fee', v_platform_delivery, 'food_post_orders', v_order.id, v_order.order_number)
    on conflict do nothing;
  end if;
  if v_order.platform_fee_iqd > 0 then
    insert into public.financial_ledger_entries(entry_kind, amount_iqd, source_table, source_id, note)
    values ('platform_sale_fee', v_order.platform_fee_iqd, 'food_post_orders', v_order.id, v_order.order_number)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists food_post_payment_financial_allocation on public.food_post_payment_events;
create trigger food_post_payment_financial_allocation
after insert on public.food_post_payment_events
for each row execute function private.allocate_food_post_payment();

create or replace function private.allocate_checkout_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_seller_id uuid;
  v_captain_id uuid;
  v_platform_delivery numeric(14,2);
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;
  for v_order in
    select o.* from public.orders o
    where o.checkout_session_id = new.checkout_session_id
  loop
    select s.owner_id into v_seller_id from public.stores s where s.id = v_order.store_id;
    select d.captain_id into v_captain_id from public.deliveries d
    where d.order_id = v_order.id and d.status = 'delivered'
    order by d.delivered_at desc nulls last limit 1;
    v_platform_delivery := round(v_order.delivery_fee_iqd * 0.25, 2);

    if v_seller_id is not null and v_order.subtotal_iqd > 0 then
      insert into public.financial_ledger_entries(owner_id, entry_kind, amount_iqd, source_table, source_id, note)
      values (v_seller_id, 'seller_sale', v_order.subtotal_iqd, 'orders', v_order.id, v_order.order_number)
      on conflict do nothing;
    end if;
    if v_captain_id is not null and v_order.delivery_fee_iqd > v_platform_delivery then
      insert into public.financial_ledger_entries(owner_id, entry_kind, amount_iqd, source_table, source_id, note)
      values (v_captain_id, 'captain_earning', v_order.delivery_fee_iqd - v_platform_delivery, 'orders', v_order.id, v_order.order_number)
      on conflict do nothing;
    end if;
    if v_platform_delivery > 0 then
      insert into public.financial_ledger_entries(entry_kind, amount_iqd, source_table, source_id, note)
      values ('platform_delivery_fee', v_platform_delivery, 'orders', v_order.id, v_order.order_number)
      on conflict do nothing;
    end if;
    if v_order.platform_fee_iqd > 0 then
      insert into public.financial_ledger_entries(entry_kind, amount_iqd, source_table, source_id, note)
      values ('platform_sale_fee', v_order.platform_fee_iqd, 'orders', v_order.id, v_order.order_number)
      on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists payments_financial_allocation on public.payments;
create trigger payments_financial_allocation
after update of status on public.payments
for each row execute function private.allocate_checkout_payment();

comment on table public.payment_provider_settings is
  'FIB and FastPay are intentionally disabled; activation requires a separate approved configuration.';
comment on table public.financial_ledger_entries is
  'Append-only IQD receivables, earnings, fees, refunds and payouts; never treat seller/captain payables as platform profit.';

insert into public.permissions(code, description)
values ('payments.view', 'View role-scoped IQD financial ledger and balances')
on conflict (code) do update set description=excluded.description;

insert into public.role_permissions(role, permission_code)
select role_value::public.app_role, 'payments.view'
from (values ('captain'),('restaurant_vendor'),('fashion_vendor'),('car_dealer'),('umrah_agency'),('supermarket_vendor'),('super_admin')) as roles(role_value)
on conflict do nothing;

