-- Fix the seller cash-return outbox reference (it must point at the same
-- settlement batch, just like the super-admin message) and expose scoped status
-- plus a safe retry entry point for receipt recipients.
create or replace function private.notify_captain_cash_return_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_batch public.captain_cash_settlement_batches%rowtype;
  v_captain_name text;
  v_seller record;
  v_admin record;
  v_preference record;
  v_current_seller_return bigint;
  v_seller_total_collected bigint;
  v_seller_total_returned bigint;
  v_seller_remaining bigint;
  v_total_collected bigint;
  v_total_returned bigint;
  v_remaining bigint;
  v_admin_body text;
  v_seller_body text;
begin
  select * into v_batch from public.captain_cash_settlement_batches where id=new.batch_id;
  if not found then return new; end if;
  select full_name into v_captain_name from public.profiles where id=v_batch.captain_id;

  -- Seller-specific cumulative ledger summary: every message includes prior returns,
  -- this batch's return, cumulative remitted cash, and the remaining balance.
  for v_seller in
    select distinct private.seller_for_cash_ledger(l.order_type,l.order_id) as seller_id
    from public.captain_cash_settlement_items i
    join public.captain_cash_ledger l on l.id=i.ledger_id
    where i.batch_id=v_batch.id
      and private.seller_for_cash_ledger(l.order_type,l.order_id) is not null
  loop
    select
      coalesce(sum(l.cash_collected_iqd),0)::bigint,
      coalesce(sum(l.cash_remitted_iqd),0)::bigint,
      coalesce(sum(greatest(0,l.cash_collected_iqd-l.cash_remitted_iqd)),0)::bigint
    into v_seller_total_collected,v_seller_total_returned,v_seller_remaining
    from public.captain_cash_ledger l
    where l.captain_id=v_batch.captain_id
      and private.seller_for_cash_ledger(l.order_type,l.order_id)=v_seller.seller_id;

    select coalesce(sum(i.amount_iqd),0)::bigint into v_current_seller_return
    from public.captain_cash_settlement_items i
    join public.captain_cash_ledger l on l.id=i.ledger_id
    where i.batch_id=v_batch.id
      and private.seller_for_cash_ledger(l.order_type,l.order_id)=v_seller.seller_id;

    v_seller_body:=
      'SHAKH — تۆماری ڕادەستکردنی پارە' || E'\n'
      || 'کاپتن: '||coalesce(v_captain_name,'—')||E'\n'
      || 'وەسڵی مامەڵە: '||v_batch.id::text||E'\n'
      || 'پارەی ئەمجار: '||to_char(v_current_seller_return,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'کۆی پێشتر و ئەمجار ڕادەستکراو: '||to_char(v_seller_total_returned,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'کۆی کاشی وەرگیراو: '||to_char(v_seller_total_collected,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'پارەی ماوە بۆ ڕادەستکردن: '||to_char(v_seller_remaining,'FM999,999,999,999')||' د.ع'||E'\n'
      || 'ئەم ڕاپۆرتە کۆی مامەڵەکانی پێشوو و ئەم گواستنەوەیە لەخۆدەگرێت.';

    for v_preference in
      select pref.user_id,pref.phone_e164
      from public.whatsapp_delivery_preferences pref
      where pref.enabled and pref.phone_e164 is not null
        and (pref.user_id=v_seller.seller_id or exists(
          select 1 from public.user_roles ur where ur.user_id=pref.user_id and ur.role::text='super_admin'
        ))
    loop
      insert into public.whatsapp_message_outbox(
        event_key,event_type,recipient_user_id,recipient_phone,settlement_batch_id,message_body,metadata
      ) values(
        'cash-return:'||v_batch.id::text||':seller:'||v_seller.seller_id::text||':user:'||v_preference.user_id::text,
        'cash_return',v_preference.user_id,v_preference.phone_e164,v_batch.id,v_seller_body,
        jsonb_build_object('batch_id',v_batch.id,'captain_id',v_batch.captain_id,'seller_id',v_seller.seller_id,
          'current_return_iqd',v_current_seller_return,'cumulative_returned_iqd',v_seller_total_returned,
          'collected_iqd',v_seller_total_collected,'remaining_iqd',v_seller_remaining)
      ) on conflict(event_key) do nothing;
    end loop;
  end loop;

  select
    coalesce(sum(l.cash_collected_iqd),0)::bigint,
    coalesce(sum(l.cash_remitted_iqd),0)::bigint,
    coalesce(sum(greatest(0,l.cash_collected_iqd-l.cash_remitted_iqd)),0)::bigint
  into v_total_collected,v_total_returned,v_remaining
  from public.captain_cash_ledger l
  where l.captain_id=v_batch.captain_id;

  v_admin_body:=
    'SHAKH — کورتەی ڕادەستکردنی کاش' || E'\n'
    || 'کاپتن: '||coalesce(v_captain_name,'—')||E'\n'
    || 'ژمارەی مامەڵە: '||v_batch.id::text||E'\n'
    || 'پارەی ئەمجار: '||to_char(v_batch.amount_iqd,'FM999,999,999,999')||' د.ع'||E'\n'
    || 'کۆی گشتی پارەی وەرگیراو: '||to_char(v_total_collected,'FM999,999,999,999')||' د.ع'||E'\n'
    || 'کۆی پێشتر و ئەمجار ڕادەستکراو: '||to_char(v_total_returned,'FM999,999,999,999')||' د.ع'||E'\n'
    || 'پارەی ماوە بۆ ڕادەستکردن: '||to_char(v_remaining,'FM999,999,999,999')||' د.ع';

  for v_admin in
    select pref.user_id,pref.phone_e164
    from public.whatsapp_delivery_preferences pref
    join public.user_roles ur on ur.user_id=pref.user_id
    where pref.enabled and pref.phone_e164 is not null and ur.role::text='super_admin'
  loop
    insert into public.whatsapp_message_outbox(
      event_key,event_type,recipient_user_id,recipient_phone,settlement_batch_id,message_body,metadata
    ) values(
      'cash-return:'||v_batch.id::text||':admin:'||v_admin.user_id::text,
      'cash_return',v_admin.user_id,v_admin.phone_e164,v_batch.id,v_admin_body,
      jsonb_build_object('batch_id',v_batch.id,'captain_id',v_batch.captain_id,
        'current_return_iqd',v_batch.amount_iqd,'cumulative_returned_iqd',v_total_returned,
        'collected_iqd',v_total_collected,'remaining_iqd',v_remaining)
    ) on conflict(event_key) do nothing;
  end loop;
  return new;
end;
$function$;

revoke all on function private.notify_captain_cash_return_whatsapp() from public, anon, authenticated;

create or replace function public.get_my_whatsapp_outbox_status()
returns table(
  id uuid,
  event_type text,
  status text,
  attempt_count integer,
  provider_message_id text,
  last_error text,
  created_at timestamptz,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;

  return query
  select o.id,o.event_type,o.status,o.attempt_count,o.provider_message_id,o.last_error,o.created_at,o.sent_at
  from public.whatsapp_message_outbox o
  where o.recipient_user_id=auth.uid()
  order by o.created_at desc
  limit 30;
end;
$function$;
revoke all on function public.get_my_whatsapp_outbox_status() from public, anon;
grant execute on function public.get_my_whatsapp_outbox_status() to authenticated;

create or replace function public.queue_order_receipt_whatsapp(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_receipt public.order_receipts%rowtype;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;

  select * into v_receipt from public.order_receipts where id=p_receipt_id;
  if not found then raise exception 'Receipt not found'; end if;

  if v_receipt.buyer_id is distinct from auth.uid()
     and v_receipt.seller_id is distinct from auth.uid()
     and v_receipt.captain_id is distinct from auth.uid()
     and not private.has_permission('orders.view_all')
     and not private.has_permission('wallets.manage') then
    raise exception using errcode='42501', message='Not permitted to send this receipt';
  end if;

  v_count:=private.enqueue_sale_receipt_whatsapp(p_receipt_id);
  return jsonb_build_object('receipt_id',p_receipt_id,'queued_recipients',v_count);
end;
$function$;
revoke all on function public.queue_order_receipt_whatsapp(uuid) from public, anon;
grant execute on function public.queue_order_receipt_whatsapp(uuid) to authenticated;

