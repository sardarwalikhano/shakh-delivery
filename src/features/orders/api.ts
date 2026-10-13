import { supabase } from '@/lib/supabase/client';
import type { Order } from './types';

const orderSelect = `
  id,order_number,status,subtotal_iqd,delivery_fee_iqd,total_iqd,delivery_address,delivery_lat,delivery_lng,customer_note,created_at,
  store:stores(id,name_ku,name_ar,name_en),
  delivery:deliveries(id,status,last_lat,last_lng,last_location_at),
  items:order_items(id,product_id,variant_id,product_name_ku,quantity,unit_price_iqd,line_total_iqd,selected_options,variant:product_variants(name_ku))
`;

export async function getMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from('orders').select(orderSelect).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}

export async function updateStoreOrderStatus(orderId: string, status: Order['status']): Promise<void> {
  const { error } = await supabase.rpc('update_store_order_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}

export async function getMyOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase.from('orders').select(orderSelect).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as Order | null;
}

