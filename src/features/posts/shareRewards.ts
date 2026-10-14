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
 * Persist attribution only for an authenticated buyer. The database enforces
 * self-referral rules and the 30-day attribution window. Local state merely
 * avoids repeating the same RPC on every render.
 */
export async function recordPostShareAttribution(postId: string): Promise<boolean> {
  const token = getPostShareToken(postId);
  if (!token) return false;

  const attributedKey = ATTRIBUTED_TOKEN_PREFIX + postId;
  if (window.sessionStorage.getItem(attributedKey) === token) return true;

  const { data, error } = await supabase.rpc('register_post_share_attribution', {
    p_share_token: token,
  });
  if (error) throw new Error(error.message);

  const result = data as { attributed?: boolean; reason?: string } | null;
  window.sessionStorage.setItem(attributedKey, token);
  return result?.attributed === true;
}

export async function createPostShareLink(postId: string): Promise<PostShareLink> {
  const { data, error } = await supabase.rpc('create_post_share_link', {
    p_post_id: postId,
  });
  if (error) throw new Error(error.message);

  const result = data as {
    token?: string;
    title?: string;
    reward_iqd?: number;
    reward_enabled?: boolean;
    expires_days?: number;
  } | null;
  if (!result?.token || !UUID_PATTERN.test(result.token)) {
    throw new Error('نەتوانرا لینکی شێرکردن دروست بکرێت.');
  }

  const url = new URL(`/posts/${encodeURIComponent(postId)}`, window.location.origin);
  url.searchParams.set('share', result.token);
  return {
    url: url.toString(),
    token: result.token,
    title: result.title ?? '',
    reward_iqd: Number(result.reward_iqd ?? 0),
    reward_enabled: result.reward_enabled === true,
    expires_days: Number(result.expires_days ?? 30),
  };
}
