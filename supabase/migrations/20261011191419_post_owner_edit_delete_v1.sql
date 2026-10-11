-- Allow owners to edit their own post details and safely remove a listing from public feeds.
-- Deletion is soft: keep the post row and linked order history intact.
create or replace function public.update_owned_post_details(
  p_post_id uuid,
  p_title text,
  p_content text,
  p_price_amount numeric,
  p_location text,
  p_discount_percent integer,
  p_brand text,
  p_material text,
  p_country_of_origin text,
  p_season text,
  p_item_condition text,
  p_apparel_audience text
)
returns public.posts
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_post public.posts%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.*
    into v_post
  from public.posts p
  where p.id = p_post_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Post was not found or is not visible to this user';
  end if;

  if v_post.author_id <> (select auth.uid())
     and not private.has_permission('posts.manage') then
    raise exception using errcode = '42501', message = 'Only the post owner or an authorized post manager can edit this post';
  end if;

  if not private.has_permission('posts.update_own')
     and not private.has_permission('posts.manage') then
    raise exception using errcode = '42501', message = 'Missing posts.update_own permission';
  end if;

  if p_title is null or char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 180 then
    raise exception using errcode = '22023', message = 'Title must contain 3 to 180 characters';
  end if;
  if p_content is null or char_length(p_content) > 12000 then
    raise exception using errcode = '22023', message = 'Post content is too long';
  end if;
  if p_price_amount is not null and p_price_amount < 0 then
    raise exception using errcode = '22023', message = 'Price cannot be negative';
  end if;
  if p_discount_percent is null or p_discount_percent < 0 or p_discount_percent > 99 then
    raise exception using errcode = '22023', message = 'Discount must be between 0 and 99 percent';
  end if;
  if v_post.category = 'fashion'::public.post_category
     and (p_price_amount is null or p_price_amount <= 0) then
    raise exception using errcode = '22023', message = 'Apparel price must be greater than zero';
  end if;
  if v_post.category = 'cars'::public.post_category
     and (p_price_amount is null or p_price_amount <= 0) then
    raise exception using errcode = '22023', message = 'Vehicle price must be greater than zero';
  end if;

  update public.posts
  set title = btrim(p_title),
      content = btrim(p_content),
      price_iqd = p_price_amount,
      location = nullif(btrim(coalesce(p_location, '')), ''),
      discount_percent = p_discount_percent,
      brand = case when v_post.category = 'fashion'::public.post_category then nullif(btrim(coalesce(p_brand, '')), '') else brand end,
      material = case when v_post.category = 'fashion'::public.post_category then nullif(btrim(coalesce(p_material, '')), '') else material end,
      country_of_origin = case when v_post.category = 'fashion'::public.post_category then nullif(btrim(coalesce(p_country_of_origin, '')), '') else country_of_origin end,
      season = case when v_post.category = 'fashion'::public.post_category then nullif(btrim(coalesce(p_season, '')), '') else season end,
      item_condition = case when v_post.category = 'fashion'::public.post_category then nullif(btrim(coalesce(p_item_condition, '')), '') else item_condition end,
      apparel_audience = case when v_post.category = 'fashion'::public.post_category then nullif(btrim(coalesce(p_apparel_audience, '')), '') else apparel_audience end
  where id = p_post_id
  returning * into v_post;

  -- Vehicle pricing lives in vehicle_listings; update it in the same transaction
  -- so the public card and detailed vehicle price cannot diverge.
  if v_post.category = 'cars'::public.post_category then
    update public.vehicle_listings
      set price_amount = p_price_amount,
          discount_percent = p_discount_percent
    where post_id = p_post_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Vehicle details were not found; no post changes were saved';
    end if;
  end if;

  return v_post;
end;
$$;

revoke all on function public.update_owned_post_details(uuid,text,text,numeric,text,integer,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_owned_post_details(uuid,text,text,numeric,text,integer,text,text,text,text,text,text) to authenticated;

create or replace function public.soft_delete_owned_post(p_post_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_post public.posts%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.*
    into v_post
  from public.posts p
  where p.id = p_post_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Post was not found or is not visible to this user';
  end if;

  if v_post.author_id <> (select auth.uid())
     and not private.has_permission('posts.manage') then
    raise exception using errcode = '42501', message = 'Only the post owner or an authorized post manager can remove this post';
  end if;

  if not private.has_permission('posts.delete_own')
     and not private.has_permission('posts.manage') then
    raise exception using errcode = '42501', message = 'Missing posts.delete_own permission';
  end if;
  if not private.has_permission('posts.update_own')
     and not private.has_permission('posts.manage') then
    raise exception using errcode = '42501', message = 'Missing posts.update_own permission required to hide this post safely';
  end if;

  update public.posts
    set status = 'deleted'::public.post_status
  where id = p_post_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Post was not removed';
  end if;

  return true;
end;
$$;

revoke all on function public.soft_delete_owned_post(uuid) from public, anon;
grant execute on function public.soft_delete_owned_post(uuid) to authenticated;
