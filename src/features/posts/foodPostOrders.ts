import { supabase } from '@/lib/supabase/client';

export type FoodPostOrderStatus = 'pending' | 'confirmed' | 'rejected' | 'delivered' | 'cancelled';

export type FoodPostOrder = {
  id: string;
  order_number: string;
  request_id: string;
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
  created_at: string;
  updated_at: string;
};

export async function createFoodPostOrder(input: {
  requestId: string;
  postId: string;
  quantity: number;
  deliveryAddress: string;
  buyerPhone: string;
  customerNote?: string | null;
  paymentMethod: 'cash_on_delivery' | 'mobile_cash';
}): Promise<Pick<FoodPostOrder, 'id' | 'order_number' | 'status' | 'quantity' | 'unit_price_iqd' | 'line_total_iqd'>> {
  const { data, error } = await supabase.rpc('create_food_post_order', {
    p_request_id: input.requestId,
    p_post_id: input.postId,
    p_quantity: input.quantity,
    p_delivery_address: input.deliveryAddress,
    p_buyer_phone: input.buyerPhone,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
  });
  if (error) throw error;
  if (!data) throw new Error('داواکاریی خواردن وەڵامی دروستی لە Supabase وەرنەگرت.');
  return data as Pick<FoodPostOrder, 'id' | 'order_number' | 'status' | 'quantity' | 'unit_price_iqd' | 'line_total_iqd'>;
}

export async function listFoodPostOrders(): Promise<FoodPostOrder[]> {
  const { data, error } = await supabase
    .from('food_post_orders')
    .select('id,order_number,request_id,buyer_id,seller_id,post_id,post_title,quantity,unit_price_iqd,line_total_iqd,delivery_address,buyer_phone,customer_note,payment_method,status,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as FoodPostOrder[];
}

export async function updateFoodPostOrderStatus(orderId: string, status: FoodPostOrderStatus): Promise<void> {
  const { error } = await supabase.rpc('update_food_post_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}
