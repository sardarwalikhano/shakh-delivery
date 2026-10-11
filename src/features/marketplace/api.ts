import { supabase } from '@/lib/supabase/client';
import type { Cart, CartItem, Category, Product, ProductVariant, RestaurantMenuDetails, RestaurantMenuOption, RestaurantMenuOptionGroup, CartSelectedOption, StoreSummary } from './types';

type ProductRow = Omit<Product, 'store' | 'category' | 'images' | 'variants' | 'restaurantMenu' | 'restaurantOptionGroups'> & {
  stores: StoreSummary[];
  categories: Category[];
  images?: Product['images'];
  variants?: Product['variants'];
};

function mapProduct(
  row: ProductRow,
  images: Product['images'] = row.images ?? [],
  variants: ProductVariant[] = (row.variants ?? []).filter((item) => item.is_active),
  restaurantMenu: RestaurantMenuDetails | null = null,
  restaurantOptionGroups: RestaurantMenuOptionGroup[] = [],
): Product {
  return {
    ...row,
    store: row.stores?.[0] ?? null,
    category: row.categories?.[0] ?? null,
    images,
    variants: variants.filter((item) => item.is_active),
    restaurantMenu,
    restaurantOptionGroups,
  };
}

async function getRestaurantMenuDetailsByProductIds(productIds: string[]): Promise<Map<string, RestaurantMenuDetails>> {
  if (!productIds.length) return new Map();
  const { data, error } = await supabase.from('restaurant_menu_details')
    .select('product_id,menu_category,ingredients,allergen_warnings,dietary_tags,spice_level,prep_time_minutes,is_available,available_from,available_until')
    .in('product_id', productIds);
  if (error) throw error;
  return new Map(((data ?? []) as RestaurantMenuDetails[]).map((item) => [item.product_id, item]));
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getProducts(options?: { search?: string; categoryId?: string; featured?: boolean; limit?: number }): Promise<Product[]> {
  const limit = Math.min(Math.max(options?.limit ?? 48, 1), 60);
  let query = supabase
    .from('products')
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,cleaning_type,stores!inner(id,name_ku,name_ar,name_en,slug,logo_url,status),categories(id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active),images:product_images(id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order),variants:product_variants(id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active,color_name_ku,color_hex,size_label,color_image_storage_path,quantity_value,quantity_unit,package_count,flavor,barcode,manufacturing_date,expiry_date)')
    .eq('status', 'active')
    .eq('stores.status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  const search = options?.search?.trim();
  if (search) {
    const safe = search.replace(/[%_]/g, '\\$&');
    query = query.or(`name_ku.ilike.%${safe}%,name_ar.ilike.%${safe}%,name_en.ilike.%${safe}%`);
  }
  if (options?.categoryId) {
    const { data: categoryRows, error: categoryError } = await supabase.from('categories').select('id,parent_id').eq('is_active', true);
    if (categoryError) throw categoryError;
    const all = (categoryRows ?? []) as Array<{ id: string; parent_id: string | null }>;
    const selectedIds = new Set<string>([options.categoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of all) {
        if (row.parent_id && selectedIds.has(row.parent_id) && !selectedIds.has(row.id)) {
          selectedIds.add(row.id); changed = true;
        }
      }
    }
    query = query.in('category_id', [...selectedIds]);
  }
  if (options?.featured) query = query.eq('is_featured', true);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ProductRow[];
  const menuDetails = await getRestaurantMenuDetailsByProductIds(rows.map((row) => row.id));
  return rows.map((row) => mapProduct(row, row.images ?? [], row.variants ?? [], menuDetails.get(row.id) ?? null));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,cleaning_type,stores!inner(id,name_ku,name_ar,name_en,slug,logo_url,status),categories(id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active)')
    .eq('slug', slug)
    .eq('status', 'active')
    .eq('stores.status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const productId = data.id as string;
  const [
    { data: imageData, error: imageError },
    { data: variantData, error: variantError },
    { data: menuData, error: menuError },
  ] = await Promise.all([
    supabase.from('product_images').select('id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order').eq('product_id', productId).order('sort_order', { ascending: true }),
    supabase.from('product_variants').select('id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active,color_name_ku,color_hex,size_label,color_image_storage_path,quantity_value,quantity_unit,package_count,flavor,barcode,manufacturing_date,expiry_date').eq('product_id', productId).eq('is_active', true).order('created_at', { ascending: true }),
    supabase.from('restaurant_menu_details').select('product_id,menu_category,ingredients,allergen_warnings,dietary_tags,spice_level,prep_time_minutes,is_available,available_from,available_until').eq('product_id', productId).maybeSingle(),
  ]);

  if (imageError) throw imageError;
  if (variantError) throw variantError;
  if (menuError) throw menuError;

  const restaurantMenu = (menuData ?? null) as RestaurantMenuDetails | null;
  let restaurantOptionGroups: RestaurantMenuOptionGroup[] = [];
  if (restaurantMenu) {
    const { data: groupData, error: groupError } = await supabase.from('restaurant_menu_option_groups')
      .select('id,product_id,name_ku,name_ar,name_en,is_required,min_select,max_select,sort_order,is_active')
      .eq('product_id', productId).eq('is_active', true).order('sort_order', { ascending: true });
    if (groupError) throw groupError;
    const groups = (groupData ?? []) as Omit<RestaurantMenuOptionGroup, 'options'>[];
    if (groups.length) {
      const { data: optionData, error: optionError } = await supabase.from('restaurant_menu_options')
        .select('id,group_id,name_ku,name_ar,name_en,price_iqd,is_available,is_active,sort_order')
        .in('group_id', groups.map((group) => group.id))
        .eq('is_active', true).eq('is_available', true)
        .order('sort_order', { ascending: true });
      if (optionError) throw optionError;
      const options = (optionData ?? []) as RestaurantMenuOption[];
      restaurantOptionGroups = groups.map((group) => ({ ...group, options: options.filter((option) => option.group_id === group.id) }));
    }
  }

  return mapProduct(data as ProductRow, (imageData ?? []) as Product['images'], (variantData ?? []) as ProductVariant[], restaurantMenu, restaurantOptionGroups);
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
    .select('product_id,products!inner(id,store_id,category_id,name_ku,name_ar,name_en,slug,description_ku,description_ar,description_en,base_price_iqd,compare_at_price_iqd,currency,status,stock_quantity,is_featured,apparel_product_type,brand,material,country_of_origin,season,seller_location,supermarket_type,quantity_value,quantity_unit,package_count,barcode,manufacturing_date,expiry_date,storage_instructions,ingredients,allergen_warnings,flavor,cleaning_type,stores!inner(id,name_ku,name_ar,name_en,slug,logo_url,status),categories(id,parent_id,name_ku,name_ar,name_en,slug,icon_key,sort_order,is_active),images:product_images(id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order),variants:product_variants(id,product_id,name_ku,name_ar,name_en,sku,price_iqd,stock_quantity,is_active,color_name_ku,color_hex,size_label,color_image_storage_path,quantity_value,quantity_unit,package_count,flavor,barcode,manufacturing_date,expiry_date))')
    .eq('user_id', userId);

  if (error) throw error;
  const rows = (data ?? []).map((row: { products: ProductRow[] }) => row.products?.[0]).filter((product): product is ProductRow => Boolean(product));
  const menuDetails = await getRestaurantMenuDetailsByProductIds(rows.map((product) => product.id));
  return rows.map((product) => mapProduct(product, product.images ?? [], product.variants ?? [], menuDetails.get(product.id) ?? null));
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
    .select('id,cart_id,product_id,variant_id,quantity,added_price_iqd,selected_option_ids,products(id,slug,name_ku,name_ar,name_en,base_price_iqd,compare_at_price_iqd,stock_quantity,brand,quantity_value,quantity_unit,package_count,expiry_date,images:product_images(id,product_id,storage_path,alt_ku,alt_ar,alt_en,sort_order)),product_variants(id,name_ku,name_ar,name_en,price_iqd,stock_quantity,is_active,quantity_value,quantity_unit,package_count,flavor,expiry_date)')
    .eq('cart_id', cartData.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = ((data ?? []) as Array<{
    id: string;
    cart_id: string;
    product_id: string;
    variant_id: string | null;
    quantity: number;
    added_price_iqd: number;
    selected_option_ids: string[];
    products: Array<Pick<Product, 'id' | 'slug' | 'name_ku' | 'name_ar' | 'name_en' | 'base_price_iqd' | 'compare_at_price_iqd' | 'stock_quantity' | 'brand' | 'quantity_value' | 'quantity_unit' | 'package_count' | 'expiry_date' | 'restaurantMenu'> & { images: Product['images'] }>;
    product_variants: Array<Pick<ProductVariant, 'id' | 'name_ku' | 'name_ar' | 'name_en' | 'price_iqd' | 'stock_quantity' | 'is_active' | 'quantity_value' | 'quantity_unit' | 'package_count' | 'flavor' | 'expiry_date'>>;
  }>);

  const optionIds = [...new Set(rows.flatMap((item) => item.selected_option_ids ?? []))];
  const optionsById = new Map<string, CartSelectedOption>();
  if (optionIds.length) {
    const { data: optionRows, error: optionError } = await supabase.from('restaurant_menu_options')
      .select('id,group_id,name_ku,name_ar,name_en,price_iqd,is_available,is_active,sort_order,restaurant_menu_option_groups(name_ku,is_active)')
      .in('id', optionIds);
    if (optionError) throw optionError;
    for (const option of (optionRows ?? []) as Array<Omit<CartSelectedOption, 'group_name_ku' | 'group_is_active'> & { restaurant_menu_option_groups: { name_ku: string; is_active: boolean } | Array<{ name_ku: string; is_active: boolean }> | null }>) {
      const linkedGroup = Array.isArray(option.restaurant_menu_option_groups)
        ? option.restaurant_menu_option_groups[0]
        : option.restaurant_menu_option_groups;
      optionsById.set(option.id, {
        ...option,
        group_name_ku: linkedGroup?.name_ku ?? 'زیادکراوە',
        group_is_active: linkedGroup?.is_active ?? false,
      });
    }
  }

  const menuDetails = await getRestaurantMenuDetailsByProductIds(rows.map((item) => item.product_id));
  return {
    cart: cartData as Cart,
    items: rows.map((item) => {
      const selectedOptionIds = item.selected_option_ids ?? [];
      const selectedOptions = selectedOptionIds.map((id) => optionsById.get(id)).filter((option): option is CartSelectedOption => Boolean(option));
      const product = item.products?.[0];
      return {
        id: item.id,
        cart_id: item.cart_id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        added_price_iqd: item.added_price_iqd,
        selected_option_ids: selectedOptionIds,
        selectedOptions,
        hasUnavailableOptions: selectedOptions.length !== selectedOptionIds.length || selectedOptions.some((option) => !option.is_active || !option.is_available || !option.group_is_active),
        product: product ? { ...product, restaurantMenu: menuDetails.get(product.id) ?? null, images: product.images ?? [] } : null,
        variant: item.product_variants?.[0] ?? null,
      };
    }),
  };
}

export async function addToCart(
  userId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
  displayedPrice: number,
  selectedOptionIds: string[] = [],
): Promise<void> {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  const normalizedOptionIds = [...new Set(selectedOptionIds)].sort();
  const cart = await getOrCreateCart(userId);
  let existingQuery = supabase
    .from('cart_items')
    .select('id,quantity,variant_id,selected_option_ids')
    .eq('cart_id', cart.id)
    .eq('product_id', productId);
  existingQuery = variantId === null ? existingQuery.is('variant_id', null) : existingQuery.eq('variant_id', variantId);
  const { data: existing, error: existingError } = await existingQuery;

  if (existingError) throw existingError;

  const same = ((existing ?? []) as Array<{ id: string; quantity: number; selected_option_ids: string[] | null }>).find((item) => {
    const oldIds = [...(item.selected_option_ids ?? [])].sort();
    return oldIds.length === normalizedOptionIds.length && oldIds.every((id, index) => id === normalizedOptionIds[index]);
  });
  if (same) {
    const { error } = await supabase.from('cart_items')
      .update({ quantity: same.quantity + safeQuantity, selected_option_ids: normalizedOptionIds, added_price_iqd: displayedPrice })
      .eq('id', same.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('cart_items').insert({
    cart_id: cart.id,
    product_id: productId,
    variant_id: variantId,
    quantity: safeQuantity,
    selected_option_ids: normalizedOptionIds,
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
