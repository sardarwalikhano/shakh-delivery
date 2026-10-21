-- Customer-visible order history and notifications for direct post orders.
-- Existing captain offer notification and wallet/stock settlement triggers stay
-- intact; this migration adds the missing buyer/seller status communication.

create or replace function private.notify_post_order_participants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order_type text;
  v_category text;
  v_title text;
  v_city text;
  v_status_label text;
  v_delivery_label text;
  v_title_ku text;
  v_body_ku text;
  v_title_ar text;
  v_body_ar text;
  v_title_en text;
  v_body_en text;
  v_order_number text;
  v_order_id uuid;
  v_buyer_id uuid;
  v_seller_id uuid;
  v_data jsonb;
begin
  v_order_type := case tg_table_name
    when 'apparel_post_orders' then 'apparel_post_order'
    when 'food_post_orders' then 'food_post_order'
    else 'product_post_order'
  end;

  v_category := case tg_table_name
    when 'apparel_post_orders' then 'جل‌وبەرگ'
    when 'food_post_orders' then 'خواردن'
    else coalesce(to_jsonb(new)->>'post_category', 'بەرهەمی بازاڕ')
  end;
  v_order_number := new.order_number;
  v_order_id := new.id;
  v_buyer_id := new.buyer_id;
  v_seller_id := new.seller_id;
  v_data := jsonb_build_object(
    'order_number', new.order_number,
    'status', new.status,
    'delivery_status', new.delivery_status,
    'order_type', v_order_type,
    'post_title', new.post_title
  );

  if tg_op = 'INSERT' then
    -- The food-order RPC already alerts the seller; only notify the buyer here.
    if tg_table_name <> 'food_post_orders' then
      perform private.create_notification(
        v_seller_id,
        'order_created',
        'داواکاریی نوێ وەرگیرا',
        'داواکاریی ' || v_category || ' «' || new.post_title || '» تۆمار کرا. ژمارە: ' || v_order_number,
        'تم استلام طلب جديد',
        'تم استلام طلب جديد وسيظهر في قائمة الطلبات.',
        'New order received',
        'A new post order was placed: ' || v_order_number || '.',
        '/post-orders',
        v_order_type,
        v_order_id,
        v_data
      );
    end if;

    perform private.create_notification(
      v_buyer_id,
      'order_status',
      'داواکارییەکەت تۆمار کرا',
      'داواکاریی ' || v_category || ' «' || new.post_title || '» تۆمار کرا و چاوەڕوانی پەسەندکردنی فرۆشیارە.',
      'تم تسجيل طلبك',
      'تم تسجيل طلبك وهو بانتظار موافقة البائع.',
      'Your order was placed',
      'Your order is awaiting seller confirmation.',
      '/orders',
      v_order_type,
      v_order_id,
      v_data
    );
    return new;
  end if;

  if new.status is not distinct from old.status
     and new.delivery_status is not distinct from old.delivery_status then
    return new;
  end if;

  if new.delivery_status is distinct from old.delivery_status then
    v_delivery_label := case new.delivery_status
      when 'pending' then 'چاوەڕوانی کاپتن'
      when 'accepted' then 'کاپتن داواکارییەکەی وەرگرت'
      when 'picked_up' then 'کاپتن کاڵاکەی وەرگرت'
      when 'on_the_way' then 'کاپتن لە ڕێگایە'
      when 'arrived' then 'کاپتن گەیشتووە'
      when 'delivered' then 'گەیاندن تەواو بوو'
      when 'failed' then 'گەیاندن سەرنەکەوت'
      when 'cancelled' then 'گەیاندن هەڵوەشایەوە'
      else new.delivery_status
    end;
    v_title_ku := 'دۆخی گەیاندن نوێ کرایەوە';
    v_body_ku := 'دۆخی گەیاندنی داواکاری ' || v_order_number || ': ' || v_delivery_label || '.';
    v_title_ar := 'تم تحديث حالة التوصيل';
    v_body_ar := 'تم تحديث حالة توصيل الطلب ' || v_order_number || '.';
    v_title_en := 'Delivery status updated';
    v_body_en := 'Delivery status for order ' || v_order_number || ' is now ' || new.delivery_status || '.';
  else
    v_status_label := case new.status
      when 'pending' then 'لە چاوەڕوانیدایە'
      when 'confirmed' then 'پەسەندکرا'
      when 'rejected' then 'ڕەتکرایەوە'
      when 'delivered' then 'گەیەنراوە'
      when 'cancelled' then 'هەڵوەشایەوە'
      else new.status
    end;
    v_title_ku := case new.status
      when 'confirmed' then 'داواکاری پەسەندکرا'
      when 'rejected' then 'داواکاری ڕەتکرایەوە'
      when 'delivered' then 'داواکاری گەیەنرا'
      when 'cancelled' then 'داواکاری هەڵوەشایەوە'
      else 'دۆخی داواکاری نوێ کرایەوە'
    end;
    v_body_ku := case new.status
      when 'confirmed' then 'فرۆشیار داواکاری ' || v_order_number || ' پەسەند کرد؛ ئاگادارکردنەوە بۆ کاپتنەکان نێردرا.'
      when 'rejected' then 'داواکاری ' || v_order_number || ' ڕەتکرایەوە. کۆگا و باڵانسی گیراو بەپێی یاساکانی داتابەیس ئازاد دەکرێنەوە.'
      when 'delivered' then 'داواکاری ' || v_order_number || ' گەیەنراوە.'
      when 'cancelled' then 'داواکاری ' || v_order_number || ' هەڵوەشایەوە.'
      else 'دۆخی داواکاری ' || v_order_number || ' گۆڕا بۆ ' || v_status_label || '.'
    end;
    v_title_ar := 'تم تحديث حالة الطلب';
    v_body_ar := 'تم تحديث حالة الطلب ' || v_order_number || ' إلى ' || v_status_label || '.';
    v_title_en := 'Order status updated';
    v_body_en := 'Order ' || v_order_number || ' status is now ' || new.status || '.';
  end if;

  v_data := v_data || jsonb_build_object('status', new.status, 'delivery_status', new.delivery_status);

  -- Notify the other party for a customer/seller action. Captain/system actions
  -- notify both parties so the buyer can track progress and the seller is informed.
  if auth.uid() = v_buyer_id then
    perform private.create_notification(
      v_seller_id, 'order_status', v_title_ku, v_body_ku, v_title_ar, v_body_ar,
      v_title_en, v_body_en, '/post-orders', v_order_type, v_order_id, v_data
    );
  elsif auth.uid() = v_seller_id then
    perform private.create_notification(
      v_buyer_id, 'order_status', v_title_ku, v_body_ku, v_title_ar, v_body_ar,
      v_title_en, v_body_en, '/orders', v_order_type, v_order_id, v_data
    );
  else
    perform private.create_notification(
      v_buyer_id, 'order_status', v_title_ku, v_body_ku, v_title_ar, v_body_ar,
      v_title_en, v_body_en, '/orders', v_order_type, v_order_id, v_data
    );
    perform private.create_notification(
      v_seller_id, 'order_status', v_title_ku, v_body_ku, v_title_ar, v_body_ar,
      v_title_en, v_body_en, '/post-orders', v_order_type, v_order_id, v_data
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_post_order_participants() from public, anon, authenticated;

drop trigger if exists notify_apparel_post_order_created on public.apparel_post_orders;
create trigger notify_apparel_post_order_created
after insert on public.apparel_post_orders
for each row execute function private.notify_post_order_participants();

drop trigger if exists notify_apparel_post_order_status on public.apparel_post_orders;
create trigger notify_apparel_post_order_status
after update of status, delivery_status on public.apparel_post_orders
for each row execute function private.notify_post_order_participants();

drop trigger if exists notify_product_post_order_created on public.electronics_post_orders;
create trigger notify_product_post_order_created
after insert on public.electronics_post_orders
for each row execute function private.notify_post_order_participants();

drop trigger if exists notify_product_post_order_status on public.electronics_post_orders;
create trigger notify_product_post_order_status
after update of status, delivery_status on public.electronics_post_orders
for each row execute function private.notify_post_order_participants();

drop trigger if exists notify_food_post_order_buyer_created on public.food_post_orders;
create trigger notify_food_post_order_buyer_created
after insert on public.food_post_orders
for each row execute function private.notify_post_order_participants();

drop trigger if exists notify_food_post_delivery_status on public.food_post_orders;
create trigger notify_food_post_delivery_status
after update of delivery_status on public.food_post_orders
for each row execute function private.notify_post_order_participants();

