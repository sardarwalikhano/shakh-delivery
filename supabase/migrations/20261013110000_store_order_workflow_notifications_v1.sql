create or replace function public.update_store_order_status(p_order_id uuid, p_status public.order_status)
returns public.order_status
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_user_id
      and ur.role in ('restaurant_vendor','supermarket_vendor')
  ) then raise exception 'Store owner role required'; end if;

  select o.* into v_order
  from public.orders o
  join public.stores s on s.id = o.store_id and s.owner_id = v_user_id
  where o.id = p_order_id
  for update of o;
  if not found then raise exception 'Order not found for this store'; end if;

  if not (
    (v_order.status = 'pending' and p_status = 'confirmed')
    or (v_order.status = 'confirmed' and p_status = 'preparing')
    or (v_order.status = 'preparing' and p_status = 'ready')
  ) then raise exception 'Invalid store order status transition'; end if;

  update public.orders set status = p_status where id = p_order_id;
  return p_status;
end;
$$;

revoke all on function public.update_store_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.update_store_order_status(uuid, public.order_status) to authenticated;

create or replace function private.notify_order_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid;
  v_status_ku text;
  v_status_en text;
begin
  select s.owner_id into v_owner_id from public.stores s where s.id = new.store_id;

  if tg_op = 'INSERT' then
    perform private.create_notification(
      new.customer_id, 'order_created', 'داواکارییەکەت دروستکرا',
      'داواکارییەکەت بە سەرکەوتوویی تۆمارکرا.',
      'تم إنشاء طلبك', 'تم تسجيل طلبك بنجاح.',
      'Your order was created', 'Your order has been created successfully.',
      '/orders/' || new.id::text, 'order', new.id,
      jsonb_build_object('order_id',new.id,'order_number',new.order_number,'status',new.status)
    );
    if v_owner_id is not null and v_owner_id <> new.customer_id then
      perform private.create_notification(
        v_owner_id, 'order_created', 'داواکارییەکی نوێ هەیە',
        'داواکارییەکی نوێ بۆ فرۆشگاکەت دروستکرا.',
        'لديك طلب جديد', 'تم إنشاء طلب جديد لمتجرك.',
        'New order received', 'A new order was created for your store.',
        '/dashboard/orders', 'order', new.id,
        jsonb_build_object('order_id',new.id,'order_number',new.order_number,'status',new.status)
      );
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_status_ku := case new.status
      when 'pending' then 'لە چاوەڕوانیدایە' when 'confirmed' then 'پەسەندکرا'
      when 'preparing' then 'ئامادەدەکرێت' when 'ready' then 'ئامادەیە و چاوەڕێی کاپتنە'
      when 'out_for_delivery' then 'لە ڕێگای گەیاندندایە' when 'delivered' then 'گەیەنراوە'
      when 'cancelled' then 'هەڵوەشێنراوەتەوە' else 'نوێکراوەتەوە' end;
    v_status_en := case new.status
      when 'pending' then 'pending' when 'confirmed' then 'confirmed'
      when 'preparing' then 'being prepared' when 'ready' then 'ready for pickup'
      when 'out_for_delivery' then 'out for delivery' when 'delivered' then 'delivered'
      when 'cancelled' then 'cancelled' else 'updated' end;

    perform private.create_notification(
      new.customer_id, 'order_status',
      case when new.status = 'ready' then 'ئۆردەرەکەت ئامادەیە' else 'دۆخی داواکاری گۆڕدرا' end,
      'دۆخی داواکاری ' || new.order_number || ': ' || v_status_ku,
      case when new.status = 'ready' then 'طلبك جاهز' else 'تم تحديث حالة الطلب' end,
      'حالة طلبك ' || new.order_number || ': ' || v_status_en,
      case when new.status = 'ready' then 'Your order is ready' else 'Order status updated' end,
      'Order ' || new.order_number || ' is ' || v_status_en || '.',
      '/orders/' || new.id::text, 'order', new.id,
      jsonb_build_object('order_id',new.id,'order_number',new.order_number,'status',new.status)
    );
    if v_owner_id is not null and v_owner_id <> new.customer_id then
      perform private.create_notification(
        v_owner_id, 'order_status', 'دۆخی داواکاری گۆڕدرا',
        'دۆخی داواکاری ' || new.order_number || ' گۆڕدرا: ' || v_status_ku,
        'تم تحديث حالة الطلب', 'تم تحديث حالة الطلب ' || new.order_number || ': ' || v_status_en,
        'Order status updated', 'Order ' || new.order_number || ' changed to: ' || v_status_en,
        '/dashboard/orders', 'order', new.id,
        jsonb_build_object('order_id',new.id,'order_number',new.order_number,'status',new.status)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_order_changes() from public, anon, authenticated;
create extension if not exists pg_net;

insert into public.role_permissions(role, permission_code)
select 'supermarket_vendor'::public.app_role, p.code
from public.permissions p
where p.code in ('orders.view','notifications.view_own','notifications.mark_read')
on conflict do nothing;

create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;

create or replace function public.get_push_runtime_config()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_role text := current_setting('request.jwt.claim.role', true);
  v_webhook_secret text;
  v_vapid_private_key text;
  v_vapid_public_key text;
begin
  if v_role is distinct from 'service_role' then raise exception 'Service role required'; end if;
  select decrypted_secret into v_webhook_secret from vault.decrypted_secrets where name = 'shakh_push_webhook_secret' limit 1;
  select decrypted_secret into v_vapid_private_key from vault.decrypted_secrets where name = 'shakh_vapid_private_key' limit 1;
  select decrypted_secret into v_vapid_public_key from vault.decrypted_secrets where name = 'shakh_vapid_public_key' limit 1;
  if v_webhook_secret is null or v_vapid_private_key is null or v_vapid_public_key is null then
    raise exception 'Browser push is not configured';
  end if;
  return jsonb_build_object('webhook_secret',v_webhook_secret,'vapid_private_key',v_vapid_private_key,'vapid_public_key',v_vapid_public_key);
end;
$$;
revoke all on function public.get_push_runtime_config() from public, anon, authenticated;
grant execute on function public.get_push_runtime_config() to service_role;

create or replace function private.enqueue_browser_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net, extensions
as $$
declare
  v_webhook_secret text;
  v_signature text;
begin
  select decrypted_secret into v_webhook_secret from vault.decrypted_secrets where name = 'shakh_push_webhook_secret' limit 1;
  if v_webhook_secret is null then return new; end if;

  v_signature := encode(hmac(convert_to(new.id::text || ':' || new.user_id::text,'UTF8'), convert_to(v_webhook_secret,'UTF8'), 'sha256'),'hex');
  perform net.http_post(
    url := 'https://jjtmtxrkbewmdxdmgtrf.supabase.co/functions/v1/send-browser-push',
    body := jsonb_build_object('notification_id',new.id,'user_id',new.user_id,'signature',v_signature),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke all on function private.enqueue_browser_push() from public, anon, authenticated;
drop trigger if exists send_browser_push_after_notification on public.notifications;
create trigger send_browser_push_after_notification
after insert on public.notifications
for each row execute function private.enqueue_browser_push();

create or replace function public.update_store_order_status(p_order_id uuid, p_status public.order_status)
returns public.order_status
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = v_user_id and ur.role in ('restaurant_vendor','supermarket_vendor')) then
    raise exception 'Store owner role required';
  end if;
  select o.* into v_order from public.orders o
  join public.stores s on s.id = o.store_id and s.owner_id = v_user_id
  where o.id = p_order_id for update of o;
  if not found then raise exception 'Order not found for this store'; end if;
  if not ((v_order.status = 'pending' and p_status = 'confirmed')
    or (v_order.status = 'confirmed' and p_status = 'preparing')
    or (v_order.status = 'preparing' and p_status = 'ready')) then
    raise exception 'Invalid store order status transition';
  end if;
  update public.orders set status = p_status where id = p_order_id;
  return p_status;
end;
$$;
revoke all on function public.update_store_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.update_store_order_status(uuid, public.order_status) to authenticated;

