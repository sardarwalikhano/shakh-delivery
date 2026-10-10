-- Additive apparel catalogue support. Existing products, variants and access policies remain intact.
alter table public.products
  add column if not exists apparel_product_type text,
  add column if not exists brand text,
  add column if not exists material text,
  add column if not exists country_of_origin text,
  add column if not exists season text,
  add column if not exists seller_location text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_apparel_product_type_valid'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_apparel_product_type_valid
      check (
        apparel_product_type is null
        or apparel_product_type in (
          'mens_clothing','womens_clothing','kids_clothing',
          'mens_shoes','womens_shoes','kids_shoes',
          'bags','sportswear','homewear','fashion_beauty','accessories'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_apparel_season_valid'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_apparel_season_valid
      check (season is null or season in ('summer','winter','all_seasons'));
  end if;
end $$;

alter table public.product_variants
  add column if not exists color_name_ku text,
  add column if not exists color_hex text,
  add column if not exists size_label text,
  add column if not exists color_image_storage_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_variants_apparel_attributes_valid'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_apparel_attributes_valid
      check (
        (
          color_name_ku is null
          and color_hex is null
          and size_label is null
          and color_image_storage_path is null
        )
        or
        (
          nullif(btrim(color_name_ku), '') is not null
          and nullif(btrim(size_label), '') is not null
          and color_hex ~ '^#[0-9A-Fa-f]{6}$'
        )
      );
  end if;
end $$;

create unique index if not exists product_variants_apparel_combination_unique
  on public.product_variants(product_id, lower(color_name_ku), lower(size_label))
  where color_name_ku is not null and size_label is not null;

create index if not exists products_apparel_type_status_idx
  on public.products(apparel_product_type, status)
  where apparel_product_type is not null;

comment on column public.products.apparel_product_type is
  'Optional SHAKH apparel product type; null for existing non-apparel catalogue items.';
comment on column public.product_variants.color_name_ku is
  'Sorani color label for an exact apparel color/size inventory combination.';
comment on column public.product_variants.color_hex is
  'Hex color swatch associated with an exact apparel variant.';
comment on column public.product_variants.size_label is
  'Actual size label for an exact apparel variant.';
comment on column public.product_variants.color_image_storage_path is
  'Optional product-media storage path selected to represent this color.';
