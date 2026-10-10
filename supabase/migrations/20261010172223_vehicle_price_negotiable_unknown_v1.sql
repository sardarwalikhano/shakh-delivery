-- A seller can now explicitly mark price negotiation as unknown.
-- Existing TRUE/FALSE values remain unchanged.
alter table public.vehicle_listings
  alter column price_negotiable drop not null;

comment on column public.vehicle_listings.price_negotiable is
  'TRUE means negotiable, FALSE means not negotiable, NULL means seller does not know or did not confirm.';
