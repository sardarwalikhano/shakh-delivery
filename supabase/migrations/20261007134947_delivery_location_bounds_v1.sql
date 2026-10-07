-- Enforce valid GPS coordinate pairs for checkout, orders and deliveries.

alter table public.checkout_sessions
  add constraint checkout_delivery_lat_range check (delivery_lat is null or delivery_lat between -90 and 90),
  add constraint checkout_delivery_lng_range check (delivery_lng is null or delivery_lng between -180 and 180),
  add constraint checkout_delivery_coordinates_pair check ((delivery_lat is null) = (delivery_lng is null));

alter table public.orders
  add constraint orders_delivery_lat_range check (delivery_lat is null or delivery_lat between -90 and 90),
  add constraint orders_delivery_lng_range check (delivery_lng is null or delivery_lng between -180 and 180),
  add constraint orders_delivery_coordinates_pair check ((delivery_lat is null) = (delivery_lng is null));

alter table public.deliveries
  add constraint deliveries_last_lat_range check (last_lat is null or last_lat between -90 and 90),
  add constraint deliveries_last_lng_range check (last_lng is null or last_lng between -180 and 180),
  add constraint deliveries_last_coordinates_pair check ((last_lat is null) = (last_lng is null));
