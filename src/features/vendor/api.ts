import { supabase } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import type { ApparelProductType } from '@/lib/catalog/apparel';

export type VendorStore = {
  id: string;
  owner_id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  description_ku: string | null;
  description_ar: string | null;
  description_en: string | null;
  status: 'pending' | 'active' | 'suspended' | 'closed';
};

export type VendorProduct = {
  id: string;
  store_id: string;
  category_id: string | null;
  name_ku: string;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ku: string | null;
  description_ar: string | null;
  description_en: string | null;
  base_price_iqd: number;
  compare_at_price_iqd: number | null;
  currency: 'IQD';
  status: 'draft' | 'active' | 'archived';
  stock_quantity: number;
  is_featured: boolean;
  apparel_product_type: ApparelProductType | null;
  brand: string | null;
  material: string | null;
  country_of_origin: string | null;
  season: 'summer' | 'winter' | 'all_seasons' | null;
  seller_location: string | null;
  supermarket_type: 'food' | 'beverage' | 'cleaning' | 'daily_essentials' | 'fresh_food' | 'other' | null;
  quantity_value: number | null;
  quantity_unit: 'g' | 'kg' | 'ml' | 'l' | 'pack' | 'piece' | 'carton' | null;
  package_count: number | null;
  barcode: string | null;
  manufacturing_date: string | null;
  expiry_date: string | null;
  storage_instructions: string | null;
  ingredients: string | null;
  allergen_warnings: string | null;
  flavor: string | null;
  category?: { name_ku: string; name_ar: string; name_en: string } | null;
};

export type VendorProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_ku: string | null;
  alt_ar: string | null;
  alt_en: string | null;
  sort_order: number;
};

export type VendorVariant = {
  id: string;
  product_id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  sku: string | null;
  price_iqd: number | null;
  stock_quantity: number;
  is_active: boolean;
  color_name_ku: string | null;
  color_hex: string | null;
  size_label: string | null;
  color_image_storage_path: string | null;
  quantity_value: number | null;
  quantity_unit: 'g' | 'kg' | 'ml' | 'l' | 'pack' | 'piece' | 'carton' | null;
  package_count: number | null;
  flavor: string | null;
  barcode: string | null;
  manufacturing_date: string | null;
  expiry_date: string | null;
};

const vendorRoles: AppRole[] = ['restaurant_vendor', 'fashion_vendor', 'car_dealer', 'umrah_agency'];

function isVendorRole(role: AppRole | null): role is AppRole {
  return role !== null && vendorRoles.includes(role);
}

export async function getVendorStores(userId: string, role: AppRole | null): Promise<VendorStore[]> {
  if (!isVendorRole(role)) return [];
  const { data, error } = await supabase
    .from('stores')
    .select('id,owner_id,name_ku,name_ar,name_en,slug,logo_url,cover_url,description_ku,description_ar,description_en,status')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorStore[];
}

export async function createVendorStore(userId: string, input: Pick<VendorStore, 'name_ku' | 'name_ar' | 'name_en' | 'slug'> & Partial<Pick<VendorStore, 'description_ku' | 'description_ar' | 'description_en'>>): Promise<VendorStore> {
  const { data, error } = await supabase
    .from('stores')
    .insert({ ...input, owner_id: userId, status: 'pending' })
    .select('id,owner_id,name_ku,name_ar,name_en,slug,logo_url,cover_url,description_ku,description_ar,description_en,status')
    .single();
  if (error) throw error;
  return data as VendorStore;
}

export async function updateVendorStore(userId: string, storeId: string, input: Partial<Pick<VendorStore, 'name_ku' | 'name_ar' | 'name_en' | 'slug' | 'logo_url' | 'cover_url' | 'description_ku' | 'description_ar' | 'description_en'>>): Promise<VendorStore> {
  const { data, error } = await supabase
    .from('stores')
    .update(input)
    .eq('id', storeId)
    .eq('owner_id', userId)
    .select('id,owner_id,name_ku,name_ar,name_en,slug,logo_url,cover_url,description_ku,description_ar,description_en,status')
    .single();
  if (error) throw error;
  return data as VendorStore;
}

export async function getVendorProducts(userId: string, storeId?: string): Promise<VendorProduct[]> {
  let query = supabase
    .from('products')
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,categories(name_ku,name_ar,name_en),stores!inner(owner_id)')
    .eq('stores.owner_id', userId)
    .order('created_at', { ascending: false });
  if (storeId) query = query.eq('store_id', storeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row as VendorProduct & { categories: VendorProduct['category'][] };
    return { ...item, category: item.categories?.[0] ?? null };
  });
}

export async function createVendorProduct(userId: string, input: {
  store_id: string;
  category_id: string | null;
  name_ku: string;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ku?: string;
  description_ar?: string;
  description_en?: string;
  base_price_iqd: number;
  compare_at_price_iqd?: number | null;
  stock_quantity: number;
  apparel_product_type?: ApparelProductType | null;
  brand?: string | null;
  material?: string | null;
  country_of_origin?: string | null;
  season?: 'summer' | 'winter' | 'all_seasons' | null;
  seller_location?: string | null;
  supermarket_type?: VendorProduct['supermarket_type'];
  quantity_value?: number | null;
  quantity_unit?: VendorProduct['quantity_unit'];
  package_count?: number | null;
  barcode?: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  storage_instructions?: string | null;
  ingredients?: string | null;
  allergen_warnings?: string | null;
  flavor?: string | null;
}): Promise<VendorProduct> {
  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, status: 'draft', currency: 'IQD' })
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor')
    .single();
  if (error) throw error;
  await assertStoreOwner(userId, input.store_id);
  return data as VendorProduct;
}

export async function updateVendorProduct(userId: string, productId: string, input: Partial<Pick<VendorProduct, 'category_id' | 'name_ku' | 'name_ar' | 'name_en' | 'slug' | 'description_ku' | 'description_ar' | 'description_en' | 'base_price_iqd' | 'compare_at_price_iqd' | 'stock_quantity' | 'is_featured' | 'apparel_product_type' | 'brand' | 'material' | 'country_of_origin' | 'season' | 'seller_location' | 'supermarket_type' | 'quantity_value' | 'quantity_unit' | 'package_count' | 'barcode' | 'manufacturing_date' | 'expiry_date' | 'storage_instructions' | 'ingredients' | 'allergen_warnings' | 'flavor'>>): Promise<VendorProduct> {
  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', productId)
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor')
    .single();
  if (error) throw error;
  await assertProductOwner(userId, productId);
  return data as VendorProduct;
}

export async function deleteDraftProduct(userId: string, productId: string): Promise<void> {
  await assertProductOwner(userId, productId);
  const { error } = await supabase.from('products').delete().eq('id', productId).eq('status', 'draft');
  if (error) throw error;
}

export async function getVendorVariants(userId: string, productId: string): Promise<VendorVariant[]> {
  await assertProductOwner(userId, productId);
  const { data, error } = await supabase
    .from('product_variants')
    .select('id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active,color_name_ku,color_hex,size_label,color_image_storage_path,quantity_value,quantity_unit,package_count,flavor,barcode,manufacturing_date,expiry_date')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VendorVariant[];
}

export async function createVendorVariant(userId: string, input: {
  product_id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  sku?: string;
  price_iqd?: number | null;
  stock_quantity: number;
  color_name_ku?: string | null;
  color_hex?: string | null;
  size_label?: string | null;
  color_image_storage_path?: string | null;
  quantity_value?: number | null;
  quantity_unit?: VendorVariant['quantity_unit'];
  package_count?: number | null;
  flavor?: string | null;
  barcode?: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
}): Promise<VendorVariant> {
  await assertProductOwner(userId, input.product_id);
  const { data, error } = await supabase
    .from('product_variants')
    .insert({ ...input, is_active: true })
    .select('id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active,color_name_ku,color_hex,size_label,color_image_storage_path,quantity_value,quantity_unit,package_count,flavor,barcode,manufacturing_date,expiry_date')
    .single();
  if (error) throw error;
  return data as VendorVariant;
}

export async function updateVendorVariant(userId: string, variantId: string, input: Partial<Pick<VendorVariant, 'name_ku' | 'name_ar' | 'name_en' | 'sku' | 'price_iqd' | 'stock_quantity' | 'is_active' | 'color_name_ku' | 'color_hex' | 'size_label' | 'color_image_storage_path' | 'quantity_value' | 'quantity_unit' | 'package_count' | 'flavor' | 'barcode' | 'manufacturing_date' | 'expiry_date'>>): Promise<VendorVariant> {
  const { data: existing, error: lookupError } = await supabase.from('product_variants').select('product_id').eq('id', variantId).single();
  if (lookupError) throw lookupError;
  await assertProductOwner(userId, existing.product_id as string);
  const { data, error } = await supabase
    .from('product_variants')
    .update(input)
    .eq('id', variantId)
    .select('id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active,color_name_ku,color_hex,size_label,color_image_storage_path,quantity_value,quantity_unit,package_count,flavor,barcode,manufacturing_date,expiry_date')
    .single();
  if (error) throw error;
  return data as VendorVariant;
}

export async function deleteVendorVariant(userId: string, variantId: string): Promise<void> {
  const { data: existing, error: lookupError } = await supabase.from('product_variants').select('product_id').eq('id', variantId).single();
  if (lookupError) throw lookupError;
  await assertProductOwner(userId, existing.product_id as string);
  const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
  if (error) throw error;
}

async function assertStoreOwner(userId: string, storeId: string): Promise<void> {
  const { data, error } = await supabase.from('stores').select('id').eq('id', storeId).eq('owner_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('دەسەڵاتت نییە بۆ ئەم فرۆشگایە.');
}

async function assertProductOwner(userId: string, productId: string): Promise<void> {
  const { data, error } = await supabase.from('products').select('id,stores!inner(owner_id)').eq('id', productId).eq('stores.owner_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('دەسەڵاتت نییە بۆ ئەم بەرهەمە.');
}

export async function getVendorProductImages(userId: string, productId: string): Promise<VendorProductImage[]> {
  await assertProductOwner(userId, productId);
  const { data, error } = await supabase
    .from('product_images')
    .select('id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VendorProductImage[];
}

export async function addVendorProductImage(userId: string, productId: string, storagePath: string): Promise<VendorProductImage> {
  await assertProductOwner(userId, productId);
  const { data: latest, error: latestError } = await supabase
    .from('product_images')
    .select('sort_order')
    .eq('product_id', productId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const nextOrder = latest ? Number(latest.sort_order) + 1 : 0;
  const { data, error } = await supabase
    .from('product_images')
    .insert({ product_id: productId, storage_path: storagePath, sort_order: nextOrder })
    .select('id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order')
    .single();
  if (error) throw error;
  return data as VendorProductImage;
}

export async function deleteVendorProductImage(userId: string, imageId: string): Promise<string> {
  const { data: image, error: lookupError } = await supabase
    .from('product_images')
    .select('id,product_id,storage_path')
    .eq('id', imageId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!image) throw new Error('وێنە نەدۆزرایەوە.');
  await assertProductOwner(userId, image.product_id as string);
  const { error } = await supabase.from('product_images').delete().eq('id', imageId);
  if (error) throw error;
  return image.storage_path as string;
}
