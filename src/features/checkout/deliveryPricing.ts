import { supabase } from '@/lib/supabase/client';

export type DeliveryFeeQuote = {
  delivery_fee_iqd: number;
  platform_fee_percent: number;
};

export async function getDeliveryFeeQuote(cityName: string): Promise<DeliveryFeeQuote> {
  const city = cityName.trim();
  if (city.length < 2) throw new Error('تکایە شارەکەت دیاری بکە.');
  const { data, error } = await supabase.rpc('get_delivery_fee_quote', { p_city_name: city });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('نرخی گەیاندن نەدۆزرایەوە.');
  return {
    delivery_fee_iqd: Number(row.delivery_fee_iqd ?? 0),
    platform_fee_percent: Number(row.platform_fee_percent ?? 0),
  };
}

export function calculatePlatformFee(subtotal: number, percent: number): number {
  if (!Number.isFinite(subtotal) || !Number.isFinite(percent) || subtotal <= 0 || percent <= 0) return 0;
  return Math.round((subtotal * percent) / 100);
}
