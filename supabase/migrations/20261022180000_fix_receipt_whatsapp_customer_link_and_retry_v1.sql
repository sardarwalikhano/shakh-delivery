-- Ensure completed-sale WhatsApp notices include the receipt URL and can target
-- buyers who explicitly opted in from their own SHAKH account. Existing order and
-- receipt creation logic remains unchanged.
create or replace function private.enqueue_sale_receipt_whatsapp(p_receipt_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_receipt public.order_receipts%rowtype;
  v_recipient record;
  v_items text;
  v_payment text;
  v_count integer := 0;
  v_body text;
  v_receipt_url text;
begin
  select * into v_receipt from public.order_receipts where id=p_receipt_id;
  if not found then return 0; end if;

  v_receipt_url := 'https://www.daim-post.online/receipts/' || v_receipt.id::text;

  select string_agg(
    coalesce(nullif(item->>'title',''),nullif(item->>'name',''),'بەرهەم')
    || ' × ' || coalesce(item->>'quantity','1')
    || case when nullif(item->>'variant','') is not null then ' (' || (item->>'variant') || ')' else '' end
    || ' — ' || to_char(coalesce(nullif(item->>'line_total_iqd','')::numeric,0),'FM999,999,999,999') || ' د.ع',
    E'\n'
  ) into v_items
  from jsonb_array_elements(v_receipt.item_lines) item;

  v_payment := case
    when v_receipt.payment_method in ('cash_on_delivery','cod') then 'کاش لە کاتی گەیاندن'
    when v_receipt.payment_method = 'mobile_cash' then 'Mobile Cash'
    else coalesce(v_receipt.payment_method,'نەناسراو')
  end;

  v_body :=
    'SHAKH — وەسڵی فرۆشتن' || E'\n'
    || 'ژمارەی وەسڵ: ' || v_receipt.receipt_number || E'\n'
    || 'ژمارەی ئۆردەر: ' || v_receipt.order_number || E'\n'
    || 'کڕیار: ' || coalesce(v_receipt.buyer_name,'—') || E'\n'
    || 'مۆبایلی کڕیار: ' || coalesce(v_receipt.buyer_phone,'—') || E'\n'
    || 'بەرهەمەکان:' || E'\n' || coalesce(v_items,'—') || E'\n'
    || 'کۆی بەرهەم: ' || to_char(v_receipt.subtotal_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'کرێی گەیاندن: ' || to_char(v_receipt.delivery_fee_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'کرێی پلاتفۆرم: ' || to_char(v_receipt.platform_fee_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'کۆی گشتی: ' || to_char(v_receipt.total_iqd,'FM999,999,999,999') || ' د.ع' || E'\n'
    || 'شێوازی پارەدان: ' || v_payment || E'\n'
    || 'دۆخ: کڕیار ئۆردەرەکەی وەرگرتووە و فرۆشتن تەواو بووە.' || E'\n'
    || 'بەروار: ' || to_char(v_receipt.completed_at at time zone 'Asia/Baghdad','YYYY-MM-DD HH24:MI') || E'\n'
    || 'لینکی وەسڵ: ' || v_receipt_url;

  for v_recipient in
    select pref.user_id,pref.phone_e164
    from public.whatsapp_delivery_preferences pref
    where pref.enabled and pref.phone_e164 is not null
      and (
        pref.user_id=v_receipt.buyer_id
        or pref.user_id=v_receipt.seller_id
        or exists(
          select 1 from public.user_roles ur
          where ur.user_id=pref.user_id and ur.role::text='super_admin'
        )
      )
  loop
    insert into public.whatsapp_message_outbox as existing_outbox(
      event_key,event_type,recipient_user_id,recipient_phone,receipt_id,message_body,metadata
    )
    values(
      'sale-receipt:'||v_receipt.id::text||':'||v_recipient.user_id::text,
      'sale_receipt',v_recipient.user_id,v_recipient.phone_e164,v_receipt.id,v_body,
      jsonb_build_object(
        'receipt_number',v_receipt.receipt_number,
        'order_number',v_receipt.order_number,
        'order_type',v_receipt.order_type,
        'seller_id',v_receipt.seller_id,
        'buyer_id',v_receipt.buyer_id,
        'captain_id',v_receipt.captain_id,
        'total_iqd',v_receipt.total_iqd,
        'receipt_url',v_receipt_url
      )
    )
    on conflict(event_key) do update
      set recipient_phone=excluded.recipient_phone,
          message_body=excluded.message_body,
          metadata=excluded.metadata,
          updated_at=now()
      where existing_outbox.status in ('pending','failed','blocked');
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.enqueue_sale_receipt_whatsapp(uuid) from public, anon, authenticated;
