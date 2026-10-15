import { supabase } from '@/lib/supabase/client';

const SHARE_TOKEN_PREFIX = 'shakh.post-share.token:';
const ATTRIBUTED_TOKEN_PREFIX = 'shakh.post-share.attributed:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PostShareLink = {
  url: string;
  token: string;
  title: string;
  reward_iqd: number;
  reward_enabled: boolean;
  expires_days: number;
};

/**
 * Keep the shared post link ID in this browser session.
 * Checkout forwards it to the database RPC, which checks that it belongs
 * to the post and that buyer and sharer are different before recording rewards.
 */
export function rememberPostShareToken(postId: string, token: string): void {
  if (!UUID_PATTERN.test(token)) return;
  const key = SHARE_TOKEN_PREFIX + postId;
  if (window.sessionStorage.getItem(key) !== token) {
    window.sessionStorage.setItem(key, token);
    window.sessionStorage.removeItem(ATTRIBUTED_TOKEN_PREFIX + postId);
  }
}

export function getPostShareToken(postId: string): string | null {
  const token = window.sessionStorage.getItem(SHARE_TOKEN_PREFIX + postId);
  return token && UUID_PATTERN.test(token) ? token : null;
}

/**
 * The production schema uses share-link IDs and validates attribution during
 * checkout. No client-side insert or non-existent attribution RPC is needed.
 */
export async function recordPostShareAttribution(postId: string): Promise<boolean> {
  const token = getPostShareToken(postId);
  if (!token) return false;
  window.sessionStorage.setItem(ATTRIBUTED_TOKEN_PREFIX + postId, token);
  return true;
}

export async function createPostShareLink(postId: string): Promise<PostShareLink> {
  const { data, error } = await supabase.rpc('create_post_share_link', {
    p_post_id: postId,
  });
  if (error) throw new Error(error.message);

  // The deployed RPC returns the UUID of post_share_links, not a JSON object.
  const token = typeof data === 'string' ? data : '';
  if (!UUID_PATTERN.test(token)) {
    throw new Error('نەتوانرا لینکی شێرکردن دروست بکرێت.');
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('title,category,share_reward_iqd')
    .eq('id', postId)
    .eq('status', 'active')
    .single();
  if (postError) throw new Error(postError.message);

  const reward = Number(post?.share_reward_iqd ?? 0);
  const rewardEnabled = reward > 0 && (post?.category === 'food' || post?.category === 'fashion' || post?.category === 'electronics');
  const url = new URL(`/posts/${encodeURIComponent(postId)}`, window.location.origin);
  url.searchParams.set('share', token);

  return {
    url: url.toString(),
    token,
    title: post?.title ?? '',
    reward_iqd: reward,
    reward_enabled: rewardEnabled,
    expires_days: 30,
  };
}
