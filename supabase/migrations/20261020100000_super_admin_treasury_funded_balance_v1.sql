-- Treasury ledger foundation: nominal opening balance is NOT real money.
-- No existing wallet balances, orders, rewards, or payouts are modified.
-- Actual funded balance starts at zero and may only increase through a separately
-- verified funding workflow. Payout integrations must debit funded_iqd, never nominal_iqd.

create table if not exists public.super_admin_treasury (
  id boolean primary key default true check (id = true),
  nominal_opening_iqd bigint not null default 1000000000 check (nominal_opening_iqd >= 0),
  funded_iqd bigint not null default 0 check (funded_iqd >= 0),
  reserved_iqd bigint not null default 0 check (reserved_iqd >= 0 and reserved_iqd <= funded_iqd),
  currency_code text not null default 'IQD' check (currency_code = 'IQD'),
  funding_status text not null default 'unfunded'
    check (funding_status in ('unfunded','partially_funded','funded')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.super_admin_treasury
  (id, nominal_opening_iqd, funded_iqd, reserved_iqd, currency_code, funding_status)
values (true, 1000000000, 0, 0, 'IQD', 'unfunded')
on conflict (id) do nothing;

create table if not exists public.super_admin_treasury_ledger (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in','out','reserve','release')),
  amount_iqd bigint not null check (amount_iqd > 0),
  funding_source text,
  reference_type text not null,
  reference_id uuid,
  idempotency_key text not null unique,
  description_ku text not null,
  evidence_path text,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint super_admin_treasury_ledger_funding_source_check
    check (funding_source is null or funding_source in ('cash_verified','bank_verified','mobile_cash_verified','other_verified'))
);

alter table public.super_admin_treasury enable row level security;
alter table public.super_admin_treasury_ledger enable row level security;

drop policy if exists super_admin_treasury_read_manage on public.super_admin_treasury;
create policy super_admin_treasury_read_manage
  on public.super_admin_treasury for select to authenticated
  using (private.has_permission('wallets.manage'));

drop policy if exists super_admin_treasury_ledger_read_manage on public.super_admin_treasury_ledger;
create policy super_admin_treasury_ledger_read_manage
  on public.super_admin_treasury_ledger for select to authenticated
  using (private.has_permission('wallets.manage'));

revoke insert, update, delete, truncate, references, trigger on public.super_admin_treasury from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.super_admin_treasury_ledger from anon, authenticated;
grant select on public.super_admin_treasury, public.super_admin_treasury_ledger to authenticated;

create or replace view public.super_admin_treasury_status
with (security_invoker = true)
as
select
  nominal_opening_iqd,
  funded_iqd,
  reserved_iqd,
  greatest(funded_iqd - reserved_iqd, 0)::bigint as available_funded_iqd,
  greatest(nominal_opening_iqd - funded_iqd, 0)::bigint as unfunded_nominal_iqd,
  currency_code,
  funding_status,
  updated_at
from public.super_admin_treasury
where id = true;

revoke all on public.super_admin_treasury_status from public, anon;
grant select on public.super_admin_treasury_status to authenticated;

comment on table public.super_admin_treasury is
  'Treasury control totals. nominal_opening_iqd is planning-only and is never spendable; funded_iqd represents verified real funds.';
comment on column public.super_admin_treasury.nominal_opening_iqd is
  'Nominal opening target only. Must never be treated as real cash or wallet backing.';
comment on column public.super_admin_treasury.funded_iqd is
  'Verified real IQD available to back payouts and prepaid credits; initialized to zero.';
comment on table public.super_admin_treasury_ledger is
  'Append-only treasury movements with unique idempotency keys and optional evidence. Mutations require controlled SECURITY DEFINER workflows.';
