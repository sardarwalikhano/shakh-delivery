-- Product image storage for real catalog media.
-- Public read is intentional for active marketplace product images; writes remain permission-scoped.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_media_authenticated_insert" on storage.objects;
drop policy if exists "product_media_authenticated_update" on storage.objects;
drop policy if exists "product_media_authenticated_delete" on storage.objects;

create policy "product_media_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-media'
  and (select private.has_permission('products.manage'))
  and (storage.foldername(name))[1] = 'products'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.has_permission('vendors.manage'))
  )
);

create policy "product_media_authenticated_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-media'
  and (select private.has_permission('products.manage'))
  and (storage.foldername(name))[1] = 'products'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.has_permission('vendors.manage'))
  )
)
with check (
  bucket_id = 'product-media'
  and (select private.has_permission('products.manage'))
  and (storage.foldername(name))[1] = 'products'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.has_permission('vendors.manage'))
  )
);

create policy "product_media_authenticated_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-media'
  and (select private.has_permission('products.manage'))
  and (storage.foldername(name))[1] = 'products'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select private.has_permission('vendors.manage'))
  )
);
