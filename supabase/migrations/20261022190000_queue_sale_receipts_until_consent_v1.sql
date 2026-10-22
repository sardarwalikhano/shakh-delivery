-- Prepare sale-receipt notices for the seller and Super Admin automatically.
-- Messages for accounts without explicit WhatsApp consent remain blocked, never sent.
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
  v_phone text;
  v_digits text;
  v_opted_in boolean;
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

  -- Always prepare a seller and Super Admin notification when a usable number exists.
  -- Include the buyer too, but no recipient can send unless their own preference is enabled.
  for v_recipient in
    with candidate_users(user_id) as (
      select v_receipt.seller_id where v_receipt.seller_id is not null
      union
      select v_receipt.buyer_id where v_receipt.buyer_id is not null
      union
      select ur.user_id from public.user_roles ur where ur.role::text='super_admin'
    )
    select c.user_id,
           pref.phone_e164,
           pref.enabled,
           p.phone as profile_phone,
           case
             when c.user_id=v_receipt.buyer_id then coalesce(v_receipt.buyer_phone,p.phone)
             when c.user_id=v_receipt.seller_id then coalesce(v_receipt.seller_phone,p.phone)
             else p.phone
           end as raw_phone
    from candidate_users c
    join public.profiles p on p.id=c.user_id
    left join public.whatsapp_delivery_preferences pref on pref.user_id=c.user_id
  loop
    v_phone := coalesce(v_recipient.phone_e164,v_recipient.raw_phone);
    v_digits := regexp_replace(coalesce(v_phone,''),'[^0-9]','','g');
    if v_digits like '00%' then v_digits := substr(v_digits,3); end if;
    if v_digits like '9640%' then v_digits := '964'||substr(v_digits,5);
    elsif v_digits like '0%' then v_digits := '964'||substr(v_digits,2);
    elsif v_digits ~ '^7[0-9]{9}$' then v_digits := '964'||v_digits;
    end if;
    if length(v_digits)<8 or length(v_digits)>15 then continue; end if;

    v_opted_in := coalesce(v_recipient.enabled,false)
      and v_recipient.phone_e164 is not null
      and v_recipient.phone_e164=v_digits;

    insert into public.whatsapp_message_outbox as existing_outbox(
      event_key,event_type,recipient_user_id,recipient_phone,receipt_id,message_body,metadata,status,last_error
    )
    values(
      'sale-receipt:'||v_receipt.id::text||':'||v_recipient.user_id::text,
      'sale_receipt',v_recipient.user_id,v_digits,v_receipt.id,v_body,
      jsonb_build_object(
        'receipt_number',v_receipt.receipt_number,
        'order_number',v_receipt.order_number,
        'order_type',v_receipt.order_type,
        'seller_id',v_receipt.seller_id,
        'buyer_id',v_receipt.buyer_id,
        'captain_id',v_receipt.captain_id,
        'total_iqd',v_receipt.total_iqd,
        'receipt_url',v_receipt_url
      ),
      case when v_opted_in then 'pending' else 'blocked' end,
      case when v_opted_in then null else 'Waiting for this account to enable WhatsApp receipt consent and save this number.' end
    )
    on conflict(event_key) do update
      set recipient_phone=excluded.recipient_phone,
          message_body=excluded.message_body,
          metadata=excluded.metadata,
          status=excluded.status,
          last_error=excluded.last_error,
          next_attempt_at=now(),
          updated_at=now()
      where existing_outbox.status in ('pending','failed','blocked');
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.enqueue_sale_receipt_whatsapp(uuid) from public, anon, authenticated;

-- Refresh only already-created receipts so their queued notices receive the link.
-- A blocked row remains blocked until its own recipient opts in.
select private.enqueue_sale_receipt_whatsapp(id) from public.order_receipts;
