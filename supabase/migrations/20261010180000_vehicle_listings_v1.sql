-- Structured vehicle listings, safe publishing gate, and seller/admin-scoped RLS.
-- Existing posts are preserved. Cars are staged until their detail row and real images exist.

create table if not exists public.vehicle_listings (
  post_id uuid primary key references public.posts(id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('sedan','suv','pickup','hatchback','coupe','convertible','wagon','van','minivan','truck','motorcycle','other','unknown')),
  make text not null check (char_length(btrim(make)) between 1 and 100),
  model text not null check (char_length(btrim(model)) between 1 and 100),
  trim text null check (trim is null or char_length(trim) <= 100),
  manufacturing_year integer null check (manufacturing_year is null or manufacturing_year between 1886 and 2100),
  price_amount numeric(14,2) not null check (price_amount > 0),
  currency text not null check (currency in ('IQD','USD')),
  discount_percent integer not null check (discount_percent between 0 and 99),
  price_negotiable boolean not null,
  exterior_color text null check (exterior_color is null or char_length(exterior_color) <= 60),
  interior_color text null check (interior_color is null or char_length(interior_color) <= 60),
  mileage_km integer null check (mileage_km is null or mileage_km >= 0),
  fuel_type text null check (fuel_type is null or fuel_type in ('gasoline','diesel','hybrid','electric','lpg','cng','other','unknown')),
  transmission text null check (transmission is null or transmission in ('manual','automatic','cvt','semi_automatic','other','unknown')),
  engine_cc integer null check (engine_cc is null or engine_cc >= 0),
  body_type text null check (body_type is null or body_type in ('sedan','suv','pickup','hatchback','coupe','convertible','wagon','van','minivan','truck','motorcycle','other','unknown')),
  drivetrain text null check (drivetrain is null or drivetrain in ('fwd','rwd','awd','4x4','other','unknown')),
  vehicle_condition text not null check (vehicle_condition in ('new','used','unknown')),
  origin text not null check (origin in ('local','imported','unknown')),
  ownership_count integer null check (ownership_count is null or ownership_count between 1 and 100),
  accident_history text not null check (accident_history in ('yes','no','unknown')),
  repainted_or_replaced_parts text not null check (repainted_or_replaced_parts in ('yes','no','unknown')),
  repaint_replacement_details text null check (repaint_replacement_details is null or char_length(repaint_replacement_details) <= 2000),
  engine_issue text null check (engine_issue is null or engine_issue in ('yes','no','unknown')),
  transmission_issue text null check (transmission_issue is null or transmission_issue in ('yes','no','unknown')),
  electrical_issue text null check (electrical_issue is null or electrical_issue in ('yes','no','unknown')),
  paint_issue text null check (paint_issue is null or paint_issue in ('yes','no','unknown')),
  tire_issue text null check (tire_issue is null or tire_issue in ('yes','no','unknown')),
  other_issue text null check (other_issue is null or other_issue in ('yes','no','unknown')),
  known_problems text null check (known_problems is null or char_length(known_problems) <= 5000),
  service_history text null check (service_history is null or char_length(service_history) <= 5000),
  features text[] not null default '{}'::text[] check (cardinality(features) <= 40),
  sale_readiness text not null check (sale_readiness in ('ready','not_ready','unknown')),
  legal_documents_status text not null check (legal_documents_status in ('available','missing','unknown')),
  legal_document_notes text null check (legal_document_notes is null or char_length(legal_document_notes) <= 2000),
  contact_name text null check (contact_name is null or char_length(contact_name) <= 100),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 6 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_listing_repaint_details_required
    check (repainted_or_replaced_parts <> 'yes' or char_length(btrim(coalesce(repaint_replacement_details,''))) >= 3),
  constraint vehicle_listing_issue_details_required
    check (
      (engine_issue is distinct from 'yes'
       and transmission_issue is distinct from 'yes'
       and electrical_issue is distinct from 'yes'
       and paint_issue is distinct from 'yes'
       and tire_issue is distinct from 'yes'
       and other_issue is distinct from 'yes')
      or char_length(btrim(coalesce(known_problems,''))) >= 3
    )
);

create index if not exists vehicle_listings_make_model_idx
  on public.vehicle_listings (lower(make), lower(model));
create index if not exists vehicle_listings_price_idx
  on public.vehicle_listings (currency, price_amount);

alter table public.vehicle_listings enable row level security;

revoke all on public.vehicle_listings from public, anon;
grant select, insert, update, delete on public.vehicle_listings to authenticated;

drop policy if exists vehicle_listings_select_scoped on public.vehicle_listings;
create policy vehicle_listings_select_scoped
on public.vehicle_listings for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = vehicle_listings.post_id
      and (
        p.status = 'active'::public.post_status
        or p.author_id = (select auth.uid())
        or (select private.has_permission('posts.manage'))
      )
  )
);

drop policy if exists vehicle_listings_insert_scoped on public.vehicle_listings;
create policy vehicle_listings_insert_scoped
on public.vehicle_listings for insert to authenticated
with check (
  (select private.has_permission('posts.create'))
  and exists (
    select 1 from public.posts p
    where p.id = vehicle_listings.post_id
      and p.author_id = (select auth.uid())
      and p.category = 'cars'::public.post_category
      and p.status = 'archived'::public.post_status
  )
);

drop policy if exists vehicle_listings_update_scoped on public.vehicle_listings;
create policy vehicle_listings_update_scoped
on public.vehicle_listings for update to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = vehicle_listings.post_id
      and (
        (p.author_id = (select auth.uid()) and (select private.has_permission('posts.update_own')))
        or (select private.has_permission('posts.manage'))
      )
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = vehicle_listings.post_id
      and p.category = 'cars'::public.post_category
      and (
        (p.author_id = (select auth.uid()) and (select private.has_permission('posts.update_own')))
        or (select private.has_permission('posts.manage'))
      )
  )
);

drop policy if exists vehicle_listings_delete_scoped on public.vehicle_listings;
create policy vehicle_listings_delete_scoped
on public.vehicle_listings for delete to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = vehicle_listings.post_id
      and (
        (p.author_id = (select auth.uid()) and (select private.has_permission('posts.delete_own')))
        or (select private.has_permission('posts.manage'))
      )
  )
);

create or replace function private.set_vehicle_listing_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.set_vehicle_listing_updated_at() from public, anon, authenticated;

drop trigger if exists vehicle_listings_set_updated_at on public.vehicle_listings;
create trigger vehicle_listings_set_updated_at
before update on public.vehicle_listings
for each row execute function private.set_vehicle_listing_updated_at();

create or replace function private.validate_vehicle_post_before_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_needs_validation boolean := false;
  v_has_vehicle_details boolean := false;
begin
  if tg_op = 'INSERT' then
    v_needs_validation := new.category = 'cars'::public.post_category
      and new.status = 'active'::public.post_status;
  else
    v_needs_validation := new.category = 'cars'::public.post_category
      and new.status = 'active'::public.post_status
      and (
        old.status is distinct from 'active'::public.post_status
        or old.category is distinct from 'cars'::public.post_category
      );
  end if;

  -- Existing active vehicle posts are left untouched for backward compatibility.
  if not v_needs_validation then return new; end if;

  if new.price_iqd is null or new.price_iqd <= 0 then
    raise exception 'Vehicle listing needs a positive price';
  end if;
  if char_length(btrim(coalesce(new.location,''))) < 2 then
    raise exception 'Vehicle listing needs a location';
  end if;
  if jsonb_typeof(new.images) is distinct from 'array'
    or jsonb_array_length(new.images) < 1
    or jsonb_array_length(new.images) > 8 then
    raise exception 'Vehicle listing needs between one and eight real images';
  end if;

  select exists (
    select 1
    from public.vehicle_listings vl
    where vl.post_id = new.id
      and char_length(btrim(vl.make)) > 0
      and char_length(btrim(vl.model)) > 0
      and vl.price_amount > 0
      and vl.currency in ('IQD','USD')
      and char_length(btrim(vl.contact_phone)) between 6 and 40
  ) into v_has_vehicle_details;

  if not v_has_vehicle_details then
    raise exception 'Vehicle details must be saved before publishing this car post';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_vehicle_post_before_publish() from public, anon, authenticated;

drop trigger if exists posts_validate_vehicle_before_publish on public.posts;
create trigger posts_validate_vehicle_before_publish
before insert or update on public.posts
for each row execute function private.validate_vehicle_post_before_publish();

-- Let authenticated clients subscribe to changes in structured vehicle details when Realtime is enabled.
do $function$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'vehicle_listings'
     ) then
    execute 'alter publication supabase_realtime add table public.vehicle_listings';
  end if;
end;
$function$;
