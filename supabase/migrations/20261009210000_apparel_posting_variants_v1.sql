-- Apparel posting foundation for SHAKH Delivery.
-- Additive only: preserves existing post columns, categories, routes, auth, and permissions.

alter table public.posts
  add column if not exists apparel_type text,
  add column if not exists brand text,
  add column if not exists material text,
  add column if not exists country_of_origin text,
  add column if not exists season text,
  add column if not exists discount_percent integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_apparel_type_valid') then
    alter table public.posts add constraint posts_apparel_type_valid check (
      apparel_type is null or apparel_type in (
        'mens_clothing','womens_clothing','kids_clothing',
        'mens_shoes','womens_shoes','kids_shoes','bags',
        'sportswear','home_textiles','beauty_fashion_accessories','other_accessories'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_apparel_season_valid') then
    alter table public.posts add constraint posts_apparel_season_valid
      check (season is null or season in ('summer','winter','all_seasons'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_discount_percent_valid') then
    alter table public.posts add constraint posts_discount_percent_valid
      check (discount_percent between 0 and 99);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_apparel_text_lengths_valid') then
    alter table public.posts add constraint posts_apparel_text_lengths_valid check (
      (brand is null or char_length(brand) <= 120)
      and (material is null or char_length(material) <= 160)
      and (country_of_origin is null or char_length(country_of_origin) <= 100)
    );
  end if;
end $$;

create table if not exists public.apparel_variants (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  color_name text not null check (char_length(btrim(color_name)) between 1 and 60),
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  size_label text not null check (char_length(btrim(size_label)) between 1 and 40),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  price_iqd numeric(14,2) null check (price_iqd is null or price_iqd > 0),
  image_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apparel_variants_post_color_size_unique unique (post_id, color_hex, size_label)
);

create index if not exists apparel_variants_post_idx
  on public.apparel_variants(post_id, color_name, size_label);

alter table public.apparel_variants enable row level security;

drop policy if exists apparel_variants_select_scoped on public.apparel_variants;
create policy apparel_variants_select_scoped
on public.apparel_variants for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (
        p.status = 'active'
        or p.author_id = (select auth.uid())
        or (select private.has_permission('posts.manage'))
      )
  )
);

drop policy if exists apparel_variants_insert_scoped on public.apparel_variants;
create policy apparel_variants_insert_scoped
on public.apparel_variants for insert to authenticated
with check (
  (select private.has_permission('posts.create'))
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  )
);

drop policy if exists apparel_variants_update_scoped on public.apparel_variants;
create policy apparel_variants_update_scoped
on public.apparel_variants for update to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (
        p.author_id = (select auth.uid())
        or (select private.has_permission('posts.manage'))
      )
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (
        p.author_id = (select auth.uid())
        or (select private.has_permission('posts.manage'))
      )
  )
);

drop policy if exists apparel_variants_delete_scoped on public.apparel_variants;
create policy apparel_variants_delete_scoped
on public.apparel_variants for delete to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_id
      and (
        p.author_id = (select auth.uid())
        or (select private.has_permission('posts.manage'))
      )
  )
);

grant select, insert, update, delete on public.apparel_variants to authenticated;

drop trigger if exists apparel_variants_set_updated_at on public.apparel_variants;
create trigger apparel_variants_set_updated_at
before update on public.apparel_variants
for each row execute function public.set_updated_at();

-- Fashion posts are first saved as archived by the frontend, then published only
-- after photos and real color/size/stock combinations have been saved successfully.
create or replace function private.validate_apparel_post_before_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_variant_count integer;
  v_total_stock integer;
begin
  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'active' then
    return new;
  end if;

  if new.category = 'fashion'::public.post_category and new.status = 'active'::public.post_status then
    if new.apparel_type is null then
      raise exception 'Choose an apparel product type';
    end if;
    if new.price_iqd is null or new.price_iqd <= 0 then
      raise exception 'Apparel price must be greater than zero';
    end if;
    if jsonb_typeof(new.images) is distinct from 'array'
       or jsonb_array_length(new.images) < 1
       or jsonb_array_length(new.images) > 8 then
      raise exception 'Apparel posts require between 1 and 8 images';
    end if;

    select count(*), coalesce(sum(av.stock_quantity), 0)::integer
      into v_variant_count, v_total_stock
    from public.apparel_variants av
    where av.post_id = new.id;

    if v_variant_count < 1 or v_total_stock < 1 then
      raise exception 'Add at least one in-stock color and size combination before publishing';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_apparel_post_before_publish() from public, anon, authenticated;

drop trigger if exists posts_validate_apparel_publish on public.posts;
create trigger posts_validate_apparel_publish
before insert or update on public.posts
for each row execute function private.validate_apparel_post_before_publish();

-- Separate media bucket keeps post photos isolated from catalog product photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_media_owner_insert on storage.objects;
create policy post_media_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-media'
  and (select private.has_permission('posts.create'))
  and (storage.foldername(name))[1] = 'posts'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists post_media_owner_update on storage.objects;
create policy post_media_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'post-media'
  and (select private.has_permission('posts.create'))
  and (storage.foldername(name))[1] = 'posts'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'post-media'
  and (select private.has_permission('posts.create'))
  and (storage.foldername(name))[1] = 'posts'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists post_media_owner_delete on storage.objects;
create policy post_media_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'post-media'
  and (
    (select private.has_permission('posts.manage'))
    or (
      (select private.has_permission('posts.delete_own'))
      and (storage.foldername(name))[1] = 'posts'
      and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
);

-- Realtime refreshes active post listings and the selected apparel combinations.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
    ) then
      execute 'alter publication supabase_realtime add table public.posts';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apparel_variants'
    ) then
      execute 'alter publication supabase_realtime add table public.apparel_variants';
    end if;
  end if;
end $$;
