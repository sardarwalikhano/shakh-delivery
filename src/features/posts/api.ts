import { supabase } from '@/lib/supabase/client';
import { deletePostImages, MAX_POST_IMAGES, uploadPostImage, validatePostImage } from '@/lib/storage/postMedia';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import type { ApparelAudience, ApparelCondition, ApparelSeason, ApparelType, ApparelVariant, Post, PostCategory, PostTarget } from './types';
import { VEHICLE_PHOTO_KIND_LABELS, validateVehicleListing, vehicleListingToDatabase, type VehicleListingDraft, type VehiclePhotoKind } from './vehicleTypes';

export type ApparelVariantInput = {
  color_name: string;
  color_hex: string;
  size_label: string;
  stock_quantity: number;
  price_iqd?: number | null;
  image_index?: number | null;
};

export type ApparelPostInput = {
  apparel_type: ApparelType;
  brand?: string | null;
  material?: string | null;
  country_of_origin?: string | null;
  season?: ApparelSeason | null;
  discount_percent: number;
  images: File[];
  variants: ApparelVariantInput[];
};

export async function getAllowedPostTargets(): Promise<PostTarget[]> {
  const { data, error } = await supabase.rpc('get_allowed_post_targets');
  if (error) throw error;
  return (data ?? []) as PostTarget[];
}

export async function createPost(input: {
  publisherRole: AppRole;
  category: PostCategory;
  title: string;
  content: string;
  priceIqd?: number | null;
  location?: string | null;
  itemCondition?: ApparelCondition;
  apparelAudience?: ApparelAudience;
  images?: File[];
  apparel?: ApparelPostInput;
  vehicle?: { details: VehicleListingDraft; imageKinds?: VehiclePhotoKind[] };
}): Promise<Post> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not authenticated');

  const user = userData.user;
  const title = input.title.trim();
  const isApparelPost = input.category === 'fashion';
  const isVehiclePost = input.category === 'cars';
  const imageFiles = input.apparel?.images ?? input.images ?? [];
  const needsStagedPublish = Boolean(input.apparel) || Boolean(input.vehicle) || imageFiles.length > 0;

  if (isApparelPost && !input.apparel) {
    throw new Error('بۆ پۆستی جل‌وبەرگ، زانیاریی جۆر، وێنە، ڕەنگ، قەبارە و کۆگا پێویستە.');
  }

  if (isVehiclePost && !input.vehicle) {
    throw new Error('پۆستی ئۆتۆمبێل پێویستی بە فۆڕمی تەواوی Shakh Cars هەیە.');
  }
  if (input.vehicle && !isVehiclePost) {
    throw new Error('زانیاریی ئۆتۆمبێل تەنها لە category ـی cars پەسەندە.');
  }
  if (input.vehicle) {
    const vehicleValidation = validateVehicleListing(input.vehicle.details);
    if (vehicleValidation) throw new Error(vehicleValidation);
    if (imageFiles.length < 1 || imageFiles.length > MAX_POST_IMAGES) {
      throw new Error('بۆ ئۆتۆمبێل لانیکەم یەک وێنە و زۆرترین ٨ وێنە هەڵبژێرە.');
    }
    if (input.vehicle.imageKinds && input.vehicle.imageKinds.length !== imageFiles.length) {
      throw new Error('جۆری وێنەکان لەگەڵ ژمارەی وێنەکان ناگونجێت.');
    }
  }
  if (imageFiles.length > MAX_POST_IMAGES) {
    throw new Error(`زۆرترین ژمارەی وێنە ${MAX_POST_IMAGES} دانەیە.`);
  }
  imageFiles.forEach(validatePostImage);

  if (input.apparel) {
    const price = input.priceIqd ?? 0;
    if (!Number.isFinite(price) || price <= 0) throw new Error('نرخی جل‌وبەرگ دەبێت لە سفر زیاتر بێت.');
    if (imageFiles.length < 1 || imageFiles.length > MAX_POST_IMAGES) {
      throw new Error('بۆ جل‌وبەرگ ١ تا ٨ وێنە هەڵبژێرە.');
    }
    if (!input.apparel.variants.length) throw new Error('لانیکەم یەک ڕەنگ و قەبارە زیاد بکە.');
    if (!input.apparel.variants.some((variant) => variant.stock_quantity > 0)) {
      throw new Error('کۆگای لانیکەم یەک ڕەنگ و قەبارە دەبێت زیاتر لە سفر بێت.');
    }
    const seen = new Set<string>();
    for (const variant of input.apparel.variants) {
      const key = `${variant.color_hex.toLowerCase()}::${variant.size_label.trim().toLocaleLowerCase()}`;
      if (seen.has(key)) throw new Error('هەمان ڕەنگ و قەبارە دووبارە داخڵ کراوە.');
      seen.add(key);
      if (!/^#[0-9A-Fa-f]{6}$/.test(variant.color_hex)) throw new Error('کۆدی HEX ـی ڕەنگ دروست نییە.');
      if (!Number.isInteger(variant.stock_quantity) || variant.stock_quantity < 0) {
        throw new Error('ژمارەی کۆگا دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بێت.');
      }
      if (variant.price_iqd != null && (!Number.isFinite(variant.price_iqd) || variant.price_iqd <= 0)) {
        throw new Error('نرخی تایبەتی قەبارە/ڕەنگ دەبێت لە سفر زیاتر بێت.');
      }
      if (variant.image_index != null && (!Number.isInteger(variant.image_index) || variant.image_index < 0 || variant.image_index >= imageFiles.length)) {
        throw new Error('وێنەی تایبەتی ڕەنگ دروست نییە.');
      }
    }
  }

  const { data: created, error: createError } = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
      publisher_role: input.publisherRole,
      category: input.category,
      title,
      content: input.content.trim(),
      price_iqd: input.vehicle ? Number(input.vehicle.details.price_amount) : (input.priceIqd ?? null),
      location: input.vehicle ? input.vehicle.details.location.trim() : (input.location?.trim() || null),
      status: needsStagedPublish ? 'archived' : 'active',
      ...(input.apparel ? {
        apparel_type: input.apparel.apparel_type,
        brand: input.apparel.brand?.trim() || null,
        material: input.apparel.material?.trim() || null,
        country_of_origin: input.apparel.country_of_origin?.trim() || null,
        season: input.apparel.season ?? null,
        discount_percent: input.apparel.discount_percent,
        item_condition: input.itemCondition ?? 'new',
        apparel_audience: input.apparelAudience ?? 'all',
      } : {}),
    })
    .select('*')
    .single();

  if (createError) throw createError;
  const postId = created.id as string;
  if (!needsStagedPublish) return created as Post;

  const uploadedPaths: string[] = [];
  try {
    if (input.vehicle) {
      const { error: vehicleDetailsError } = await supabase
        .from('vehicle_listings')
        .insert({ post_id: postId, ...vehicleListingToDatabase(input.vehicle.details) });
      if (vehicleDetailsError) throw vehicleDetailsError;
    }

    for (const file of imageFiles) {
      uploadedPaths.push(await uploadPostImage(user.id, postId, file));
    }

    if (input.apparel) {
      const rows = input.apparel.variants.map((variant) => ({
        post_id: postId,
        color_name: variant.color_name.trim(),
        color_hex: variant.color_hex.toLowerCase(),
        size_label: variant.size_label.trim(),
        stock_quantity: variant.stock_quantity,
        price_iqd: variant.price_iqd ?? null,
        image_path: variant.image_index == null ? null : uploadedPaths[variant.image_index] ?? null,
      }));

      const { error: variantsError } = await supabase.from('apparel_variants').insert(rows);
      if (variantsError) throw variantsError;
    }

    const postImages = uploadedPaths.map((storage_path, index) => {
      const photoKind = input.vehicle?.imageKinds?.[index] ?? '';
      return {
        storage_path,
        alt_ku: input.vehicle && photoKind ? VEHICLE_PHOTO_KIND_LABELS[photoKind] : title,
      };
    });
    const { data: published, error: publishError } = await supabase
      .from('posts')
      .update({ images: postImages, status: 'active' })
      .eq('id', postId)
      .eq('author_id', user.id)
      .select('*')
      .single();

    if (publishError) throw publishError;
    return published as Post;
  } catch (error) {
    // Roll back this in-progress publish only; never touch existing posts.
    try { await supabase.from('posts').delete().eq('id', postId).eq('author_id', user.id); } catch { /* preserve original error */ }
    try { await deletePostImages(uploadedPaths); } catch { /* storage cleanup can be retried by an admin */ }
    throw error;
  }
}

export type OwnedPostDetailsPatch = {
  title: string;
  content: string;
  priceAmount: number | null;
  location: string | null;
  discountPercent: number;
  brand?: string | null;
  material?: string | null;
  countryOfOrigin?: string | null;
  season?: ApparelSeason | null;
  itemCondition?: ApparelCondition | null;
  apparelAudience?: ApparelAudience | null;
};

export async function updateOwnedPostDetails(postId: string, patch: OwnedPostDetailsPatch): Promise<Post> {
  const { data, error } = await supabase.rpc('update_owned_post_details', {
    p_post_id: postId,
    p_title: patch.title,
    p_content: patch.content,
    p_price_amount: patch.priceAmount,
    p_location: patch.location,
    p_discount_percent: patch.discountPercent,
    p_brand: patch.brand ?? null,
    p_material: patch.material ?? null,
    p_country_of_origin: patch.countryOfOrigin ?? null,
    p_season: patch.season ?? null,
    p_item_condition: patch.itemCondition ?? null,
    p_apparel_audience: patch.apparelAudience ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase هیچ وەڵامێکی بۆ پاشەکەوتکردنی پۆست نەگەڕاندەوە.');
  return data as Post;
}

export async function softDeleteOwnedPost(postId: string): Promise<void> {
  const { data, error } = await supabase.rpc('soft_delete_owned_post', { p_post_id: postId });
  if (error) throw error;
  if (data !== true) throw new Error('پۆستەکە نەشاردرایەوە. دووبارە هەوڵ بدەوە.');
}

export async function listActivePosts(): Promise<Post[]> {
  // The public feed needs only post columns. Do not couple every category
  // (food, general, beauty, delivery, etc.) to the vehicle-listing relation:
  // vehicle details are loaded on the detail page, and a relation/schema/RLS
  // problem must not make every active post disappear from the feed.
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as Post[];
}

export async function getMyPosts(authorId: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', authorId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as Post[];
}

export async function getActivePostById(postId: string): Promise<Post | null> {
  // RLS exposes active posts to permitted viewers and inactive posts only to
  // their owner or a post manager. This allows owners to repair archived posts
  // without making archived/deleted rows public.
  const { data, error } = await supabase
    .from('posts')
    .select('*, vehicle_listing:vehicle_listings(*)')
    .eq('id', postId)
    .neq('status', 'deleted')
    .maybeSingle();

  if (error) throw error;
  return data as Post | null;
}

export async function getManageablePosts(): Promise<Post[]> {
  // Keep the management feed independent from optional category-specific detail
  // tables (vehicle_listings, apparel_variants, etc.). A broken/missing detail
  // relation must never hide otherwise visible posts from the owner.
  const pageSize = 500;
  const allPosts: Post[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as Post[];
    allPosts.push(...page);
    if (page.length < pageSize) break;
  }

  return allPosts;
}

export async function replaceOwnedPostImages(postId: string, files: File[]): Promise<Post> {
  if (files.length < 1) throw new Error('لانیکەم یەک وێنە هەڵبژێرە.');
  if (files.length > MAX_POST_IMAGES) throw new Error(`زۆرترین ژمارەی وێنە ${MAX_POST_IMAGES} دانەیە.`);
  files.forEach(validatePostImage);

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('پێویستە دووبارە بچیتە ژوورەوە.');
  const userId = authData.user.id;

  const { data: existing, error: readError } = await supabase
    .from('posts')
    .select('id,author_id,title,images,status')
    .eq('id', postId)
    .neq('status', 'deleted')
    .maybeSingle();

  if (readError) throw readError;
  if (!existing) throw new Error('پۆستەکە نەدۆزرایەوە یان دەسەڵاتی بینینی نییە.');
  if (existing.author_id !== userId) {
    throw new Error('بۆ گۆڕینی وێنەکان دەبێت خاوەنی پۆستەکە بیت.');
  }

  const oldImages = Array.isArray(existing.images)
    ? (existing.images as Array<{ storage_path?: unknown }>).filter(
        (image): image is { storage_path: string } => typeof image?.storage_path === 'string',
      )
    : [];
  const oldPaths = oldImages
    .map((image) => image.storage_path)
    .filter((path) => path.startsWith(`posts/${userId}/${postId}/`));

  const uploadedPaths: string[] = [];
  let committed = false;

  try {
    for (const file of files) {
      uploadedPaths.push(await uploadPostImage(userId, postId, file));
    }

    const nextImages = uploadedPaths.map((storage_path, index) => ({
      storage_path,
      alt_ku: existing.title || `وێنەی پۆست ${index + 1}`,
    }));

    const { data: updated, error: updateError } = await supabase
      .from('posts')
      .update({ images: nextImages })
      .eq('id', postId)
      .eq('author_id', userId)
      .neq('status', 'deleted')
      .select('*')
      .single();

    if (updateError) throw updateError;
    committed = true;

    // Removing old images happens after the row points to the new objects. A
    // cleanup failure must not turn a successful photo replacement into a
    // reported save failure or remove files now referenced by the post.
    if (oldPaths.length) {
      try { await deletePostImages(oldPaths); } catch { /* stale objects can be cleaned up later */ }
    }

    return updated as Post;
  } catch (error) {
    if (!committed && uploadedPaths.length) {
      try { await deletePostImages(uploadedPaths); } catch { /* preserve the original error */ }
    }
    throw error;
  }
}

export async function saveManagedApparelPost(input: {
  postId: string;
  patch: { title: string; content: string; price_iqd: number; location: string | null; discount_percent: number; item_condition: ApparelCondition; apparel_audience: ApparelAudience };
  variants: Array<{ id?: string; color_name: string; color_hex: string; size_label: string; stock_quantity: number; price_iqd: number | null }>;
}): Promise<void> {
  const variantPatch = input.variants.map((variant) => ({
    ...(variant.id ? { id: variant.id } : {}),
    color_name: variant.color_name.trim(),
    color_hex: variant.color_hex.toLowerCase(),
    size_label: variant.size_label.trim(),
    stock_quantity: Number(variant.stock_quantity),
    price_iqd: variant.price_iqd == null ? null : Number(variant.price_iqd),
  }));
  const { error } = await supabase.rpc('save_apparel_post_and_variants', {
    p_post_id: input.postId,
    p_post_patch: input.patch,
    p_variant_patch: variantPatch,
  });
  if (error) throw error;
}

export async function getApparelVariants(postId: string): Promise<ApparelVariant[]> {
  const { data, error } = await supabase
    .from('apparel_variants')
    .select('id,post_id,color_name,color_hex,size_label,stock_quantity,price_iqd,image_path,created_at,updated_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ApparelVariant[];
}
