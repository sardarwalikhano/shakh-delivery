import { supabase } from '@/lib/supabase/client';
import { deletePostImages, uploadPostImage } from '@/lib/storage/postMedia';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import type { ApparelSeason, ApparelType, ApparelVariant, Post, PostCategory, PostTarget } from './types';

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
  apparel?: ApparelPostInput;
}): Promise<Post> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not authenticated');

  const user = userData.user;
  const title = input.title.trim();
  const isApparelPost = input.category === 'fashion';

  if (isApparelPost && !input.apparel) {
    throw new Error('بۆ پۆستی جل‌وبەرگ، زانیاریی جۆر، وێنە، ڕەنگ، قەبارە و کۆگا پێویستە.');
  }
  if (input.apparel) {
    const price = input.priceIqd ?? 0;
    if (!Number.isFinite(price) || price <= 0) throw new Error('نرخی جل‌وبەرگ دەبێت لە سفر زیاتر بێت.');
    if (input.apparel.images.length < 1 || input.apparel.images.length > 8) {
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
      if (!Number.isInteger(variant.stock_quantity) || variant.stock_quantity < 0) {
        throw new Error('ژمارەی کۆگا دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بێت.');
      }
      if (variant.price_iqd != null && (!Number.isFinite(variant.price_iqd) || variant.price_iqd <= 0)) {
        throw new Error('نرخی تایبەتی قەبارە/ڕەنگ دەبێت لە سفر زیاتر بێت.');
      }
      if (variant.image_index != null && (variant.image_index < 0 || variant.image_index >= input.apparel.images.length)) {
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
      price_iqd: input.priceIqd ?? null,
      location: input.location?.trim() || null,
      status: input.apparel ? 'archived' : 'active',
      ...(input.apparel ? {
        apparel_type: input.apparel.apparel_type,
        brand: input.apparel.brand?.trim() || null,
        material: input.apparel.material?.trim() || null,
        country_of_origin: input.apparel.country_of_origin?.trim() || null,
        season: input.apparel.season ?? null,
        discount_percent: input.apparel.discount_percent,
      } : {}),
    })
    .select('*')
    .single();

  if (createError) throw createError;
  const postId = created.id as string;
  const uploadedPaths: string[] = [];

  if (!input.apparel) return created as Post;

  try {
    for (const file of input.apparel.images) {
      uploadedPaths.push(await uploadPostImage(user.id, postId, file));
    }

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

    const postImages = uploadedPaths.map((storage_path) => ({ storage_path, alt_ku: title }));
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

export async function listActivePosts(): Promise<Post[]> {
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
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data as Post | null;
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
