-- Enable the existing realtime clients to observe restaurant menu and addon changes.
-- Add only missing tables; do not alter existing publication members or schema.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'restaurant_menu_details',
    'restaurant_menu_option_groups',
    'restaurant_menu_options'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
