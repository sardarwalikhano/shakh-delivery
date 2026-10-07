import { supabase } from '@/lib/supabase/client';
import type { PaymentMethod, CheckoutResult } from './types';

export async function createCheckout(input: {
  deliveryAddress: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  customerNote?: string | null;
  paymentMethod: PaymentMethod;
}): Promise<CheckoutResult> {
  const key = crypto.randomUUID();
  const { data, error } = await supabase.rpc('create_checkout', {
    p_idempotency_key: key,
    p_delivery_address: input.deliveryAddress,
    p_delivery_lat: input.deliveryLat ?? null,
    p_delivery_lng: input.deliveryLng ?? null,
    p_customer_note: input.customerNote ?? null,
    p_payment_method: input.paymentMethod,
  });
  if (error) throw error;
  return data as CheckoutResult;
}
