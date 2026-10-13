-- Super-admin controlled platform sales commission and advance payment review
-- for car listings and Umrah booking requests.

drop policy if exists platform_fee_settings_admin_update on public.platform_fee_settings;
create policy platform_fee_settings_super_admin_update
on public.platform_fee_settings for update to authenticated
using ((select private.has_role((select auth.uid()), 'super_admin'::public.app_role)))
with check (
  (select private.has_role((select auth.uid()), 'super_admin'::public.app_role))
  and fee_percent between 0 and 100
);

delete from public.role_permissions
where permission_code = 'settings.manage' and role <> 'super_admin'::public.app_role;
insert into public.role_permissions(role, permission_code)
values ('super_admin'::public.app_role, 'settings.manage')
on conflict do nothing;

create table if not exists public.post_advance_fee_settings (
  purpose text primary key check (purpose in ('car_listing','umrah_booking')),
  amount_iqd numeric(14,2) not null default 0 check (amount_iqd >= 0),
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.post_advance_fee_settings(purpose,amount_iqd,is_enabled)
values ('car_listing',0,false),('umrah_booking',0,false)
on conflict (purpose) do nothing;

alter table public.post_advance_fee_settings enable row level security;
grant select on public.post_advance_fee_settings to authenticated;
grant update (amount_iqd,is_enabled,updated_at,updated_by) on public.post_advance_fee_settings to authenticated;
create policy post_advance_fee_settings_read_authenticated
  on public.post_advance_fee_settings for select to authenticated using (true);
create policy post_advance_fee_settings_update_super_admin
  on public.post_advance_fee_settings for update to authenticated
  using ((select private.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check (
    (select private.has_role((select auth.uid()), 'super_admin'::public.app_role))
    and amount_iqd >= 0
  );

create table if not exists public.advance_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null check (purpose in ('car_listing','umrah_booking')),
  post_id uuid references public.posts(id) on delete restrict,
  amount_iqd numeric(14,2) not null check (amount_iqd > 0),
  provider text not null check (provider in ('fib','fastpay')),
  transaction_reference text not null check (char_length(btrim(transaction_reference)) between 3 and 120),
  receipt_path text not null,
  booking_details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advance_payment_post_purpose_check check (
    (purpose='car_listing' and post_id is not null and booking_details='{}'::jsonb)
    or (purpose='umrah_booking' and post_id is not null)
  )
);
create index if not exists advance_payment_submissions_user_created_idx
  on public.advance_payment_submissions(payer_id,created_at desc);
create index if not exists advance_payment_submissions_status_created_idx
  on public.advance_payment_submissions(status,created_at desc);
create unique index if not exists advance_payment_one_open_car_fee_per_post
  on public.advance_payment_submissions(post_id)
  where purpose='car_listing' and status in ('pending','approved');

alter table public.advance_payment_submissions enable row level security;
grant select,insert on public.advance_payment_submissions to authenticated;
create policy advance_payment_select_owner_or_super_admin
  on public.advance_payment_submissions for select to authenticated
  using (payer_id=(select auth.uid()) or (select private.has_role((select auth.uid()),'super_admin'::public.app_role)));
create policy advance_payment_insert_owner_and_valid_fee
  on public.advance_payment_submissions for insert to authenticated
  with check (
    payer_id=(select auth.uid())
    and status='pending'
    and reviewed_by is null and reviewed_at is null
    and exists (
      select 1 from public.payment_provider_settings p
      where p.provider=advance_payment_submissions.provider and p.is_enabled
    )
    and exists (
      select 1 from public.post_advance_fee_settings f
      where f.purpose=advance_payment_submissions.purpose
        and f.is_enabled and f.amount_iqd=advance_payment_submissions.amount_iqd
    )
    and receipt_path like ((select auth.uid())::text || '/%')
    and exists (
      select 1 from public.posts p
      where p.id=advance_payment_submissions.post_id
        and (
          (advance_payment_submissions.purpose='car_listing' and p.author_id=(select auth.uid()) and p.category='cars' and p.status='archived')
          or (advance_payment_submissions.purpose='umrah_booking' and p.category='umrah' and p.status='active' and p.author_id<>(select auth.uid()))
        )
    )
  );

create or replace function public.get_enabled_advance_payment_providers()
returns table(provider text)
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select p.provider from public.payment_provider_settings p where p.is_enabled order by p.provider;
$$;
revoke all on function public.get_enabled_advance_payment_providers() from public,anon;
grant execute on function public.get_enabled_advance_payment_providers() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('advance-payment-receipts','advance-payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];
create policy advance_receipts_insert_own
on storage.objects for insert to authenticated
with check (bucket_id='advance-payment-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy advance_receipts_read_owner_or_super_admin
on storage.objects for select to authenticated
using (bucket_id='advance-payment-receipts' and (
  (storage.foldername(name))[1]=(select auth.uid())::text
  or (select private.has_role((select auth.uid()),'super_admin'::public.app_role))
));

create or replace function public.review_advance_payment(
  p_submission_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns public.advance_payment_submissions
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_submission public.advance_payment_submissions%rowtype;
begin
  if auth.uid() is null or not private.has_role(auth.uid(),'super_admin'::public.app_role) then
    raise exception using errcode='42501',message='Only super admin may review advance payments';
  end if;
  select * into v_submission from public.advance_payment_submissions
  where id=p_submission_id for update;
  if not found then raise exception using errcode='P0002',message='Payment submission not found'; end if;
  if v_submission.status <> 'pending' then raise exception using errcode='22023',message='Payment submission has already been reviewed'; end if;
  if p_approve and not exists (
    select 1 from public.payment_provider_settings p
    where p.provider=v_submission.provider and p.is_enabled
  ) then
    raise exception using errcode='22023',message='Payment provider is disabled';
  end if;

  update public.advance_payment_submissions
  set status=case when p_approve then 'approved' else 'rejected' end,
      review_note=nullif(btrim(p_review_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_submission_id returning * into v_submission;

  if p_approve and v_submission.purpose='car_listing' then
    update public.posts set status='active',updated_at=now()
    where id=v_submission.post_id and author_id=v_submission.payer_id and category='cars' and status='archived';
    if not found then raise exception using errcode='22023',message='Car listing is no longer awaiting approval'; end if;
  end if;

  if p_approve then
    insert into public.financial_ledger_entries(entry_kind,amount_iqd,status,source_table,source_id,note,created_by)
    values ('listing_fee',v_submission.amount_iqd,'paid','advance_payment_submissions',v_submission.id,
      case when v_submission.purpose='car_listing' then 'Car listing advance fee' else 'Umrah booking advance payment' end,auth.uid())
    on conflict do nothing;
  end if;
  return v_submission;
end;
$$;
revoke all on function public.review_advance_payment(uuid,boolean,text) from public,anon;
grant execute on function public.review_advance_payment(uuid,boolean,text) to authenticated;

create trigger advance_payment_submissions_set_updated_at
before update on public.advance_payment_submissions
for each row execute function public.set_updated_at();

create or replace function private.require_approved_car_listing_fee()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog,public,private
as $$
begin
  if new.category='cars'::public.post_category and new.status='active'::public.post_status
     and (select auth.uid()) is not null
     and not private.has_role((select auth.uid()),'super_admin'::public.app_role)
     and not exists (
       select 1 from public.advance_payment_submissions aps
       where aps.post_id=new.id and aps.payer_id=new.author_id
         and aps.purpose='car_listing' and aps.status='approved'
     ) then
    raise exception using errcode='42501',message='Car listings require a super-admin-approved advance payment before publication';
  end if;
  return new;
end;
$$;
drop trigger if exists posts_require_approved_car_listing_fee on public.posts;
create trigger posts_require_approved_car_listing_fee
before insert or update on public.posts
for each row execute function private.require_approved_car_listing_fee();

