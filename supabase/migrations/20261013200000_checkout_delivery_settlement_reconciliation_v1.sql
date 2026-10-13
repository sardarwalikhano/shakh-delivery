-- Reconcile the captain share when online payment was recorded before
-- the delivery was completed and its final captain became known.

create or replace function private.allocate_checkout_captain_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_platform_delivery numeric(14,2);
begin
  if new.status <> 'delivered' or new.captain_id is null then
    return new;
  end if;

  -- Only settle on the first transition into delivered. Replaying updates is
  -- safe through this guard and the ledger's idempotency key.
  if tg_op = 'UPDATE' and old.status = 'delivered' then
    return new;
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = new.order_id;
  if not found or v_order.checkout_session_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.payments p
    where p.checkout_session_id = v_order.checkout_session_id
      and p.status = 'paid'
  ) then
    return new;
  end if;

  v_platform_delivery := round(v_order.delivery_fee_iqd * 0.25, 2);
  if v_order.delivery_fee_iqd > v_platform_delivery then
    insert into public.financial_ledger_entries(
      owner_id, entry_kind, amount_iqd, source_table, source_id, note
    )
    values (
      new.captain_id,
      'captain_earning',
      v_order.delivery_fee_iqd - v_platform_delivery,
      'orders',
      v_order.id,
      v_order.order_number
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_checkout_captain_settlement on public.deliveries;
create trigger deliveries_checkout_captain_settlement
after insert or update of status, captain_id on public.deliveries
for each row execute function private.allocate_checkout_captain_on_delivery();
