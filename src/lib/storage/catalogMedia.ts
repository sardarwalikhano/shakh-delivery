import { supabase } from '@/lib/supabase/client';

export const PRODUCT_MEDIA_BUCKET = 'product-media';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function getProductImageUrl(storagePath: string): string {
  return supabase.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export function validateCatalogImage(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('تەنها JPG، PNG یان WebP ڕێگەپێدراوە.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('قەبارەی وێنە نابێت لە 5MB زیاتر بێت.');
  }
}

function extensionFor(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function uploadProductImage(userId: string, productId: string, file: File): Promise<string> {
  validateCatalogImage(file);
  const path = `products/${userId}/${productId}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function deleteProductImage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(PRODUCT_MEDIA_BUCKET).remove([storagePath]);
  if (error) throw error;
}
