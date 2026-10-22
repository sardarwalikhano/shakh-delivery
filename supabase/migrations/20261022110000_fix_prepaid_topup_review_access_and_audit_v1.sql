-- Fix prepaid top-up review access, requester identity visibility, and auditing.
-- RLS remains the row-level boundary: users see their own requests, wallet
-- managers can review all requests. This grant does not make the table public.

grant select on table public.prepaid_topup_requests to authenticated;

drop policy if exists profiles_select_wallet_managers on public.profiles;
create policy profiles_select_wallet_managers
  on public.profiles
  for select
  to authenticated
  using (private.has_permission('wallets.manage'));

drop policy if exists user_roles_select_wallet_managers on public.user_roles;
create policy user_roles_select_wallet_managers
  on public.user_roles
  for select
  to authenticated
  using (private.has_permission('wallets.manage'));

-- Put top-up request events in the existing Realtime publication when supported.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'prepaid_topup_requests'
     ) then
    alter publication supabase_realtime add table public.prepaid_topup_requests;
  end if;
end;
$$;

-- Every submitted prepaid request records its requester in the audit trail and
-- notifies the authorized wallet reviewers. Notification failure must never
-- roll back a valid top-up request; the persisted request and audit event remain
-- authoritative.
create or replace function private.audit_prepaid_topup_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_reviewer record;
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = new.user_id;

  insert into public.audit_logs(actor_user_id, action, resource_type, resource_id, metadata)
  values (
    new.user_id,
    'wallet.topup.requested',
    'prepaid_topup_request',
    new.id::text,
    jsonb_build_object(
      'request_id', new.id,
      'user_id', new.user_id,
      'requester_name', nullif(btrim(v_profile.full_name), ''),
      'requester_email', nullif(btrim(v_profile.email), ''),
      'requester_phone', nullif(btrim(v_profile.phone), ''),
      'amount_iqd', new.amount_iqd,
      'payment_method', new.payment_method,
      'status', new.status,
      'requested_at', new.requested_at
    )
  );

  for v_reviewer in
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where rp.permission_code = 'wallets.manage'
  loop
    begin
      perform private.create_notification(
        v_reviewer.user_id,
        'prepaid_topup_request',
        'داواکاریی نوێی پریپەید',
        coalesce(nullif(btrim(v_profile.full_name), ''), v_profile.email, 'بەکارهێنەر')
          || ' داوای زیادکردنی ' || new.amount_iqd::text || ' د.ع لە جزدانی پریپەید کرد.',
        'طلب شحن رصيد جديد',
        'تم تقديم طلب شحن رصيد جديد وهو بانتظار المراجعة.',
        'New prepaid top-up request',
        coalesce(nullif(btrim(v_profile.full_name), ''), v_profile.email, 'A user')
          || ' requested a prepaid top-up of IQD ' || new.amount_iqd::text || '.',
        '/dashboard/wallet',
        'prepaid_topup_request',
        new.id,
        jsonb_build_object(
          'request_id', new.id,
          'requester_id', new.user_id,
          'requester_name', nullif(btrim(v_profile.full_name), ''),
          'requester_email', nullif(btrim(v_profile.email), ''),
          'requester_phone', nullif(btrim(v_profile.phone), ''),
          'amount_iqd', new.amount_iqd,
          'payment_method', new.payment_method,
          'status', new.status
        )
      );
    exception when others then
      raise warning 'Unable to notify prepaid wallet reviewer % for request %',
        v_reviewer.user_id, new.id;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function private.audit_prepaid_topup_request() from public, anon, authenticated;

drop trigger if exists audit_prepaid_topup_request on public.prepaid_topup_requests;
create trigger audit_prepaid_topup_request
  after insert on public.prepaid_topup_requests
  for each row execute function private.audit_prepaid_topup_request();
