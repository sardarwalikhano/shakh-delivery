import { supabase } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import type { Post, PostCategory, PostTarget } from './types';

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
}): Promise<Post> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: userData.user.id,
      publisher_role: input.publisherRole,
      category: input.category,
      title: input.title.trim(),
      content: input.content.trim(),
      price_iqd: input.priceIqd ?? null,
      location: input.location?.trim() || null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Post;
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
