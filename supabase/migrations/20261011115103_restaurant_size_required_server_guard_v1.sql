-- Enforce restaurant size selection at the database boundary, not only in the UI.
-- If a restaurant item has active size variants, cart/order writes must reference one.
create or replace function private.guard_restaurant_variant_selection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_has_active_variants boolean;
begin
  if new.product_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.restaurant_menu_details d
    where d.product_id = new.product_id
  ) then
    return new;
  end if;

  select exists (
    select 1
    from public.product_variants pv
    where pv.product_id = new.product_id
      and pv.is_active
  ) into v_has_active_variants;

  if v_has_active_variants then
    if new.variant_id is null then
      raise exception using
        errcode = '23514',
        message = 'Restaurant item requires a selected size';
    end if;

    if not exists (
      select 1
      from public.product_variants pv
      where pv.id = new.variant_id
        and pv.product_id = new.product_id
        and pv.is_active
    ) then
      raise exception using
        errcode = '23514',
        message = 'Selected restaurant size is not available';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_restaurant_variant_selection() from public, anon, authenticated;

drop trigger if exists cart_items_restaurant_size_guard on public.cart_items;
create trigger cart_items_restaurant_size_guard
before insert or update of product_id, variant_id on public.cart_items
for each row execute function private.guard_restaurant_variant_selection();

drop trigger if exists order_items_restaurant_size_guard on public.order_items;
create trigger order_items_restaurant_size_guard
before insert on public.order_items
for each row execute function private.guard_restaurant_variant_selection();
