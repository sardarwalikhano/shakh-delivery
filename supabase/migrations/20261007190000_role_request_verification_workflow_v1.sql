-- Role request workflow: users request a role, Super Admin verifies it,
-- and approval activates the role already defined in role_permissions.

create table if not exists public.role_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role public.app_role not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists role_requests_one_pending_per_user_role_idx
  on public.role_requests(user_id, requested_role) where status='pending';

create index if not exists role_requests_status_requested_at_idx
  on public.role_requests(status, requested_at desc);

alter table public.role_requests enable row level security;

insert into public.permissions(code, description)
values ('role_requests.review','Review and approve or reject user role requests')
on conflict (code) do update set description=excluded.description;

insert into public.role_permissions(role, permission_code)
values ('super_admin'::public.app_role,'role_requests.review')
on conflict do nothing;

drop policy if exists role_requests_select_scoped on public.role_requests;
create policy role_requests_select_scoped
on public.role_requests for select to authenticated
using (
  user_id=(select auth.uid())
  or (select private.has_permission('role_requests.review'))
);

create or replace function private.notify_role_request_reviewers(
  p_request_id uuid,
  p_user_email text,
  p_full_name text,
  p_requested_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_admin_id uuid;
begin
  for v_admin_id in select ur.user_id from public.user_roles ur where ur.role='super_admin'::public.app_role loop
    perform private.create_notification(
      v_admin_id,'role_request',
      'داواکارییەکی نوێی Role',
      coalesce(nullif(p_full_name,''),p_user_email,'بەکارهێنەر')||' داوای Role ـی '||p_requested_role::text||' کردووە. تکایە پشکنین و ڤەریفای بکە.',
      'طلب دور جديد',
      coalesce(nullif(p_full_name,''),p_user_email,'المستخدم')||' طلب دور '||p_requested_role::text||'. يرجى المراجعة والموافقة.',
      'New role request',
      coalesce(nullif(p_full_name,''),p_user_email,'User')||' requested the '||p_requested_role::text||' role. Please review and verify.',
      '/dashboard/role-requests','role_request',p_request_id,
      jsonb_build_object('request_id',p_request_id,'requested_role',p_requested_role,'user_email',p_user_email,'full_name',p_full_name,'status','pending')
    );
  end loop;
end;
$$;

revoke all on function private.notify_role_request_reviewers(uuid,text,text,public.app_role) from public,anon,authenticated;

create or replace function public.request_role(p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.role_requests%rowtype;
  v_email text;
  v_full_name text;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  if exists (select 1 from public.user_roles ur where ur.user_id=v_user_id and ur.role=p_role) then
    raise exception 'You already have this role';
  end if;

  select p.email,p.full_name into v_email,v_full_name from public.profiles p where p.id=v_user_id;

  insert into public.role_requests(user_id,requested_role,status)
  values(v_user_id,p_role,'pending')
  on conflict (user_id,requested_role) where status='pending'
  do update set updated_at=now()
  returning * into v_request;

  perform private.notify_role_request_reviewers(v_request.id,v_email,v_full_name,p_role);

  return jsonb_build_object(
    'id',v_request.id,
    'requested_role',v_request.requested_role,
    'status',v_request.status,
    'requested_at',v_request.requested_at
  );
end;
$$;

revoke all on function public.request_role(public.app_role) from public,anon;
grant execute on function public.request_role(public.app_role) to authenticated;

create or replace function public.review_role_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request public.role_requests%rowtype;
  v_status text := lower(btrim(p_status));
  v_reviewer uuid := (select auth.uid());
begin
  if v_reviewer is null then raise exception 'Not authenticated'; end if;
  if not (select private.has_permission('role_requests.review')) then raise exception 'Role request review is not permitted'; end if;
  if v_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;

  select * into v_request from public.role_requests where id=p_request_id for update;
  if not found then raise exception 'Role request not found'; end if;
  if v_request.status <> 'pending' then raise exception 'Role request is already reviewed'; end if;

  if v_status='approved' then
    insert into public.user_roles(user_id,role)
    values(v_request.user_id,v_request.requested_role)
    on conflict do nothing;

    update public.role_requests
    set status='approved',reviewed_at=now(),reviewed_by=v_reviewer,
        review_note=nullif(btrim(p_note),''),updated_at=now()
    where id=v_request.id;

    insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
    values(v_reviewer,'role_request.approved','role_request',v_request.id::text,
      jsonb_build_object('user_id',v_request.user_id,'requested_role',v_request.requested_role,'review_note',nullif(btrim(p_note),'')));

    perform private.create_notification(
      v_request.user_id,'role_request',
      'Role ـەکەت ڤەریفای کرا',
      'داواکاریی Role ـی '||v_request.requested_role::text||' پەسەند کرا و دەسەڵاتەکانی ئەم Role ـەت پێدرا.',
      'تمت الموافقة على الدور',
      'تمت الموافقة على طلب دور '||v_request.requested_role::text||' ومنحتك صلاحياته.',
      'Role request approved',
      'Your request for the '||v_request.requested_role::text||' role was approved and its permissions are now active.',
      '/account','role_request',v_request.id,
      jsonb_build_object('request_id',v_request.id,'requested_role',v_request.requested_role,'status','approved')
    );
  else
    update public.role_requests
    set status='rejected',reviewed_at=now(),reviewed_by=v_reviewer,
        review_note=nullif(btrim(p_note),''),updated_at=now()
    where id=v_request.id;

    insert into public.audit_logs(actor_user_id,action,resource_type,resource_id,metadata)
    values(v_reviewer,'role_request.rejected','role_request',v_request.id::text,
      jsonb_build_object('user_id',v_request.user_id,'requested_role',v_request.requested_role,'review_note',nullif(btrim(p_note),'')));

    perform private.create_notification(
      v_request.user_id,'role_request',
      'داواکاریی Role ڕەتکرایەوە',
      'داواکاریی Role ـی '||v_request.requested_role::text||' ڕەتکرایەوە.'||case when nullif(btrim(p_note),'') is not null then ' تێبینی: '||btrim(p_note) else '' end,
      'تم رفض طلب الدور',
      'تم رفض طلب دور '||v_request.requested_role::text||'.'||case when nullif(btrim(p_note),'') is not null then ' ملاحظة: '||btrim(p_note) else '' end,
      'Role request rejected',
      'Your request for the '||v_request.requested_role::text||' role was rejected.'||case when nullif(btrim(p_note),'') is not null then ' Note: '||btrim(p_note) else '' end,
      '/account','role_request',v_request.id,
      jsonb_build_object('request_id',v_request.id,'requested_role',v_request.requested_role,'status','rejected')
    );
  end if;

  select * into v_request from public.role_requests where id=p_request_id;
  return jsonb_build_object(
    'id',v_request.id,'user_id',v_request.user_id,'requested_role',v_request.requested_role,
    'status',v_request.status,'reviewed_at',v_request.reviewed_at,
    'reviewed_by',v_request.reviewed_by,'review_note',v_request.review_note
  );
end;
$$;

revoke all on function public.review_role_request(uuid,text,text) from public,anon;
grant execute on function public.review_role_request(uuid,text,text) to authenticated;

create or replace function public.list_pending_role_requests()
returns table(
  id uuid,user_id uuid,email text,full_name text,requested_role public.app_role,status text,requested_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select rr.id,rr.user_id,p.email,p.full_name,rr.requested_role,rr.status,rr.requested_at
  from public.role_requests rr
  join public.profiles p on p.id=rr.user_id
  where rr.status='pending'
    and (select private.has_permission('role_requests.review'))
  order by rr.requested_at asc;
$$;

revoke all on function public.list_pending_role_requests() from public,anon;
grant execute on function public.list_pending_role_requests() to authenticated;

create or replace function public.get_my_role_requests()
returns table(
  id uuid,requested_role public.app_role,status text,requested_at timestamptz,reviewed_at timestamptz,review_note text
)
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select rr.id,rr.requested_role,rr.status,rr.requested_at,rr.reviewed_at,rr.review_note
  from public.role_requests rr
  where rr.user_id=(select auth.uid())
  order by rr.requested_at desc;
$$;

revoke all on function public.get_my_role_requests() from public,anon;
grant execute on function public.get_my_role_requests() to authenticated;

create or replace function public.get_my_authorization()
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'role', (select ur.role from public.user_roles ur where ur.user_id=(select auth.uid()) order by ur.created_at asc limit 1),
    'roles', coalesce((select jsonb_agg(ur.role order by ur.created_at asc) from public.user_roles ur where ur.user_id=(select auth.uid())), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(distinct rp.permission_code order by rp.permission_code)
      from public.user_roles ur join public.role_permissions rp on rp.role=ur.role
      where ur.user_id=(select auth.uid())), '[]'::jsonb)
  );
$$;
