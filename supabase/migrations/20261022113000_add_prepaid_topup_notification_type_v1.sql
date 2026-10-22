-- Allow a dedicated notification type for prepaid wallet top-up reviews.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'order_created'::text,
    'order_status'::text,
    'delivery_assigned'::text,
    'delivery_status'::text,
    'delivery_offer'::text,
    'role_request'::text,
    'payment_status'::text,
    'prepaid_topup_request'::text,
    'system'::text
  ]));
