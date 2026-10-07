import { supabase } from '@/lib/supabase/client';
import type { Cart, CartItem, Category, Product, ProductVariant, StoreSummary } from './types';

type ProductRow = Omit<Product, 'store' | 'category' | 'images' | 'variants'> & {
  stores: StoreSummary[];
  categories: Category[];
  images?: Product['images'];
};

function mapProduct(row: ProductRow, images: Product['images'] = [], variants: ProductVariant[] = []): Product {
  return {
    ...row,
    store: row.stores?.[0] ?? null,
    category: row.categories?.[0] ?? null,
    images,
    variants,
  };
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active')
    .eq('is_active', true)
    .is('parent_id', null)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getProducts(options?: { search?: string; categoryId?: string; featured?: boolean; limit?: number }): Promise<Product[]> {
  const limit = Math.min(Math.max(options?.limit ?? 48, 1), 60);
  let query = supabase
    .from('products')
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,stores!inner(id,name_ku,name_ar,name_en,slug,logo_url,status),categories(id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active),images:product_images(id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order)')
    .eq('status', 'active')
    .eq('stores.status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  const search = options?.search?.trim();
  if (search) {
    const safe = search.replace(/[%_]/g, '\\$&');
    query = query.or(`name_ku.ilike.%${safe}%,name_ar.ilike.%${safe}%,name_en.ilike.%${safe}%`);
  }
  if (options?.categoryId) query = query.eq('category_id', options.categoryId);
  if (options?.featured) query = query.eq('is_featured', true);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ProductRow[]).map((row) => mapProduct(row, row.images ?? []));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,stores!inner(id,name_ku,name_ar,name_en,slug,logo_url,status),categories(id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active)')
    .eq('slug', slug)
    .eq('status', 'active')
    .eq('stores.status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const productId = data.id as string;
  const [{ data: imageData, error: imageError }, { data: variantData, error: variantError }] = await Promise.all([
    supabase.from('product_images').select('id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order').eq('product_id', productId).order('sort_order', { ascending: true }),
    supabase.from('product_variants').select('id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active').eq('product_id', productId).eq('is_active', true).order('created_at', { ascending: true }),
  ]);

  if (imageError) throw imageError;
  if (variantError) throw variantError;

  return mapProduct(data as ProductRow, (imageData ?? []) as Product['images'], (variantData ?? []) as ProductVariant[]);
}

export async function isWishlisted(userId: string, productId: string): Promise<boolean> {
  const { data, error } = await supabase.from('wishlists').select('product_id').eq('user_id', userId).eq('product_id', productId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function toggleWishlist(userId: string, productId: string, active: boolean): Promise<boolean> {
  if (active) {
    const { error } = await supabase.from('wishlists').delete().eq('user_id', userId).eq('product_id', productId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase.from('wishlists').insert({ user_id: userId, product_id: productId });
  if (error) throw error;
  return true;
}

export async function getWishlist(userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('wishlists')
    .select('product_id,products!inner(id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,stores!inner(id,name_ku,name_ar,name_en,slug,logo_url,status),categories(id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active),images:product_images(id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order))')
    .eq('user_id', userId);

  if (error) throw error;
  return ((data ?? []).map((row: { products: ProductRow[] }) => {
    const product = row.products?.[0];
    return product ? mapProduct(product, product.images ?? []) : null;
  }).filter((product): product is Product => Boolean(product)));
}

async function getOrCreateCart(userId: string): Promise<Cart> {
  const existing = await supabase.from('carts').select('id,user_id,currency').eq('user_id', userId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Cart;

  const created = await supabase.from('carts').insert({ user_id: userId }).select('id,user_id,currency').single();
  if (!created.error && created.data) return created.data as Cart;

  const fallback = await supabase.from('carts').select('id,user_id,currency').eq('user_id', userId).maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data) throw created.error ?? new Error('Could not create cart.');
  return fallback.data as Cart;
}

export async function getCart(userId: string): Promise<{ cart: Cart | null; items: CartItem[] }> {
  const { data: cartData, error: cartError } = await supabase.from('carts').select('id,user_id,currency').eq('user_id', userId).maybeSingle();
  if (cartError) throw cartError;
  if (!cartData) return { cart: null, items: [] };

  const { data, error } = await supabase
    .from('cart_items')
    .select('id,cart_id,product_id,variant_id,quantity,added_price_iqd,products(id,slug,name_ku,name_ar,name_en,base_price_iqd,stock_quantity),product_variants(id,name_ku,name_ar,name_en,price_iqd,stock_quantity)')
    .eq('cart_id', cartData.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return {
    cart: cartData as Cart,
    items: ((data ?? []) as Array<{
      id: string;
      cart_id: string;
      product_id: string;
      variant_id: string | null;
      quantity: number;
      added_price_iqd: number;
      products: Array<Pick<Product, 'id' | 'slug' | 'name_ku' | 'name_ar' | 'name_en' | 'base_price_iqd' | 'stock_quantity'>>;
      product_variants: Array<Pick<ProductVariant, 'id' | 'name_ku' | 'name_ar' | 'name_en' | 'price_iqd' | 'stock_quantity'>>;
    }>).map((item) => ({
      id: item.id,
      cart_id: item.cart_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      added_price_iqd: item.added_price_iqd,
      product: item.products?.[0] ?? null,
      variant: item.product_variants?.[0] ?? null,
    })),
  };
}

export async function addToCart(userId: string, productId: string, variantId: string | null, quantity: number, displayedPrice: number): Promise<void> {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const cart = await getOrCreateCart(userId);
  let existingQuery = supabase
    .from('cart_items')
    .select('id,quantity,variant_id')
    .eq('cart_id', cart.id)
    .eq('product_id', productId);
  existingQuery = variantId === null ? existingQuery.is('variant_id', null) : existingQuery.eq('variant_id', variantId);
  const { data: existing, error: existingError } = await existingQuery.limit(1);

  if (existingError) throw existingError;

  const same = (existing ?? [])[0] as { id: string; quantity: number } | undefined;
  if (same) {
    const { error } = await supabase.from('cart_items').update({ quantity: same.quantity + safeQuantity, added_price_iqd: displayedPrice }).eq('id', same.id);
    if (error) throw error;
    return;
  }


  const { error } = await supabase.from('cart_items').insert({
    cart_id: cart.id,
    product_id: productId,
    variant_id: variantId,
    quantity: safeQuantity,
    added_price_iqd: displayedPrice,
  });
  if (error) throw error;
}

export async function updateCartItem(userId: string, itemId: string, quantity: number): Promise<void> {
  const { cart } = await getCart(userId);
  if (!cart) throw new Error('Cart not found.');
  if (quantity <= 0) {
    const { error } = await supabase.from('cart_items').delete().eq('id', itemId).eq('cart_id', cart.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('cart_items').update({ quantity: Math.floor(quantity) }).eq('id', itemId).eq('cart_id', cart.id);
  if (error) throw error;
}

export async function removeCartItem(userId: string, itemId: string): Promise<void> {
  await updateCartItem(userId, itemId, 0);
}
