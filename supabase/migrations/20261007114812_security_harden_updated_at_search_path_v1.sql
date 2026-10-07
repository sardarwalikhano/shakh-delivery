-- Applied to Supabase project jjtmtxrkbewmdxdmgtrf as migration security_harden_updated_at_search_path_v1.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
