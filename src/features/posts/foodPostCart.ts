import { supabase } from '@/lib/supabase/client';
import { getPostShareToken } from './shareRewards';
import { isWithinDeliveryZone, readableDeliveryError, saveMyDeliveryPoint, type DeliveryPoint } from './deliveryZones';

export type FoodPostCartPost = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  price_iqd: number | null;
  discount_percent: number;
  location: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_radius_km: number;
  status: 'active' | 'archived' | 'deleted';
  images: Array<{ storage_path: string; alt_ku?: string | null }>;
};

export type FoodPostCartItem = {
  id: string;
  post_id: string;
  quantity: number;
  created_at: string;
  post: FoodPostCartPost | null;
};

export type FoodPostOrderResult = {
  id: string;
  order_number: string;
  status: string;
  post_title: string;
  quantity: number;
  unit_price_iqd: number;
  line_total_iqd: number;
  delivery_city: string;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_iqd: number;
};

export async function getFoodPostCart(userId: string): Promise<FoodPostCartItem[]> {
  const { data, error } = await supabase
    .from('food_post_cart_items')
    .select('id,post_id,quantity,created_at,post:posts!food_post_cart_items_post_id_fkey(id,author_id,title,content,price_iqd,discount_percent,location,delivery_latitude,delivery_longitude,delivery_radius_km,status,images)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as FoodPostCartItem[];
}

export async function addFoodPostToCart(postId: string, quantity = 1): Promise<void> {
  const { error } = await supabase.rpc('add_food_post_to_cart', {
    p_post_id: postId,
    p_quantity: quantity,
  });
  if (error) throw error;
}

export async function updateFoodPostCartQuantity(userId: string, itemId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error('ژمارەی خواردن دەبێت لە ١ تا ١٠٠ بێت.');
  }
  const { error } = await supabase
    .from('food_post_cart_items')
    .update({ quantity })
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeFoodPostCartItem(userId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('food_post_cart_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function checkoutFoodPostCart(input: {
  deliveryAddress: string;
  buyerPhone: string;
  deliveryCity: string;
  customerNote?: string | null;
  paymentMethod: 'cash_on_delivery' | 'mobile_cash';
  deliveryPoint: DeliveryPoint;
}): Promise<FoodPostOrderResult[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('پێویستە سەرەتا بچیتە ژوورەوە.');

  const cartItems = await getFoodPostCart(userData.user.id);
  for (const item of cartItems) {
    const post = item.post;
    if (!post || post.status !== 'active' || !isWithinDeliveryZone(post.delivery_latitude, post.delivery_longitude, post.delivery_radius_km, input.deliveryPoint)) {
      throw new Error('بۆ ئێرە بەردەست نییە؛ ناونیشانی تۆ لە دەرەوەی زۆنی گەیاندنی یەکێک لە خواردنە هەڵبژێردراوەکانە.');
    }
  }
  await saveMyDeliveryPoint(input.deliveryPoint);

  const shareLinks: Record<string, string> = {};
  for (const item of cartItems) {
    const shareLinkId = getPostShareToken(item.post_id);
    if (shareLinkId) shareLinks[item.post_id] = shareLinkId;
  }

  const { data, error } = await supabase.rpc('checkout_food_post_cart_with_share', {
    p_delivery_address: input.deliveryAddress,
    p_buyer_phone: input.buyerPhone,
    p_delivery_city: input.deliveryCity,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
    p_share_links: shareLinks,
    p_use_share_balance: false,
  });
  if (error) throw new Error(readableDeliveryError(error.message));
  const result = data as { orders?: FoodPostOrderResult[] } | null;
  if (!result?.orders?.length) throw new Error('داواکارییەک تۆمار نەکرا. سەلەکەت بەتاڵە یان نرخی خواردن بەردەست نییە.');
  return result.orders;
}

