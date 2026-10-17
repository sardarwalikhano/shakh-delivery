-- Enforce only essential supermarket post fields at the database boundary.
-- Nutrition, batch and product metadata remain optional.
begin;

create or replace function private.validate_supermarket_post_before_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_stock_text text;
  v_stock_quantity integer;
begin
  if new.category <> 'supermarket'::public.post_category
    or new.status <> 'active'::public.post_status then
    return new;
  end if;

  if new.price_iqd is null or new.price_iqd <= 0 then
    raise exception using errcode = '22023',
      message = 'نرخی کاڵای سوپەرمارکێت دەبێت لە سفر زیاتر بێت.';
  end if;

  if char_length(btrim(coalesce(new.location, ''))) < 2 then
    raise exception using errcode = '22023',
      message = 'شوێنی فرۆشیار پێویستە.';
  end if;

  if jsonb_typeof(new.images) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'وێنەی کاڵای سوپەرمارکێت پێویستە.';
  end if;

  if jsonb_array_length(new.images) < 1 or jsonb_array_length(new.images) > 8 then
    raise exception using errcode = '22023',
      message = 'بۆ کاڵای سوپەرمارکێت لانیکەم یەک وێنە و زۆرترین ٨ وێنە هەڵبژێرە.';
  end if;

  v_stock_text := btrim(coalesce(new.category_details->>'stock_quantity', ''));
  if length(v_stock_text) < 1
    or length(v_stock_text) > 6
    or v_stock_text !~ '^[0-9]+$' then
    raise exception using errcode = '22023',
      message = 'ژمارەی دانەی کاڵای سوپەرمارکێت پێویستە.';
  end if;

  v_stock_quantity := v_stock_text::integer;
  if v_stock_quantity < 1 or v_stock_quantity > 100000 then
    raise exception using errcode = '22023',
      message = 'ژمارەی دانە دەبێت لە ١ تا ١٠٠٬٠٠٠ دانە بێت.';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_supermarket_post_before_publish() from public, anon, authenticated;

drop trigger if exists posts_validate_supermarket_before_publish on public.posts;
create trigger posts_validate_supermarket_before_publish
before insert or update of category, status, price_iqd, images, location, category_details
on public.posts
for each row execute function private.validate_supermarket_post_before_publish();

commit;
