-- Allow one account to hold multiple independently approved roles.
-- The role-request workflow and AuthorizationContext already support a role list,
-- but the original user_roles primary key allowed only one row per user.
-- This migration is intentionally additive and fails safely if schema dependencies
-- require a coordinated migration instead of dropping a referenced primary key.

do $$
declare
  v_pk_name text;
  v_pk_columns text[];
  v_inbound_fk_count integer;
begin
  select c.conname, array_agg(a.attname order by key_col.ordinality)
    into v_pk_name, v_pk_columns
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as key_col(attnum, ordinality)
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = key_col.attnum
  where c.conrelid = 'public.user_roles'::regclass
    and c.contype = 'p'
  group by c.conname;

  if v_pk_name is null then
    raise exception 'Cannot enable multi-role assignments: public.user_roles has no primary key.';
  end if;

  if v_pk_columns = array['user_id']::text[] then
    select count(*)
      into v_inbound_fk_count
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.user_roles'::regclass;

    if v_inbound_fk_count > 0 then
      raise exception 'Cannot safely replace public.user_roles primary key: % foreign key(s) reference this table. Review dependencies before retrying.', v_inbound_fk_count;
    end if;

    execute format('alter table public.user_roles drop constraint %I', v_pk_name);
    alter table public.user_roles
      add constraint user_roles_pkey primary key (user_id, role);
  elsif v_pk_columns <> array['user_id', 'role']::text[] then
    raise exception 'Unexpected public.user_roles primary key columns: %. Manual review required; no schema change was applied.', v_pk_columns;
  end if;
end
$$;

-- The composite primary key permits distinct roles per user and still prevents
-- duplicate assignments of the same role to the same user.

-- Keep the new-user trigger compatible with the composite key. Without this
-- update, ON CONFLICT (user_id) would fail after the primary key is replaced.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer'::public.app_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
