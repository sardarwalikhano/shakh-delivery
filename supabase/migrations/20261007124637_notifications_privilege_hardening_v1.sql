-- Phase 8 hardening: authenticated clients may only SELECT notifications
-- and UPDATE the read_at column. No table-wide write/DDL-related privileges.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
