-- Admin-only global catalog moderation and aggregate stock correctness.
-- Vendor ownership policies continue to define seller-scoped writes.
-- Correct admin-wide catalog policies: seller permission alone is not sufficient for global access.
drop policy if exists products_permission_manage on public.products;
create policy products_permission_manage on public.products
for all to authenticated
using (
  (select private.has_permission('products.manage'))
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin','super_admin')
  )
)
with check (
  (select private.has_permission('products.manage'))
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin','super_admin')
  )
);

drop policy if exists product_variants_permission_manage on public.product_variants;
create policy product_variants_permission_manage on public.product_variants
for all to authenticated
using (
  (select private.has_permission('products.manage'))
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin','super_admin')
  )
)
with check (
  (select private.has_permission('products.manage'))
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin','super_admin')
  )
);

drop policy if exists product_images_permission_manage on public.product_images;
create policy product_images_permission_manage on public.product_images
for all to authenticated
using (
  (select private.has_permission('products.manage'))
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin','super_admin')
  )
)
with check (
  (select private.has_permission('products.manage'))
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin','super_admin')
  )
);

create or replace function private.sync_product_stock_from_variants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_product_id uuid;
begin
  if tg_op = 'DELETE' then
    v_product_id := old.product_id;
  else
    v_product_id := new.product_id;
  end if;

  update public.products p
    set stock_quantity = (
      select coalesce(sum(pv.stock_quantity), 0)::integer
      from public.product_variants pv
      where pv.product_id = v_product_id and pv.is_active = true
    )
  where p.id = v_product_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.sync_product_stock_from_variants() from public, anon, authenticated;
