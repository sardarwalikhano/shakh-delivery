-- Shakh Home & Living listing fees.
-- This config is additive and does not modify existing posts or financial ledgers.
begin;

create table if not exists public.post_category_fee_settings (
  category public.post_category not null,
  listing_kind text not null,
  fee_iqd numeric(14,2) not null check (fee_iqd >= 0),
  updated_at timestamptz not null default now(),
  primary key (category, listing_kind)
);

insert into public.post_category_fee_settings(category, listing_kind, fee_iqd)
values
  ('home_living'::public.post_category, 'property', 5000),
  ('home_living'::public.post_category, 'furniture', 2000)
on conflict (category, listing_kind)
do update set fee_iqd = excluded.fee_iqd, updated_at = now();

alter table public.post_category_fee_settings enable row level security;
revoke all on public.post_category_fee_settings from public, anon, authenticated;
grant select on public.post_category_fee_settings to authenticated;

drop policy if exists post_category_fee_settings_read_authenticated on public.post_category_fee_settings;
create policy post_category_fee_settings_read_authenticated
  on public.post_category_fee_settings for select to authenticated
  using (true);

commit;
