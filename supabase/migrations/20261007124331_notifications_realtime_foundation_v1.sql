-- Phase 8: in-app notifications + Realtime publication for orders/deliveries.
-- Server-generated notifications are stored in public.notifications and protected by RLS.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title_ku text not null,
  body_ku text not null,
  title_ar text not null,
  body_ar text not null,
  title_en text not null,
  body_en text not null,
  route text,
  entity_type text,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('order_created','order_status','delivery_assigned','delivery_status','payment_status','system')),
  constraint notifications_data_object check (jsonb_typeof(data) = 'object')
);

create index notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "notifications_update_read_own"
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke insert, delete on public.notifications from anon, authenticated;
revoke all on public.notifications from anon;
grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

insert into public.permissions(code, description) values
  ('notifications.view_own', 'View own in-app notifications'),
  ('notifications.mark_read', 'Mark own notifications as read')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role, permission_code)
select r.role, p.permission_code
from (
  values
    ('super_admin'::public.app_role, 'notifications.view_own'),
    ('super_admin'::public.app_role, 'notifications.mark_read'),
    ('admin'::public.app_role, 'notifications.view_own'),
    ('admin'::public.app_role, 'notifications.mark_read'),
    ('customer'::public.app_role, 'notifications.view_own'),
    ('customer'::public.app_role, 'notifications.mark_read'),
    ('captain'::public.app_role, 'notifications.view_own'),
    ('captain'::public.app_role, 'notifications.mark_read'),
    ('restaurant_vendor'::public.app_role, 'notifications.view_own'),
    ('restaurant_vendor'::public.app_role, 'notifications.mark_read'),
    ('fashion_vendor'::public.app_role, 'notifications.view_own'),
    ('fashion_vendor'::public.app_role, 'notifications.mark_read'),
    ('car_dealer'::public.app_role, 'notifications.view_own'),
    ('car_dealer'::public.app_role, 'notifications.mark_read'),
    ('umrah_agency'::public.app_role, 'notifications.view_own'),
    ('umrah_agency'::public.app_role, 'notifications.mark_read'),
    ('support'::public.app_role, 'notifications.view_own'),
    ('support'::public.app_role, 'notifications.mark_read')
) r(role, permission_code)
join public.permissions p on p.code = r.permission_code
on conflict do nothing;

create or replace function private.create_notification(
  p_user_id uuid,
  p_type text,
  p_title_ku text,
  p_body_ku text,
  p_title_ar text,
  p_body_ar text,
  p_title_en text,
  p_body_en text,
  p_route text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications(
    user_id, type,
    title_ku, body_ku,
    title_ar, body_ar,
    title_en, body_en,
    route, entity_type, entity_id, data
  )
  values(
    p_user_id, p_type,
    p_title_ku, p_body_ku,
    p_title_ar, p_body_ar,
    p_title_en, p_body_en,
    p_route, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.create_notification(uuid,text,text,text,text,text,text,text,text,text,uuid,jsonb) from public, anon, authenticated;

create or replace function private.notify_order_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid;
  v_status_text text;
begin
  select s.owner_id into v_owner_id
  from public.stores s
  where s.id = new.store_id;

  if tg_op = 'INSERT' then
    perform private.create_notification(
      new.customer_id,
      'order_created',
      'داواکارییەکەت دروستکرا',
      'داواکارییەکەت بە سەرکەوتوویی تۆمارکرا.',
      'تم إنشاء طلبك',
      'تم تسجيل طلبك بنجاح.',
      'Your order was created',
      'Your order has been created successfully.',
      '/orders/' || new.id::text,
      'order',
      new.id,
      jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
    );

    if v_owner_id is not null and v_owner_id <> new.customer_id then
      perform private.create_notification(
        v_owner_id,
        'order_created',
        'داواکارییەکی نوێ هەیە',
        'داواکارییەکی نوێ بۆ فرۆشگاکەت دروستکرا.',
        'لديك طلب جديد',
        'تم إنشاء طلب جديد لمتجرك.',
        'New order received',
        'A new order was created for your store.',
        '/dashboard',
        'order',
        new.id,
        jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
      );
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_status_text := new.status::text;

    perform private.create_notification(
      new.customer_id,
      'order_status',
      'دۆخی داواکاری گۆڕدرا',
      'دۆخی داواکارییەکەت ئێستا: ' || v_status_text,
      'تم تحديث حالة الطلب',
      'حالة طلبك الآن: ' || v_status_text,
      'Order status updated',
      'Your order status is now: ' || v_status_text,
      '/orders/' || new.id::text,
      'order',
      new.id,
      jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
    );

    if v_owner_id is not null and v_owner_id <> new.customer_id then
      perform private.create_notification(
        v_owner_id,
        'order_status',
        'دۆخی داواکاری گۆڕدرا',
        'دۆخی داواکاری ' || new.order_number || ' گۆڕدرا: ' || v_status_text,
        'تم تحديث حالة الطلب',
        'تم تحديث حالة الطلب ' || new.order_number || ': ' || v_status_text,
        'Order status updated',
        'Order ' || new.order_number || ' changed to: ' || v_status_text,
        '/dashboard',
        'order',
        new.id,
        jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_order_changes() from public, anon, authenticated;

create or replace function private.notify_delivery_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_customer_id uuid;
  v_order_number text;
  v_status_text text;
  v_old_captain uuid;
begin
  select o.customer_id, o.order_number
    into v_customer_id, v_order_number
  from public.orders o
  where o.id = new.order_id;

  if tg_op = 'INSERT' then
    if new.captain_id is not null then
      perform private.create_notification(
        new.captain_id,
        'delivery_assigned',
        'گەیاندنێکی نوێ بۆ تۆ دیاریکرا',
        'کاپتن، داواکاری ' || coalesce(v_order_number, '') || ' بۆ تۆ دیاریکرا.',
        'تم تعيين توصيل جديد لك',
        'تم تعيين الطلب ' || coalesce(v_order_number, '') || ' لك.',
        'New delivery assigned',
        'Order ' || coalesce(v_order_number, '') || ' was assigned to you.',
        '/dashboard/deliveries',
        'delivery',
        new.id,
        jsonb_build_object('delivery_id', new.id, 'order_id', new.order_id, 'order_number', v_order_number, 'status', new.status)
      );
    end if;
  elsif tg_op = 'UPDATE' then
    v_old_captain := old.captain_id;

    if new.captain_id is distinct from old.captain_id then
      if new.captain_id is not null then
        perform private.create_notification(
          new.captain_id,
          'delivery_assigned',
          'گەیاندنێکی نوێ بۆ تۆ دیاریکرا',
          'کاپتن، داواکاری ' || coalesce(v_order_number, '') || ' بۆ تۆ دیاریکرا.',
          'تم تعيين توصيل جديد لك',
          'تم تعيين الطلب ' || coalesce(v_order_number, '') || ' لك.',
          'New delivery assigned',
          'Order ' || coalesce(v_order_number, '') || ' was assigned to you.',
          '/dashboard/deliveries',
          'delivery',
          new.id,
          jsonb_build_object('delivery_id', new.id, 'order_id', new.order_id, 'order_number', v_order_number, 'status', new.status)
        );
      end if;

      if v_old_captain is not null and v_old_captain <> coalesce(new.captain_id, v_old_captain) then
        perform private.create_notification(
          v_old_captain,
          'delivery_status',
          'دیاریکردنی گەیاندن گۆڕدرا',
          'گەیاندنی داواکاری ' || coalesce(v_order_number, '') || ' چیتر بۆ تۆ نییە.',
          'تم تغيير تعيين التوصيل',
          'لم يعد الطلب ' || coalesce(v_order_number, '') || ' معيناً لك.',
          'Delivery assignment changed',
          'Order ' || coalesce(v_order_number, '') || ' is no longer assigned to you.',
          '/dashboard/deliveries',
          'delivery',
          new.id,
          jsonb_build_object('delivery_id', new.id, 'order_id', new.order_id, 'order_number', v_order_number)
        );
      end if;
    end if;

    if new.status is distinct from old.status then
      v_status_text := new.status::text;

      if v_customer_id is not null then
        perform private.create_notification(
          v_customer_id,
          'delivery_status',
          'دۆخی گەیاندن گۆڕدرا',
          'دۆخی گەیاندنی داواکاری ' || coalesce(v_order_number, '') || ': ' || v_status_text,
          'تم تحديث حالة التوصيل',
          'حالة توصيل الطلب ' || coalesce(v_order_number, '') || ': ' || v_status_text,
          'Delivery status updated',
          'Delivery for order ' || coalesce(v_order_number, '') || ' is now: ' || v_status_text,
          '/orders/' || new.order_id::text,
          'delivery',
          new.id,
          jsonb_build_object('delivery_id', new.id, 'order_id', new.order_id, 'order_number', v_order_number, 'status', new.status)
        );
      end if;

      if new.captain_id is not null then
        perform private.create_notification(
          new.captain_id,
          'delivery_status',
          'دۆخی گەیاندن گۆڕدرا',
          'دۆخی گەیاندنی داواکاری ' || coalesce(v_order_number, '') || ': ' || v_status_text,
          'تم تحديث حالة التوصيل',
          'حالة توصيل الطلب ' || coalesce(v_order_number, '') || ': ' || v_status_text,
          'Delivery status updated',
          'Delivery for order ' || coalesce(v_order_number, '') || ' is now: ' || v_status_text,
          '/dashboard/deliveries',
          'delivery',
          new.id,
          jsonb_build_object('delivery_id', new.id, 'order_id', new.order_id, 'order_number', v_order_number, 'status', new.status)
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_delivery_changes() from public, anon, authenticated;

create or replace function private.notify_payment_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_status_text text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_status_text := new.status::text;
    perform private.create_notification(
      new.customer_id,
      'payment_status',
      'دۆخی پارەدان گۆڕدرا',
      'دۆخی پارەدانی داواکارییەکەت: ' || v_status_text,
      'تم تحديث حالة الدفع',
      'حالة دفع طلبك: ' || v_status_text,
      'Payment status updated',
      'Your payment status is now: ' || v_status_text,
      '/orders',
      'payment',
      new.id,
      jsonb_build_object('payment_id', new.id, 'checkout_session_id', new.checkout_session_id, 'status', new.status, 'amount_iqd', new.amount_iqd)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_payment_changes() from public, anon, authenticated;

drop trigger if exists notifications_on_order_change on public.orders;
create trigger notifications_on_order_change
after insert or update of status on public.orders
for each row execute function private.notify_order_changes();

drop trigger if exists notifications_on_delivery_change on public.deliveries;
create trigger notifications_on_delivery_change
after insert or update of captain_id, status on public.deliveries
for each row execute function private.notify_delivery_changes();

drop trigger if exists notifications_on_payment_change on public.payments;
create trigger notifications_on_payment_change
after update of status on public.payments
for each row execute function private.notify_payment_changes();

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if not (select private.has_permission('notifications.mark_read')) then
    raise exception 'Notification read permission is required';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = (select auth.uid());

  return found;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
begin
  if not (select private.has_permission('notifications.mark_read')) then
    raise exception 'Notification read permission is required';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid())
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Realtime: notifications are delivered directly; orders/deliveries are also subscribed
-- so authoritative state can be re-fetched whenever a change arrives.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;
end;
$$;
