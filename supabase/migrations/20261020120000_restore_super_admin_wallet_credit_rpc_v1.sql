-- Restore the internal Super Admin wallet-credit RPC.
-- This operation is an internal adjustment; it does not represent externally received funds.
-- It makes no balance changes unless an authorized Super Admin explicitly submits a credit.
create or replace function public.super_admin_credit_own_prepaid_wallet(
  p_amount_iqd bigint,
  p_request_id uuid,
  p_note text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance bigint;
  v_tx_id uuid;
  v_note text := nullif(trim(p_note), '');
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.has_permission('wallets.manage') then
    raise exception using errcode = '42501', message = 'Only an authorized Super Admin may credit their own wallet';
  end if;
  if p_amount_iqd is null or p_amount_iqd < 1 or p_amount_iqd > 100000000 then
    raise exception using errcode = '22023', message = 'Amount must be between 1 and 100000000 IQD';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required for idempotency';
  end if;
  if v_note is null or length(v_note) < 5 or length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'A reason between 5 and 1000 characters is required';
  end if;

  insert into public.prepaid_wallet_accounts(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select balance_iqd into v_balance
  from public.prepaid_wallet_accounts
  where user_id = v_user_id
  for update;

  if exists (
    select 1 from public.prepaid_wallet_transactions
    where user_id = v_user_id
      and idempotency_key = 'superadmin-self-credit:' || p_request_id::text
  ) then
    select id into v_tx_id
    from public.prepaid_wallet_transactions
    where user_id = v_user_id
      and idempotency_key = 'superadmin-self-credit:' || p_request_id::text;

    return jsonb_build_object(
      'status', 'already_recorded',
      'transaction_id', v_tx_id,
      'balance_iqd', v_balance
    );
  end if;

  update public.prepaid_wallet_accounts
  set balance_iqd = balance_iqd + p_amount_iqd,
      lifetime_credited_iqd = lifetime_credited_iqd + p_amount_iqd,
      updated_at = now()
  where user_id = v_user_id
  returning balance_iqd into v_balance;

  insert into public.prepaid_wallet_transactions(
    user_id, transaction_type, amount_iqd, reference_type, reference_id,
    idempotency_key, description_ku, created_by
  )
  values (
    v_user_id, 'admin_adjustment', p_amount_iqd, 'super_admin_self_credit', p_request_id,
    'superadmin-self-credit:' || p_request_id::text,
    'زیادکردنی ناوخۆیی باڵانس بە دەستی سوپەر ئەدمین: ' || v_note,
    v_user_id
  )
  returning id into v_tx_id;

  insert into public.audit_logs(actor_user_id, action, resource_type, resource_id, metadata)
  values (
    v_user_id,
    'wallet.super_admin.self_credit',
    'prepaid_wallet_account',
    v_user_id::text,
    jsonb_build_object(
      'amount_iqd', p_amount_iqd,
      'transaction_id', v_tx_id,
      'request_id', p_request_id,
      'reason', v_note,
      'credit_type', 'internal_admin_adjustment',
      'balance_after_iqd', v_balance
    )
  );

  return jsonb_build_object(
    'status', 'credited',
    'transaction_id', v_tx_id,
    'balance_iqd', v_balance
  );
end;
$$;

revoke all on function public.super_admin_credit_own_prepaid_wallet(bigint, uuid, text) from public, anon;
grant execute on function public.super_admin_credit_own_prepaid_wallet(bigint, uuid, text) to authenticated;

notify pgrst, 'reload schema';
