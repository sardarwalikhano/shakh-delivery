-- Phase 9: trigger helper runtime permission.
-- Remote migration version: 20261007125848.
-- Trigger-backed authenticated DML needs EXECUTE on the trigger function.
grant execute on function public.set_updated_at() to authenticated;
