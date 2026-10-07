-- Phase 9: least-privilege Data API hardening.
-- Remote migration version: 20261007125813.
-- Keep table access explicit; RLS remains the row-level authorization boundary.

do $$
declare t text;
begin
  foreach t in array array[
    'audit_logs','cart_items','carts','categories','checkout_sessions','deliveries',
    'notifications','order_items','orders','payments','permissions','product_images',
    'product_variants','products','profiles','role_permissions','stores','user_roles','wishlists'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.categories, public.stores, public.products, public.product_images, public.product_variants to anon, authenticated;

grant select on public.audit_logs, public.checkout_sessions, public.order_items, public.orders,
  public.payments, public.permissions, public.role_permissions, public.user_roles to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.carts, public.cart_items, public.wishlists to authenticated;
grant select, insert, update, delete on public.stores, public.products, public.product_images, public.product_variants to authenticated;
grant select, insert, update on public.deliveries to authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

grant execute on function public.create_checkout(
  text,text,numeric,numeric,text,public.payment_method
) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
