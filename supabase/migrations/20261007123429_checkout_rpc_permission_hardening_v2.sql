grant execute on function private.create_checkout_internal(uuid,text,text,numeric,numeric,text,public.payment_method) to authenticated;

create or replace function public.create_checkout(
  p_idempotency_key text,
  p_delivery_address text,
  p_delivery_lat numeric default null,
  p_delivery_lng numeric default null,
  p_customer_note text default null,
  p_payment_method public.payment_method default 'cash_on_delivery'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if not (select private.has_permission('checkout.create')) then
    raise exception 'Checkout is not permitted for this role';
  end if;

  return private.create_checkout_internal(
    (select auth.uid()),
    p_idempotency_key,
    p_delivery_address,
    p_delivery_lat,
    p_delivery_lng,
    p_customer_note,
    p_payment_method
  );
end;
$$;

revoke all on function public.create_checkout(text,text,numeric,numeric,text,public.payment_method) from public, anon;
grant execute on function public.create_checkout(text,text,numeric,numeric,text,public.payment_method) to authenticated;
