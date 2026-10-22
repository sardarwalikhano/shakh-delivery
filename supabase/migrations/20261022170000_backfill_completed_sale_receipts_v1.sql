-- Backfill immutable receipts for historical completed-and-paid sales.
-- No monetary/order statuses are changed: each UPDATE writes the current status
-- values back to the same columns solely to invoke the already-installed,
-- idempotent receipt triggers. Existing receipts are excluded by key.

update public.food_post_orders o
set status=o.status, delivery_status=o.delivery_status, payment_status=o.payment_status
where o.delivery_status='delivered'
  and o.payment_status='collected'
  and not exists (
    select 1 from public.order_receipts r
    where r.order_type='food_post' and r.order_id=o.id
  );

update public.apparel_post_orders o
set status=o.status, delivery_status=o.delivery_status, payment_status=o.payment_status
where o.delivery_status='delivered'
  and o.payment_status='collected'
  and not exists (
    select 1 from public.order_receipts r
    where r.order_type='apparel_post' and r.order_id=o.id
  );

update public.electronics_post_orders o
set status=o.status, delivery_status=o.delivery_status, payment_status=o.payment_status
where o.delivery_status='delivered'
  and o.payment_status='collected'
  and not exists (
    select 1 from public.order_receipts r
    where r.order_type='product_post' and r.order_id=o.id
  );

update public.deliveries d
set status=d.status
from public.orders o
where d.order_id=o.id
  and d.status::text='delivered'
  and not exists (
    select 1 from public.order_receipts r
    where r.order_type='store_order' and r.order_id=o.id
  );
