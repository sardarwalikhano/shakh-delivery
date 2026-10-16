-- Configure the payment accounts explicitly supplied for Shakh.
-- FastPay and FIB are enabled; Asia Hawala stays unavailable until a number is provided.
begin;

insert into public.manual_payment_methods (
  provider,
  label_ku,
  account_identifier,
  is_active,
  updated_at
)
values
  ('fastpay', 'FastPay', '07504796924', true, now()),
  ('fib', 'FIB', '07736999576', true, now()),
  ('asia_hawala', 'ئاسیا حوالە', null, false, now())
on conflict (provider) do update
set
  account_identifier = excluded.account_identifier,
  is_active = excluded.is_active,
  updated_at = now();

commit;
