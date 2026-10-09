import { supabase } from '@/lib/supabase/client';

export const POST_MEDIA_BUCKET = 'post-media';
export const MAX_POST_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export function validatePostImage(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('تەنها وێنەی JPG، PNG یان WebP ڕێگەپێدراوە.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('قەبارەی هەر وێنەیەک نابێت لە 5MB زیاتر بێت.');
  }
}

export function getPostImageUrl(storagePath: string): string {
  return supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function uploadPostImage(userId: string, postId: string, file: File): Promise<string> {
  validatePostImage(file);
  const path = `posts/${userId}/${postId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function deletePostImages(storagePaths: string[]): Promise<void> {
  if (!storagePaths.length) return;
  const { error } = await supabase.storage.from(POST_MEDIA_BUCKET).remove(storagePaths);
  if (error) throw error;
}
