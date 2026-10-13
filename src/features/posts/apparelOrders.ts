import { supabase } from '@/lib/supabase/client';

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
  buyerPhone: string;
  customerNote?: string | null;
  paymentMethod: 'cash_on_delivery' | 'mobile_cash';
}): Promise<{ id: string; order_number: string; status: ApparelPostOrderStatus; quantity: number; unit_price_iqd: number; line_total_iqd: number }> {
  const { data, error } = await supabase.rpc('create_apparel_post_order', {
    p_request_id: input.requestId,
    p_variant_id: input.variantId,
    p_quantity: input.quantity,
    p_delivery_address: input.deliveryAddress,
    p_buyer_phone: input.buyerPhone,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
  });
  if (error) throw error;
  return data as { id: string; order_number: string; status: ApparelPostOrderStatus; quantity: number; unit_price_iqd: number; line_total_iqd: number };
}

export async function listApparelPostOrders(): Promise<ApparelPostOrder[]> {
  const { data, error } = await supabase
    .from('apparel_post_orders')
    .select('id,order_number,buyer_id,seller_id,post_id,variant_id,post_title,color_name,color_hex,size_label,quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,created_at')
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
  created_at: string;
};

export async function listFoodPostOrders(): Promise<FoodPostOrder[]> {
  const { data, error } = await supabase
    .from('food_post_orders')
    .select('id,order_number,buyer_id,seller_id,post_id,post_title,quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,delivery_city,delivery_fee_iqd,platform_fee_iqd,total_iqd,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FoodPostOrder[];
}

export async function updateFoodPostOrderStatus(orderId: string, status: FoodPostOrderStatus): Promise<void> {
  const { error } = await supabase.rpc('update_food_post_order_status', { p_order_id: orderId, p_status: status });
  if (error) throw error;
}
