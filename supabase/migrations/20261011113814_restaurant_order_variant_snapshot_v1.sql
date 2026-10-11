-- Preserve the chosen variant label on the order line itself.
-- This is additive: existing order, cart, checkout and delivery tables remain intact.
alter table public.order_items
  add column if not exists variant_name_ku_snapshot text;

-- Backfill order history while the linked variant row is still available.
update public.order_items oi
set variant_name_ku_snapshot = pv.name_ku
from public.product_variants pv
where oi.variant_id = pv.id
  and oi.variant_name_ku_snapshot is null;

create or replace function private.snapshot_order_item_variant_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.variant_id is not null then
    select pv.name_ku
      into new.variant_name_ku_snapshot
    from public.product_variants pv
    where pv.id = new.variant_id
      and (new.product_id is null or pv.product_id = new.product_id);

    if not found then
      new.variant_name_ku_snapshot := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.snapshot_order_item_variant_name() from public, anon, authenticated;

drop trigger if exists order_items_snapshot_variant_name on public.order_items;
create trigger order_items_snapshot_variant_name
before insert on public.order_items
for each row execute function private.snapshot_order_item_variant_name();
