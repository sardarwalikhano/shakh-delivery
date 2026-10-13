import { supabase } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import type { ApparelProductType } from '@/lib/catalog/apparel';
import type { ProductAttribute } from '@/features/marketplace/types';
import type { CategoryDetails } from '@/lib/catalog/categoryDetails';

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
  cleaning_type: string | null;
  attributes: ProductAttribute[];
  category_details: CategoryDetails;
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

const vendorRoles: AppRole[] = ['restaurant_vendor', 'fashion_vendor', 'supermarket_vendor', 'car_dealer', 'umrah_agency'];

function isVendorRole(role: AppRole | AppRole[] | null): boolean {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  return roles.some((candidate) => vendorRoles.includes(candidate));
}

export async function getVendorStores(userId: string, role: AppRole | AppRole[] | null): Promise<VendorStore[]> {
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
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,cleaning_type,attributes,category_details,categories(name_ku,name_ar,name_en),stores!inner(owner_id)')
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
  supermarket_type?: VendorProduct['supermarket_type']; quantity_value?: number | null; quantity_unit?: VendorProduct['quantity_unit'];
  package_count?: number | null; barcode?: string | null; manufacturing_date?: string | null; expiry_date?: string | null;
  storage_instructions?: string | null; ingredients?: string | null; allergen_warnings?: string | null; flavor?: string | null; cleaning_type?: string | null;
  attributes?: ProductAttribute[];
  category_details?: CategoryDetails;
}): Promise<VendorProduct> {
  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, status: 'draft', currency: 'IQD' })
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,cleaning_type,attributes,category_details')
    .single();
  if (error) throw error;
  await assertStoreOwner(userId, input.store_id);
  return data as VendorProduct;
}

export async function updateVendorProduct(userId: string, productId: string, input: Partial<Pick<VendorProduct, 'category_id' | 'name_ku' | 'name_ar' | 'name_en' | 'slug' | 'description_ku' | 'description_ar' | 'description_en' | 'base_price_iqd' | 'compare_at_price_iqd' | 'stock_quantity' | 'is_featured' | 'apparel_product_type' | 'brand' | 'material' | 'country_of_origin' | 'season' | 'seller_location' | 'supermarket_type' | 'quantity_value' | 'quantity_unit' | 'package_count' | 'barcode' | 'manufacturing_date' | 'expiry_date' | 'storage_instructions' | 'ingredients' | 'allergen_warnings' | 'flavor' | 'cleaning_type' | 'attributes' | 'category_details'>>): Promise<VendorProduct> {
  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', productId)
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,cleaning_type,attributes,category_details')
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
  sku?: string | null;
  price_iqd?: number | null;
  stock_quantity: number;
  color_name_ku?: string | null;
  color_hex?: string | null;
  size_label?: string | null;
  color_image_storage_path?: string | null;
  quantity_value?: number | null; quantity_unit?: VendorVariant['quantity_unit']; package_count?: number | null; flavor?: string | null; barcode?: string | null; manufacturing_date?: string | null; expiry_date?: string | null;
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


export type RestaurantMenuDetails = {
  product_id: string;
  menu_category: 'main_course' | 'appetizer' | 'dessert' | 'beverage' | 'salad' | 'kids' | 'combo' | 'other';
  ingredients: string | null;
  allergen_warnings: string | null;
  dietary_tags: string[];
  spice_level: number;
  prep_time_minutes: number;
  is_available: boolean;
  available_from: string | null;
  available_until: string | null;
};

export type RestaurantMenuOption = {
  id: string;
  group_id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  price_iqd: number;
  is_available: boolean;
  is_active: boolean;
  sort_order: number;
};

export type RestaurantMenuOptionGroup = {
  id: string;
  product_id: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
  options: RestaurantMenuOption[];
};

export type RestaurantMenuConfiguration = {
  details: RestaurantMenuDetails | null;
  groups: RestaurantMenuOptionGroup[];
};

export type RestaurantMenuGroupDraft = {
  id?: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: Array<{
    id?: string;
    name_ku: string;
    name_ar: string;
    name_en: string;
    price_iqd: number;
    is_available: boolean;
  }>;
};

export async function getRestaurantMenuConfiguration(userId: string, productId: string): Promise<RestaurantMenuConfiguration> {
  await assertProductOwner(userId, productId);
  const [detailsResult, groupsResult] = await Promise.all([
    supabase.from('restaurant_menu_details')
      .select('product_id,menu_category,ingredients,allergen_warnings,dietary_tags,spice_level,prep_time_minutes,is_available,available_from,available_until')
      .eq('product_id', productId).maybeSingle(),
    supabase.from('restaurant_menu_option_groups')
      .select('id,product_id,name_ku,name_ar,name_en,is_required,min_select,max_select,sort_order,is_active')
      .eq('product_id', productId).eq('is_active', true).order('sort_order', { ascending: true }),
  ]);
  if (detailsResult.error) throw detailsResult.error;
  if (groupsResult.error) throw groupsResult.error;
  const groups = (groupsResult.data ?? []) as Omit<RestaurantMenuOptionGroup, 'options'>[];
  if (!groups.length) return { details: (detailsResult.data ?? null) as RestaurantMenuDetails | null, groups: [] };
  const { data: optionsData, error: optionsError } = await supabase.from('restaurant_menu_options')
    .select('id,group_id,name_ku,name_ar,name_en,price_iqd,is_available,is_active,sort_order')
    .in('group_id', groups.map((group) => group.id))
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (optionsError) throw optionsError;
  const options = (optionsData ?? []) as RestaurantMenuOption[];
  return {
    details: (detailsResult.data ?? null) as RestaurantMenuDetails | null,
    groups: groups.map((group) => ({ ...group, options: options.filter((option) => option.group_id === group.id) })),
  };
}

export async function saveRestaurantMenuDetails(
  userId: string,
  productId: string,
  input: Omit<RestaurantMenuDetails, 'product_id'>,
): Promise<void> {
  await assertProductOwner(userId, productId);
  const { error } = await supabase.from('restaurant_menu_details').upsert(
    { product_id: productId, ...input },
    { onConflict: 'product_id' },
  );
  if (error) throw error;
}

export async function saveRestaurantMenuOptionGroups(
  userId: string,
  productId: string,
  drafts: RestaurantMenuGroupDraft[],
): Promise<void> {
  await assertProductOwner(userId, productId);
  const { data: currentGroups, error: groupReadError } = await supabase
    .from('restaurant_menu_option_groups')
    .select('id,is_active')
    .eq('product_id', productId);
  if (groupReadError) throw groupReadError;
  const existingGroups = (currentGroups ?? []) as Array<{ id: string; is_active: boolean }>;
  const retainedGroupIds = new Set<string>();

  for (let groupIndex = 0; groupIndex < drafts.length; groupIndex += 1) {
    const group = drafts[groupIndex];
    const groupInput = {
      product_id: productId,
      name_ku: group.name_ku.trim(),
      name_ar: group.name_ar.trim() || group.name_ku.trim(),
      name_en: group.name_en.trim() || group.name_ku.trim(),
      is_required: group.is_required,
      min_select: group.min_select,
      max_select: group.max_select,
      sort_order: groupIndex,
      is_active: true,
    };
    let groupId = group.id;
    if (groupId && existingGroups.some((row) => row.id === groupId)) {
      const { data, error } = await supabase.from('restaurant_menu_option_groups')
        .update(groupInput).eq('id', groupId).eq('product_id', productId)
        .select('id').single();
      if (error) throw error;
      groupId = data.id as string;
    } else {
      const { data, error } = await supabase.from('restaurant_menu_option_groups')
        .insert(groupInput).select('id').single();
      if (error) throw error;
      groupId = data.id as string;
    }
    retainedGroupIds.add(groupId);

    const { data: oldOptions, error: optionReadError } = await supabase.from('restaurant_menu_options')
      .select('id').eq('group_id', groupId);
    if (optionReadError) throw optionReadError;
    const existingOptionIds = new Set(((oldOptions ?? []) as Array<{ id: string }>).map((row) => row.id));
    const retainedOptionIds = new Set<string>();

    for (let optionIndex = 0; optionIndex < group.options.length; optionIndex += 1) {
      const option = group.options[optionIndex];
      const optionInput = {
        group_id: groupId,
        name_ku: option.name_ku.trim(),
        name_ar: option.name_ar.trim() || option.name_ku.trim(),
        name_en: option.name_en.trim() || option.name_ku.trim(),
        price_iqd: option.price_iqd,
        is_available: option.is_available,
        is_active: true,
        sort_order: optionIndex,
      };
      if (option.id && existingOptionIds.has(option.id)) {
        const { data, error } = await supabase.from('restaurant_menu_options')
          .update(optionInput).eq('id', option.id).eq('group_id', groupId)
          .select('id').single();
        if (error) throw error;
        retainedOptionIds.add(data.id as string);
      } else {
        const { data, error } = await supabase.from('restaurant_menu_options')
          .insert(optionInput).select('id').single();
        if (error) throw error;
        retainedOptionIds.add(data.id as string);
      }
    }

    for (const oldId of existingOptionIds) {
      if (!retainedOptionIds.has(oldId)) {
        const { error } = await supabase.from('restaurant_menu_options')
          .update({ is_active: false, is_available: false }).eq('id', oldId);
        if (error) throw error;
      }
    }
  }

  for (const oldGroup of existingGroups) {
    if (oldGroup.is_active && !retainedGroupIds.has(oldGroup.id)) {
      const { error } = await supabase.from('restaurant_menu_option_groups')
        .update({ is_active: false }).eq('id', oldGroup.id).eq('product_id', productId);
      if (error) throw error;
    }
  }
}
