create type public.product_status as enum ('draft', 'active', 'archived');
create type public.store_status as enum ('pending', 'active', 'suspended', 'closed');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  name_ku text not null,
  name_ar text not null,
  name_en text not null,
  slug text not null unique,
  icon_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_names_nonempty check (btrim(name_ku) <> '' and btrim(name_ar) <> '' and btrim(name_en) <> '')
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name_ku text not null,
  name_ar text not null,
  name_en text not null,
  slug text not null unique,
  logo_url text,
  cover_url text,
  description_ku text,
  description_ar text,
  description_en text,
  status public.store_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_names_nonempty check (btrim(name_ku) <> '' and btrim(name_ar) <> '' and btrim(name_en) <> '')
);

create index stores_owner_idx on public.stores(owner_id);
create index stores_status_idx on public.stores(status);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name_ku text not null,
  name_ar text not null,
  name_en text not null,
  slug text not null unique,
  description_ku text,
  description_ar text,
  description_en text,
  base_price_iqd numeric(14,2) not null,
  compare_at_price_iqd numeric(14,2),
  currency text not null default 'IQD',
  status public.product_status not null default 'draft',
  stock_quantity integer not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_names_nonempty check (btrim(name_ku) <> '' and btrim(name_ar) <> '' and btrim(name_en) <> ''),
  constraint products_price_nonnegative check (base_price_iqd >= 0),
  constraint products_compare_price_valid check (compare_at_price_iqd is null or compare_at_price_iqd >= base_price_iqd),
  constraint products_stock_nonnegative check (stock_quantity >= 0),
  constraint products_currency_iqd check (currency = 'IQD')
);

create index products_store_idx on public.products(store_id);
create index products_category_idx on public.products(category_id);
create index products_status_idx on public.products(status, created_at desc);
create index products_featured_idx on public.products(is_featured, created_at desc);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_ku text,
  alt_ar text,
  alt_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on public.product_images(product_id, sort_order);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_ku text not null,
  name_ar text not null,
  name_en text not null,
  sku text,
  price_iqd numeric(14,2),
  stock_quantity integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variants_names_nonempty check (btrim(name_ku) <> '' and btrim(name_ar) <> '' and btrim(name_en) <> ''),
  constraint variants_price_nonnegative check (price_iqd is null or price_iqd >= 0),
  constraint variants_stock_nonnegative check (stock_quantity >= 0)
);

create unique index product_variants_sku_unique on public.product_variants(sku) where sku is not null;
create index product_variants_product_idx on public.product_variants(product_id);

create table public.wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index wishlists_product_idx on public.wishlists(product_id);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null default 'IQD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_currency_iqd check (currency = 'IQD')
);

create unique index carts_one_open_cart_per_user on public.carts(user_id);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  quantity integer not null,
  added_price_iqd numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_quantity_positive check (quantity > 0),
  constraint cart_items_price_nonnegative check (added_price_iqd >= 0)
);

create unique index cart_items_cart_product_unique on public.cart_items(cart_id, product_id) where variant_id is null;
create unique index cart_items_cart_product_variant_unique on public.cart_items(cart_id, product_id, variant_id) where variant_id is not null;
create index cart_items_cart_idx on public.cart_items(cart_id);
create index cart_items_product_idx on public.cart_items(product_id);

create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger carts_set_updated_at before update on public.carts for each row execute function public.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.wishlists enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "categories_public_read_active" on public.categories for select to anon, authenticated using (is_active = true);
create policy "stores_public_read_active" on public.stores for select to anon, authenticated using (status = 'active');
create policy "stores_owner_read_write" on public.stores for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "products_public_read_active_store" on public.products for select to anon, authenticated using (status = 'active' and exists (select 1 from public.stores s where s.id = store_id and s.status = 'active'));
create policy "products_owner_read_write" on public.products for all to authenticated using (exists (select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid()))) with check (exists (select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid())));
create policy "product_images_public_read_active" on public.product_images for select to anon, authenticated using (exists (select 1 from public.products p join public.stores s on s.id = p.store_id where p.id = product_id and p.status = 'active' and s.status = 'active'));
create policy "product_images_owner_manage" on public.product_images for all to authenticated using (exists (select 1 from public.products p join public.stores s on s.id = p.store_id where p.id = product_id and s.owner_id = (select auth.uid()))) with check (exists (select 1 from public.products p join public.stores s on s.id = p.store_id where p.id = product_id and s.owner_id = (select auth.uid())));
create policy "product_variants_public_read_active" on public.product_variants for select to anon, authenticated using (is_active and exists (select 1 from public.products p join public.stores s on s.id = p.store_id where p.id = product_id and p.status = 'active' and s.status = 'active'));
create policy "product_variants_owner_manage" on public.product_variants for all to authenticated using (exists (select 1 from public.products p join public.stores s on s.id = p.store_id where p.id = product_id and s.owner_id = (select auth.uid()))) with check (exists (select 1 from public.products p join public.stores s on s.id = p.store_id where p.id = product_id and s.owner_id = (select auth.uid())));
create policy "wishlists_own" on public.wishlists for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "carts_own" on public.carts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cart_items_own" on public.cart_items for all to authenticated using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

insert into public.categories (name_ku, name_ar, name_en, slug, icon_key, sort_order) values
  ('خواردن', 'طعام', 'Food', 'food', 'utensils', 10),
  ('جل و بەرگ', 'أزياء', 'Fashion', 'fashion', 'shirt', 20),
  ('ئەلیکترۆنیات', 'إلكترونيات', 'Electronics', 'electronics', 'smartphone', 30),
  ('ماڵ و ژیان', 'المنزل والمعيشة', 'Home & Living', 'home-living', 'home', 40),
  ('جوانکاری', 'جمال', 'Beauty', 'beauty', 'sparkles', 50),
  ('منداڵان', 'الأطفال', 'Kids', 'kids', 'baby', 60),
  ('بازاڕی گشتی', 'السوق العام', 'General Marketplace', 'general', 'shopping-bag', 70),
  ('دۆکانی ئۆنلاین', 'المتاجر الإلكترونية', 'Online Stores', 'online-stores', 'store', 80)
on conflict (slug) do update set name_ku = excluded.name_ku, name_ar = excluded.name_ar, name_en = excluded.name_en, icon_key = excluded.icon_key, sort_order = excluded.sort_order, is_active = true;
