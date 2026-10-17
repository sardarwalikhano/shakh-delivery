import { supabase } from '@/lib/supabase/client';
import { readableDeliveryError } from './deliveryZones';
import type { PostCategory } from './types';

// Electronics direct-post orders are separate from apparel inventory orders.
export type ElectronicsPostOrderStatus = 'pending' | 'confirmed' | 'rejected' | 'delivered' | 'cancelled';
export type ElectronicsPostOrder = {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  post_id: string;
  post_category: PostCategory;
  post_title: string;
  brand: string;
  selected_color: string | null;
  product_details: Record<string, string | boolean | number>;
  quantity: number;
  unit_price_iqd: number;
  line_total_iqd: number;
  delivery_address: string;
  buyer_phone: string;
  customer_note: string | null;
  payment_method: 'cash_on_delivery' | 'mobile_cash';
  payment_status: 'pending' | 'collected' | 'failed' | 'refunded';
  status: ElectronicsPostOrderStatus;
  delivery_city: string;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_iqd: number;
  share_reward_iqd: number;
  created_at: string;
};

export async function createElectronicsPostOrder(input: {
  requestId: string;
  postId: string;
  quantity: number;
  deliveryAddress: string;
  deliveryCity: string;
  buyerPhone: string;
  selectedColor: string;
  customerNote?: string | null;
  paymentMethod: 'cash_on_delivery' | 'mobile_cash';
  shareLinkId?: string | null;
}): Promise<ElectronicsPostOrder> {
  const { data, error } = await supabase.rpc('create_electronics_post_order_with_color_and_share', {
    p_request_id: input.requestId,
    p_post_id: input.postId,
    p_quantity: input.quantity,
    p_delivery_address: input.deliveryAddress,
    p_buyer_phone: input.buyerPhone,
    p_delivery_city: input.deliveryCity,
    p_selected_color: input.selectedColor,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
    p_share_link_id: input.shareLinkId ?? null,
  });
  if (error) throw new Error(readableDeliveryError(error.message));
  return data as ElectronicsPostOrder;
}

export async function createProductPostOrder(input: {
  requestId: string;
  postId: string;
  quantity: number;
  deliveryAddress: string;
  deliveryCity: string;
  buyerPhone: string;
  customerNote?: string | null;
  paymentMethod: 'cash_on_delivery' | 'mobile_cash';
}): Promise<void> {
  const { error } = await supabase.rpc('create_product_post_order', {
    p_request_id: input.requestId,
    p_post_id: input.postId,
    p_quantity: input.quantity,
    p_delivery_address: input.deliveryAddress,
    p_buyer_phone: input.buyerPhone,
    p_delivery_city: input.deliveryCity,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
  });
  if (error) throw new Error(readableDeliveryError(error.message));
}

export async function listElectronicsPostOrders(): Promise<ElectronicsPostOrder[]> {
  const { data, error } = await supabase
    .from('electronics_post_orders')
    .select('id,order_number,buyer_id,seller_id,post_id,post_category,post_title,brand,selected_color,product_details,quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,payment_status,status,delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd,share_reward_iqd,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ElectronicsPostOrder[];
}

export async function updateElectronicsPostOrderStatus(orderId: string, status: ElectronicsPostOrderStatus): Promise<void> {
  const { error } = await supabase.rpc('update_product_post_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw new Error(readableDeliveryError(error.message));
}


export type ApparelPostOrderStatus = 'pending' | 'confirmed' | 'rejected' | 'delivered' | 'cancelled';
export type ApparelPostOrder = {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  post_id: string;
  variant_id: string;
  post_title: string;
  color_name: string;
  color_hex: string;
  size_label: string;
  quantity: number;
  unit_price_iqd: number;
  line_total_iqd: number;
  delivery_city: string;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_iqd: number;
  delivery_address: string;
  buyer_phone: string;
  customer_note: string | null;
  payment_method: 'cash_on_delivery' | 'mobile_cash';
  status: ApparelPostOrderStatus;
  created_at: string;
};

export async function createApparelPostOrder(input: {
  requestId: string;
  variantId: string;
  quantity: number;
  deliveryAddress: string;
  deliveryCity: string;
  buyerPhone: string;
  customerNote?: string | null;
  paymentMethod: 'cash_on_delivery' | 'mobile_cash';
  shareLinkId?: string | null;
}): Promise<{ id: string; order_number: string; status: ApparelPostOrderStatus; quantity: number; unit_price_iqd: number; line_total_iqd: number; delivery_city: string; delivery_fee_iqd: number; platform_fee_iqd: number; total_iqd: number }> {
  const { data, error } = await supabase.rpc('create_apparel_post_order_with_share', {
    p_request_id: input.requestId,
    p_variant_id: input.variantId,
    p_quantity: input.quantity,
    p_delivery_address: input.deliveryAddress,
    p_buyer_phone: input.buyerPhone,
    p_delivery_city: input.deliveryCity,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
    p_share_link_id: input.shareLinkId ?? null,
    p_use_share_balance: false,
  });
  if (error) throw new Error(readableDeliveryError(error.message));
  return data as { id: string; order_number: string; status: ApparelPostOrderStatus; quantity: number; unit_price_iqd: number; line_total_iqd: number; delivery_city: string; delivery_fee_iqd: number; platform_fee_iqd: number; total_iqd: number };
}

export async function listApparelPostOrders(): Promise<ApparelPostOrder[]> {
  const { data, error } = await supabase
    .from('apparel_post_orders')
    .select('id,order_number,buyer_id,seller_id,post_id,variant_id,post_title,color_name,color_hex,size_label,quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ApparelPostOrder[];
}

export async function updateApparelPostOrderStatus(orderId: string, status: ApparelPostOrderStatus): Promise<void> {
  const { error } = await supabase.rpc('update_apparel_post_order_status', { p_order_id: orderId, p_status: status });
  if (error) throw error;
}

export type FoodPostOrderStatus = ApparelPostOrderStatus;
export type FoodPostOrder = {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  post_id: string;
  post_title: string;
  quantity: number;
  unit_price_iqd: number;
  line_total_iqd: number;
  delivery_address: string;
  buyer_phone: string;
  customer_note: string | null;
  payment_method: 'cash_on_delivery' | 'mobile_cash';
  status: FoodPostOrderStatus;
  delivery_city: string;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_iqd: number;
  captain_id: string | null;
  delivery_status: 'pending' | 'accepted' | 'picked_up' | 'on_the_way' | 'arrived' | 'delivered' | 'failed' | 'cancelled';
  payment_status: 'pending' | 'collected' | 'failed' | 'refunded';
  payment_collected_at: string | null;
  payment_event: Array<{ amount_iqd: number; payment_method: 'cash_on_delivery' | 'mobile_cash'; received_at: string; captain_id: string }> | null;
  created_at: string;
};

export async function listFoodPostOrders(): Promise<FoodPostOrder[]> {
  const { data, error } = await supabase
    .from('food_post_orders')
    .select('id,order_number,buyer_id,seller_id,post_id,post_title,quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd,captain_id,delivery_status,payment_status,payment_collected_at,payment_event:food_post_payment_events!food_post_payment_events_order_id_fkey(amount_iqd,payment_method,received_at,captain_id),created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FoodPostOrder[];
}

export async function claimFoodPostDelivery(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_food_post_delivery', { p_order_id: orderId });
  if (error) throw new Error(readableDeliveryError(error.message));
}

export type FoodPostDeliveryStatus = FoodPostOrder['delivery_status'];

export async function updateFoodPostDeliveryStatus(orderId: string, status: FoodPostDeliveryStatus): Promise<void> {
  const { error } = await supabase.rpc('update_food_post_delivery_status', { p_order_id: orderId, p_status: status });
  if (error) throw new Error(readableDeliveryError(error.message));
}

export async function recordFoodPostPayment(orderId: string, amountIqd: number): Promise<void> {
  const { error } = await supabase.rpc('record_food_post_payment', { p_order_id: orderId, p_amount_iqd: amountIqd, p_note: null });
  if (error) throw new Error(readableDeliveryError(error.message));
}

export async function updateFoodPostOrderStatus(orderId: string, status: FoodPostOrderStatus): Promise<void> {
  const { error } = await supabase.rpc('update_food_post_order_status', { p_order_id: orderId, p_status: status });
  if (error) throw error;
}

