drop policy if exists "profiles_select_dispatch_staff" on public.profiles;
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped"
on public.profiles for select to authenticated
using (
  (select auth.uid()) = id
  or (select private.has_permission('deliveries.view_all'))
  or (select private.has_permission('deliveries.assign'))
);

drop policy if exists "user_roles_select_dispatch_staff" on public.user_roles;
drop policy if exists "user_roles_select_scoped" on public.user_roles;
create policy "user_roles_select_scoped"
on public.user_roles for select to authenticated
using (
  (select auth.uid()) = user_id
  or (select private.has_permission('deliveries.view_all'))
  or (select private.has_permission('deliveries.assign'))
);
