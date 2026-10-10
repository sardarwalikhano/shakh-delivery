create or replace function public.save_apparel_post_and_variants(
  p_post_id uuid,
  p_post_patch jsonb,
  p_variant_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_author_id uuid;
  v_category public.post_category;
  v_title text;
  v_content text;
  v_base_price numeric(14,2);
  v_discount integer;
  v_condition text;
  v_audience text;
  v_location text;
  v_item jsonb;
  v_variant_id uuid;
  v_saved_id uuid;
  v_color_name text;
  v_color_hex text;
  v_size_label text;
  v_stock integer;
  v_price numeric(14,2);
  v_key text;
  v_seen_keys text[] := array[]::text[];
  v_saved_ids uuid[] := array[]::uuid[];
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (
    (select private.has_permission('posts.update_own'))
    or (select private.has_permission('posts.manage'))
  ) then
    raise exception 'Post update is not permitted';
  end if;

  select p.author_id, p.category
    into v_author_id, v_category
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found then raise exception 'Post not found'; end if;
  if v_author_id <> v_user_id and not (select private.has_permission('posts.manage')) then
    raise exception 'You can only edit your own posts';
  end if;
  if v_category <> 'fashion'::public.post_category then
    raise exception 'This inventory editor only accepts apparel posts';
  end if;

  if jsonb_typeof(coalesce(p_post_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'Post patch must be a JSON object';
  end if;
  if jsonb_typeof(coalesce(p_variant_patch, '[]'::jsonb)) <> 'array' then
    raise exception 'Variant inventory must be a JSON array';
  end if;
  if jsonb_array_length(coalesce(p_variant_patch, '[]'::jsonb)) > 200 then
    raise exception 'No more than 200 color/size combinations are allowed';
  end if;

  v_title := nullif(btrim(p_post_patch->>'title'), '');
  v_content := coalesce(p_post_patch->>'content', '');
  v_base_price := nullif(btrim(p_post_patch->>'price_iqd'), '')::numeric;
  v_discount := coalesce(nullif(btrim(p_post_patch->>'discount_percent'), '')::integer, 0);
  v_condition := coalesce(p_post_patch->>'item_condition', 'new');
  v_audience := coalesce(p_post_patch->>'apparel_audience', 'all');
  v_location := nullif(btrim(p_post_patch->>'location'), '');

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 180 then
    raise exception 'Title must contain 3 to 180 characters';
  end if;
  if v_base_price is null or v_base_price <= 0 then
    raise exception 'Price must be greater than zero';
  end if;
  if v_discount < 0 or v_discount > 99 then
    raise exception 'Discount must be between 0 and 99';
  end if;
  if v_condition not in ('new','used') then raise exception 'Invalid item condition'; end if;
  if v_audience not in ('men','women','kids','all') then raise exception 'Invalid apparel audience'; end if;

  -- Lock inventory rows before changing the matrix, preventing concurrent stock updates from racing.
  perform av.id
  from public.apparel_variants av
  where av.post_id = p_post_id
  for update;

  update public.posts
  set title = v_title,
      content = left(v_content, 12000),
      price_iqd = v_base_price,
      location = v_location,
      item_condition = v_condition,
      apparel_audience = v_audience,
      discount_percent = v_discount
  where id = p_post_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_variant_patch, '[]'::jsonb))
  loop
    v_color_name := nullif(btrim(v_item->>'color_name'), '');
    v_color_hex := lower(nullif(btrim(v_item->>'color_hex'), ''));
    v_size_label := nullif(btrim(v_item->>'size_label'), '');
    v_stock := nullif(btrim(v_item->>'stock_quantity'), '')::integer;
    v_price := nullif(btrim(v_item->>'price_iqd'), '')::numeric;

    if v_color_name is null or char_length(v_color_name) > 60 then
      raise exception 'Color name must contain 1 to 60 characters';
    end if;
    if v_color_hex is null or v_color_hex !~ '^#[0-9a-f]{6}$' then
      raise exception 'Color must be a valid six-digit HEX value';
    end if;
    if v_size_label is null or char_length(v_size_label) > 40 then
      raise exception 'Size label must contain 1 to 40 characters';
    end if;
    if v_stock is null or v_stock < 0 then
      raise exception 'Stock must be a whole number of zero or more';
    end if;
    if v_price is not null and v_price <= 0 then
      raise exception 'Variant price must be greater than zero or empty';
    end if;

    v_key := v_color_hex || '::' || lower(v_size_label);
    if v_key = any(v_seen_keys) then
      raise exception 'Duplicate color and size combination';
    end if;
    v_seen_keys := array_append(v_seen_keys, v_key);

    v_variant_id := nullif(btrim(v_item->>'id'), '')::uuid;
    v_saved_id := null;

    if v_variant_id is not null then
      update public.apparel_variants
      set color_name = v_color_name,
          color_hex = v_color_hex,
          size_label = v_size_label,
          stock_quantity = v_stock,
          price_iqd = v_price,
          updated_at = now()
      where id = v_variant_id and post_id = p_post_id
      returning id into v_saved_id;

      if v_saved_id is null then
        raise exception 'Variant does not belong to this post';
      end if;
      v_updated_count := v_updated_count + 1;
    else
      insert into public.apparel_variants (
        post_id, color_name, color_hex, size_label, stock_quantity, price_iqd
      )
      values (
        p_post_id, v_color_name, v_color_hex, v_size_label, v_stock, v_price
      )
      on conflict (post_id, color_hex, size_label)
      do update set
        color_name = excluded.color_name,
        stock_quantity = excluded.stock_quantity,
        price_iqd = excluded.price_iqd,
        updated_at = now()
      returning id into v_saved_id;
      v_inserted_count := v_inserted_count + 1;
    end if;

    if v_saved_id = any(v_saved_ids) then
      raise exception 'A variant id cannot be submitted more than once';
    end if;
    v_saved_ids := array_append(v_saved_ids, v_saved_id);
  end loop;

  -- Retire omitted combinations by setting stock to zero. Never delete variant rows
  -- because historical orders keep a foreign-key reference to their variant.
  update public.apparel_variants
  set stock_quantity = 0,
      updated_at = now()
  where post_id = p_post_id
    and not (id = any(v_saved_ids));

  return jsonb_build_object(
    'post_id', p_post_id,
    'updated_variants', v_updated_count,
    'inserted_or_reactivated_variants', v_inserted_count,
    'retired_variants', (
      select count(*) from public.apparel_variants av
      where av.post_id = p_post_id and av.stock_quantity = 0 and not (av.id = any(v_saved_ids))
    )
  );
end;
$function$;

revoke all on function public.save_apparel_post_and_variants(uuid, jsonb, jsonb) from public;
revoke all on function public.save_apparel_post_and_variants(uuid, jsonb, jsonb) from anon;
grant execute on function public.save_apparel_post_and_variants(uuid, jsonb, jsonb) to authenticated;
