-- Prevent an expired supermarket product/variant from entering a checkout order.
-- Reject checkout lines for expired product lots, even if they were placed in a cart earlier.
-- A raised exception rolls back the checkout function's stock deductions and order inserts.
create or replace function private.reject_expired_product_order_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_product_expiry date;
  v_variant_expiry date;
begin
  select p.expiry_date into v_product_expiry
  from public.products p
  where p.id = new.product_id;

  if v_product_expiry is not null and v_product_expiry < current_date then
    raise exception 'Product is expired';
  end if;

  if new.variant_id is not null then
    select pv.expiry_date into v_variant_expiry
    from public.product_variants pv
    where pv.id = new.variant_id and pv.product_id = new.product_id;

    if v_variant_expiry is not null and v_variant_expiry < current_date then
      raise exception 'Product variant is expired';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.reject_expired_product_order_item() from public, anon, authenticated;
drop trigger if exists order_item_reject_expired_product on public.order_items;
create trigger order_item_reject_expired_product
before insert on public.order_items
for each row execute function private.reject_expired_product_order_item();
