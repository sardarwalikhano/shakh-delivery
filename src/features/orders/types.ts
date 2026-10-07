export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type DeliveryStatus = 'pending' | 'assigned' | 'accepted' | 'picked_up' | 'on_the_way' | 'arrived' | 'delivered' | 'failed' | 'cancelled';

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  total_iqd: number;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  customer_note: string | null;
  created_at: string;
  store: { id: string; name_ku: string; name_ar: string; name_en: string } | null;
  delivery: { id: string; status: DeliveryStatus; last_lat: number | null; last_lng: number | null; last_location_at: string | null } | null;
  items: Array<{
    id: string;
    product_id: string | null;
    variant_id: string | null;
    product_name_ku: string;
    quantity: number;
    unit_price_iqd: number;
    line_total_iqd: number;
  }>;
};
