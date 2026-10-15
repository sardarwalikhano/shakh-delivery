-- Require the core electronics listing specifications at the database boundary.
-- Legacy posts remain readable/editable for stock-only changes; existing rows are not rewritten.
begin;

create or replace function private.validate_electronics_post_specs()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_product_type text;
  v_color text;
  v_condition text;
  v_stock_text text;
  v_stock integer;
  v_ram text;
  v_storage text;
begin
  if new.category <> 'electronics'::public.post_category then
    return new;
  end if;

  -- Stock changes from checkout/cancellation must not force older legacy posts
  -- to rewrite otherwise unchanged specifications.
  if tg_op = 'UPDATE'
    and old.category = 'electronics'::public.post_category
    and new.category = 'electronics'::public.post_category
    and old.brand is not distinct from new.brand
    and old.price_iqd is not distinct from new.price_iqd
    and (old.category_details - 'stock_quantity') is not distinct from
        (new.category_details - 'stock_quantity') then
    return new;
  end if;

  if char_length(btrim(coalesce(new.brand, ''))) = 0 then
    raise exception using errcode = '22023', message = 'بڕاندی ئامێر پێویستە.';
  end if;
  if new.price_iqd is null or new.price_iqd <= 0 then
    raise exception using errcode = '22023', message = 'نرخی ئەلیکترۆنیات دەبێت لە سفر زیاتر بێت.';
  end if;

  v_product_type := btrim(coalesce(new.category_details->>'product_type', ''));
  if v_product_type not in (
    'phone','tablet','laptop','desktop','monitor','tv','audio','camera',
    'gaming','appliance','accessory','other'
  ) then
    raise exception using errcode = '22023', message = 'جۆری ئامێری ئەلیکترۆنیات دیاری بکە.';
  end if;

  v_color := btrim(coalesce(new.category_details->>'color', ''));
  if v_color not in ('black','white','blue','silver','gray','gold','green','red','purple','pink','other') then
    raise exception using errcode = '22023', message = 'ڕەنگی ئامێر دیاری بکە.';
  end if;

  v_condition := btrim(coalesce(new.category_details->>'condition', ''));
  if v_condition not in ('new','open_box','refurbished','used') then
    raise exception using errcode = '22023', message = 'دۆخی ئامێر دیاری بکە.';
  end if;

  v_stock_text := btrim(coalesce(new.category_details->>'stock_quantity', ''));
  if length(v_stock_text) < 1 or length(v_stock_text) > 6 or v_stock_text !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'ژمارەی کۆگا دروست نییە.';
  end if;
  v_stock := v_stock_text::integer;
  if v_stock < 1 or v_stock > 100000 then
    raise exception using errcode = '22023', message = 'کۆگا دەبێت لە ١ تا ١٠٠٬٠٠٠ دانە بێت.';
  end if;

  if v_product_type in ('phone','tablet','laptop','desktop') then
    v_ram := btrim(coalesce(new.category_details->>'ram_capacity', ''));
    v_storage := btrim(coalesce(new.category_details->>'storage_capacity', ''));
    if v_ram = '' then
      raise exception using errcode = '22023', message = 'بۆ مۆبایل، تابلێت، لاپتۆپ و دیسکتۆپ RAM دیاری بکە.';
    end if;
    if v_storage = '' then
      raise exception using errcode = '22023', message = 'بۆ مۆبایل، تابلێت، لاپتۆپ و دیسکتۆپ بیرگە / Storage دیاری بکە.';
    end if;
    if char_length(v_ram) > 120 or char_length(v_storage) > 120 then
      raise exception using errcode = '22023', message = 'زانیاریی RAM یان Storage زۆر درێژە.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_electronics_post_specs() from public, anon, authenticated;

drop trigger if exists posts_validate_electronics_specs on public.posts;
create trigger posts_validate_electronics_specs
  before insert or update of category, brand, category_details, price_iqd
  on public.posts
  for each row
  execute function private.validate_electronics_post_specs();

commit;
