-- Manual mobile-money payment proof for paid Home & Living posts and Umrah bookings.
-- No bank gateway is used. A submission stays pending until a privileged reviewer acts.
begin;

create table if not exists public.umrah_booking_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  package_post_id uuid not null references public.posts(id) on delete restrict,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 160),
  customer_phone text not null check (char_length(btrim(customer_phone)) between 6 and 40),
  traveler_count integer not null check (traveler_count between 1 and 30),
  preferred_departure_date date,
  customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
  package_price_iqd numeric(14,2) not null check (package_price_iqd > 0),
  total_amount_iqd numeric(16,2) not null check (total_amount_iqd > 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','pending_payment_review','confirmed','payment_rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint umrah_booking_amount_consistent check (total_amount_iqd = package_price_iqd * traveler_count)
);

create index if not exists umrah_booking_customer_created_idx
  on public.umrah_booking_requests(customer_id, created_at desc);
create index if not exists umrah_booking_package_created_idx
  on public.umrah_booking_requests(package_post_id, created_at desc);
alter table public.umrah_booking_requests enable row level security;
revoke all on public.umrah_booking_requests from public, anon, authenticated;
grant select on public.umrah_booking_requests to authenticated;

drop policy if exists umrah_booking_select_owner_or_post_manager on public.umrah_booking_requests;
create policy umrah_booking_select_owner_or_post_manager
  on public.umrah_booking_requests for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.has_permission('posts.manage')));

create table if not exists public.manual_payment_methods (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('fastpay','fib','asia_hawala')),
  label_ku text not null,
  account_identifier text,
  account_holder text,
  instructions_ku text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_manual_payment_method_has_account
    check (not is_active or char_length(btrim(coalesce(account_identifier,''))) >= 3)
);

insert into public.manual_payment_methods(provider,label_ku,is_active)
values
  ('fastpay','FastPay',false),
  ('fib','FIB',false),
  ('asia_hawala','ئاسیا حوالە',false)
on conflict (provider) do nothing;

alter table public.manual_payment_methods enable row level security;
revoke all on public.manual_payment_methods from public, anon, authenticated;
grant select, insert, update, delete on public.manual_payment_methods to authenticated;

drop policy if exists manual_payment_methods_read_active_or_manager on public.manual_payment_methods;
create policy manual_payment_methods_read_active_or_manager
  on public.manual_payment_methods for select to authenticated
  using (is_active or (select private.has_permission('posts.manage')));

drop policy if exists manual_payment_methods_manage on public.manual_payment_methods;
create policy manual_payment_methods_manage
  on public.manual_payment_methods for all to authenticated
  using ((select private.has_permission('posts.manage')))
  with check ((select private.has_permission('posts.manage')));

create table if not exists public.manual_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('home_living_post_fee','umrah_booking')),
  payer_id uuid not null references auth.users(id) on delete restrict,
  post_id uuid references public.posts(id) on delete cascade,
  booking_request_id uuid references public.umrah_booking_requests(id) on delete cascade,
  payment_method_id uuid not null references public.manual_payment_methods(id) on delete restrict,
  provider_snapshot text not null check (provider_snapshot in ('fastpay','fib','asia_hawala')),
  amount_iqd numeric(14,2) not null check (amount_iqd > 0),
  receipt_storage_path text not null unique,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_payment_target_matches_purpose check (
    (purpose = 'home_living_post_fee' and post_id is not null and booking_request_id is null)
    or (purpose = 'umrah_booking' and booking_request_id is not null and post_id is null)
  )
);

create index if not exists manual_payment_status_created_idx
  on public.manual_payment_submissions(status, created_at desc);
create index if not exists manual_payment_payer_created_idx
  on public.manual_payment_submissions(payer_id, created_at desc);
alter table public.manual_payment_submissions enable row level security;
revoke all on public.manual_payment_submissions from public, anon, authenticated;
grant select, insert on public.manual_payment_submissions to authenticated;

drop policy if exists manual_payment_submissions_read_owner_or_manager on public.manual_payment_submissions;
create policy manual_payment_submissions_read_owner_or_manager
  on public.manual_payment_submissions for select to authenticated
  using (payer_id = (select auth.uid()) or (select private.has_permission('posts.manage')));

drop policy if exists manual_payment_submissions_insert_valid_target on public.manual_payment_submissions;
create policy manual_payment_submissions_insert_valid_target
  on public.manual_payment_submissions for insert to authenticated
  with check (
    payer_id = (select auth.uid())
    and status = 'pending_review'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.manual_payment_methods m
      where m.id = payment_method_id
        and m.provider = provider_snapshot
        and m.is_active
    )
    and (
      (
        purpose = 'home_living_post_fee'
        and exists (
          select 1 from public.posts p
          where p.id = post_id
            and p.author_id = (select auth.uid())
            and p.category = 'home_living'::public.post_category
            and p.status = 'archived'::public.post_status
            and jsonb_array_length(p.images) > 0
            and case p.category_details->>'listing_kind'
              when 'property' then amount_iqd = 5000
              when 'furniture' then amount_iqd = 2000
              else false
            end
        )
      )
      or
      (
        purpose = 'umrah_booking'
        and exists (
          select 1 from public.umrah_booking_requests b
          where b.id = booking_request_id
            and b.customer_id = (select auth.uid())
            and b.status in ('awaiting_payment','payment_rejected')
            and b.total_amount_iqd = amount_iqd
        )
      )
    )
  );

-- Private storage: owners can upload/read their own payment proof; post managers can review it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'manual-payment-proofs',
  'manual-payment-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists manual_payment_proofs_upload_own on storage.objects;
create policy manual_payment_proofs_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'manual-payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists manual_payment_proofs_read_owner_or_manager on storage.objects;
create policy manual_payment_proofs_read_owner_or_manager
  on storage.objects for select to authenticated
  using (
    bucket_id = 'manual-payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.has_permission('posts.manage'))
    )
  );

drop policy if exists manual_payment_proofs_delete_own on storage.objects;
create policy manual_payment_proofs_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'manual-payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Users may not publish a Home & Living post directly by setting status='active'.
-- The review RPC runs with the post-management permission and is the publication path.
create or replace function private.guard_home_living_post_publication()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.category = 'home_living'::public.post_category
      and new.status = 'active'::public.post_status
      and not coalesce((select private.has_permission('posts.manage')), false) then
      raise exception using errcode='42501', message='Home & Living posts require manual payment review before publishing';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.category = 'home_living'::public.post_category
      and new.status = 'active'::public.post_status
      and (old.status is distinct from new.status or old.category is distinct from new.category)
      and not coalesce((select private.has_permission('posts.manage')), false) then
      raise exception using errcode='42501', message='Home & Living posts require manual payment review before publishing';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_home_living_post_publication() from public, anon, authenticated;
drop trigger if exists posts_home_living_publication_gate on public.posts;
create trigger posts_home_living_publication_gate
  before insert or update on public.posts
  for each row execute function private.guard_home_living_post_publication();

create or replace function public.create_umrah_booking_request(
  p_package_post_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_traveler_count integer,
  p_preferred_departure_date date default null,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_customer_id uuid := (select auth.uid());
  v_package public.posts%rowtype;
  v_booking public.umrah_booking_requests%rowtype;
  v_total numeric(16,2);
begin
  if v_customer_id is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if p_package_post_id is null then
    raise exception using errcode='22023', message='Umrah package is required';
  end if;
  if p_customer_name is null or char_length(btrim(p_customer_name)) not between 2 and 160 then
    raise exception using errcode='22023', message='Enter a valid customer name';
  end if;
  if p_customer_phone is null or char_length(btrim(p_customer_phone)) not between 6 and 40 then
    raise exception using errcode='22023', message='Enter a valid phone number';
  end if;
  if p_traveler_count is null or p_traveler_count not between 1 and 30 then
    raise exception using errcode='22023', message='Traveler count must be between 1 and 30';
  end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then
    raise exception using errcode='22023', message='The booking note is too long';
  end if;

  select * into v_package
  from public.posts p
  where p.id = p_package_post_id
    and p.category = 'umrah'::public.post_category
    and p.status = 'active'::public.post_status
  for key share;

  if not found then
    raise exception using errcode='P0002', message='The Umrah package is not available';
  end if;
  if v_package.author_id = v_customer_id then
    raise exception using errcode='42501', message='You cannot book your own Umrah package';
  end if;
  if v_package.price_iqd is null or v_package.price_iqd <= 0 then
    raise exception using errcode='22023', message='This Umrah package does not have a valid price';
  end if;

  v_total := round(v_package.price_iqd * p_traveler_count, 2);
  insert into public.umrah_booking_requests(
    customer_id,package_post_id,customer_name,customer_phone,traveler_count,
    preferred_departure_date,customer_note,package_price_iqd,total_amount_iqd,status
  ) values (
    v_customer_id,p_package_post_id,btrim(p_customer_name),btrim(p_customer_phone),
    p_traveler_count,p_preferred_departure_date,nullif(btrim(p_customer_note),''),
    v_package.price_iqd,v_total,'awaiting_payment'
  ) returning * into v_booking;

  return jsonb_build_object(
    'id',v_booking.id,'status',v_booking.status,'package_post_id',v_booking.package_post_id,
    'package_price_iqd',v_booking.package_price_iqd,'traveler_count',v_booking.traveler_count,
    'total_amount_iqd',v_booking.total_amount_iqd,'customer_name',v_booking.customer_name,
    'customer_phone',v_booking.customer_phone,'preferred_departure_date',v_booking.preferred_departure_date
  );
end;
$function$;

revoke all on function public.create_umrah_booking_request(uuid,text,text,integer,date,text) from public, anon;
grant execute on function public.create_umrah_booking_request(uuid,text,text,integer,date,text) to authenticated;

create or replace function public.review_manual_payment_submission(
  p_submission_id uuid,
  p_decision text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_submission public.manual_payment_submissions%rowtype;
begin
  if (select auth.uid()) is null or not (select private.has_permission('posts.manage')) then
    raise exception using errcode='42501', message='Post management permission is required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception using errcode='22023', message='Decision must be approved or rejected';
  end if;
  if p_admin_note is not null and char_length(p_admin_note) > 2000 then
    raise exception using errcode='22023', message='Admin note is too long';
  end if;

  select * into v_submission
  from public.manual_payment_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='Payment submission was not found';
  end if;
  if v_submission.status <> 'pending_review' then
    raise exception using errcode='22023', message='This payment submission has already been reviewed';
  end if;

  if v_submission.purpose = 'home_living_post_fee' and p_decision = 'approved' then
    update public.posts
    set status = 'active'::public.post_status
    where id = v_submission.post_id
      and author_id = v_submission.payer_id
      and category = 'home_living'::public.post_category
      and status = 'archived'::public.post_status
      and price_iqd > 0
      and jsonb_array_length(images) > 0
      and (
        (category_details->>'listing_kind' = 'property' and category_details->>'posting_fee_iqd' = '5000')
        or (category_details->>'listing_kind' = 'furniture' and category_details->>'posting_fee_iqd' = '2000')
      )
      and exists (
        select 1 from public.manual_payment_submissions m
        where m.id = p_submission_id
          and m.post_id = public.posts.id
          and m.status = 'pending_review'
          and m.amount_iqd = case public.posts.category_details->>'listing_kind'
            when 'property' then 5000
            when 'furniture' then 2000
            else 0
          end
      );
    if not found then
      raise exception using errcode='22023', message='The Home & Living post cannot be published';
    end if;
  elsif v_submission.purpose = 'umrah_booking' then
    update public.umrah_booking_requests
    set status = case when p_decision = 'approved' then 'confirmed' else 'payment_rejected' end,
        updated_at = now()
    where id = v_submission.booking_request_id
      and customer_id = v_submission.payer_id
      and status = 'pending_payment_review';
    if not found then
      raise exception using errcode='22023', message='The Umrah booking request is not awaiting review';
    end if;
  end if;

  update public.manual_payment_submissions
  set status = p_decision,
      admin_note = nullif(btrim(p_admin_note),''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = p_submission_id;

  return jsonb_build_object(
    'id',v_submission.id,'purpose',v_submission.purpose,'status',p_decision,
    'post_id',v_submission.post_id,'booking_request_id',v_submission.booking_request_id
  );
end;
$function$;

revoke all on function public.review_manual_payment_submission(uuid,text,text) from public, anon;
grant execute on function public.review_manual_payment_submission(uuid,text,text) to authenticated;

drop trigger if exists manual_payment_methods_set_updated_at on public.manual_payment_methods;
create trigger manual_payment_methods_set_updated_at
  before update on public.manual_payment_methods
  for each row execute function public.set_updated_at();

drop trigger if exists manual_payment_submissions_set_updated_at on public.manual_payment_submissions;
create trigger manual_payment_submissions_set_updated_at
  before update on public.manual_payment_submissions
  for each row execute function public.set_updated_at();

drop trigger if exists umrah_booking_requests_set_updated_at on public.umrah_booking_requests;
create trigger umrah_booking_requests_set_updated_at
  before update on public.umrah_booking_requests
  for each row execute function public.set_updated_at();

create or replace function private.advance_umrah_booking_on_payment_submission()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if new.purpose = 'umrah_booking' then
    update public.umrah_booking_requests
    set status = 'pending_payment_review', updated_at = now()
    where id = new.booking_request_id
      and customer_id = new.payer_id
      and status in ('awaiting_payment','payment_rejected');
    if not found then
      raise exception using errcode='22023', message='The Umrah booking is not ready for payment review';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.advance_umrah_booking_on_payment_submission() from public, anon, authenticated;
drop trigger if exists manual_payment_submission_advance_booking on public.manual_payment_submissions;
create trigger manual_payment_submission_advance_booking
  after insert on public.manual_payment_submissions
  for each row execute function private.advance_umrah_booking_on_payment_submission();

commit;
