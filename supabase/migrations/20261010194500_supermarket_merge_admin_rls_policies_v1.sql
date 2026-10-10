-- Merge admin moderation into existing RLS policies, preserving owner scope.
-- Merge global admin privileges into existing policies to avoid broad permissive-policy overlap.
-- Admin-wide predicates are tied to admin roles, not the vendor-shared products.manage permission.
drop policy if exists products_permission_manage on public.products;
drop policy if exists products_select_public_or_owner on public.products;
drop policy if exists products_vendor_owner_insert on public.products;
drop policy if exists products_vendor_owner_update on public.products;
drop policy if exists products_vendor_owner_delete on public.products;

create policy products_select_public_or_owner on public.products
for select to anon, authenticated
using (
  (status = 'active'::public.product_status and exists (
    select 1 from public.stores s where s.id = products.store_id and s.status = 'active'::public.store_status
  ))
  or exists (
    select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = products.store_id and s.owner_id = (select auth.uid())
      and ur.role = any (array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['admin'::public.app_role,'super_admin'::public.app_role])
  )
);

create policy products_vendor_owner_insert on public.products
for insert to authenticated
with check (
  (status = 'draft'::public.product_status and exists (
    select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = products.store_id and s.owner_id = (select auth.uid())
      and ur.role = any (array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any (array['admin'::public.app_role,'super_admin'::public.app_role])
      and (select private.has_permission('products.manage'))
  )
);

create policy products_vendor_owner_update on public.products
for update to authenticated
using (
  exists (
    select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = products.store_id and s.owner_id = (select auth.uid())
      and ur.role = any (array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
      and (select private.has_permission('products.manage'))
  )
)
with check (
  exists (
    select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = products.store_id and s.owner_id = (select auth.uid())
      and ur.role = any (array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
      and (select private.has_permission('products.manage'))
  )
);

create policy products_vendor_owner_delete on public.products
for delete to authenticated
using (
  (status = 'draft'::public.product_status and exists (
    select 1 from public.stores s join public.user_roles ur on ur.user_id = s.owner_id
    where s.id = products.store_id and s.owner_id = (select auth.uid())
      and ur.role = any (array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
      and (select private.has_permission('products.manage'))
  )
);

drop policy if exists product_variants_permission_manage on public.product_variants;
drop policy if exists product_variants_select_public_or_owner on public.product_variants;
drop policy if exists product_variants_owner_insert on public.product_variants;
drop policy if exists product_variants_owner_update on public.product_variants;
drop policy if exists product_variants_owner_delete on public.product_variants;

create policy product_variants_select_public_or_owner on public.product_variants
for select to anon, authenticated
using (
  (is_active and exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_variants.product_id and p.status='active'::public.product_status and s.status='active'::public.store_status
  ))
  or exists (
    select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_variants.product_id and s.owner_id=(select auth.uid())
  )
  or exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
  )
);

create policy product_variants_owner_insert on public.product_variants
for insert to authenticated
with check (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_variants.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
);

create policy product_variants_owner_update on public.product_variants
for update to authenticated
using (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_variants.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
)
with check (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_variants.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
);

create policy product_variants_owner_delete on public.product_variants
for delete to authenticated
using (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_variants.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
);

drop policy if exists product_images_permission_manage on public.product_images;
drop policy if exists product_images_select_public_or_owner on public.product_images;
drop policy if exists product_images_owner_insert on public.product_images;
drop policy if exists product_images_owner_update on public.product_images;
drop policy if exists product_images_owner_delete on public.product_images;

create policy product_images_select_public_or_owner on public.product_images
for select to anon, authenticated
using (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_images.product_id and p.status='active'::public.product_status and s.status='active'::public.store_status)
  or exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_images.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role]))
);

create policy product_images_owner_insert on public.product_images
for insert to authenticated
with check (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_images.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
);

create policy product_images_owner_update on public.product_images
for update to authenticated
using (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_images.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
)
with check (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_images.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
);

create policy product_images_owner_delete on public.product_images
for delete to authenticated
using (
  exists (select 1 from public.products p join public.stores s on s.id=p.store_id
    where p.id=product_images.product_id and s.owner_id=(select auth.uid()))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('products.manage')))
);

drop policy if exists stores_permission_manage on public.stores;
drop policy if exists stores_select_public_or_owner on public.stores;
drop policy if exists stores_vendor_owner_insert on public.stores;
drop policy if exists stores_vendor_owner_update on public.stores;
drop policy if exists stores_vendor_owner_delete on public.stores;

create policy stores_select_public_or_owner on public.stores
for select to anon, authenticated
using (
  status='active'::public.store_status
  or ((select auth.uid())=owner_id and exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('vendors.manage')))
);

create policy stores_vendor_owner_insert on public.stores
for insert to authenticated
with check (
  ((select auth.uid())=owner_id and status='pending'::public.store_status and exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('vendors.manage')))
);

create policy stores_vendor_owner_update on public.stores
for update to authenticated
using (
  ((select auth.uid())=owner_id and exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('vendors.manage')))
)
with check (
  ((select auth.uid())=owner_id and exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('vendors.manage')))
);

create policy stores_vendor_owner_delete on public.stores
for delete to authenticated
using (
  ((select auth.uid())=owner_id and status='pending'::public.store_status and exists (
    select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
      and ur.role=any(array['restaurant_vendor'::public.app_role,'fashion_vendor'::public.app_role,'car_dealer'::public.app_role,'umrah_agency'::public.app_role])
  ))
  or exists (select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.role=any(array['admin'::public.app_role,'super_admin'::public.app_role])
    and (select private.has_permission('vendors.manage')))
);
