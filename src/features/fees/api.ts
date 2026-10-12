import { supabase } from '@/lib/supabase/client';

export type DeliveryFeeRule = {
  id: string;
  city: string;
  category_key: string;
  delivery_fee_iqd: number;
  is_active: boolean;
  updated_at: string;
};

export type PlatformFeeSetting = {
  id: number;
  platform_fee_iqd: number;
  is_active: boolean;
  updated_at: string;
};

export type OrderFeeQuote = {
  delivery_city: string;
  category_key: string;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_fees_iqd: number;
  delivery_exempt: boolean;
};

export const DELIVERY_EXEMPT_CATEGORY_KEYS = new Set([
  'cars', 'car', 'umrah', 'hajj', 'hajj-umrah', 'hajj_umrah', 'hajj-umrah-packages',
]);

export async function quoteOrderFees(city: string, categoryKey: string): Promise<OrderFeeQuote> {
  const deliveryCity = city.trim();
  if (deliveryCity.length < 2) throw new Error('شاری گەیاندن دیاری بکە.');
  const { data, error } = await supabase.rpc('quote_order_fees', {
    p_delivery_city: deliveryCity,
    p_category_key: categoryKey.trim() || 'all',
  });
  if (error) throw error;
  if (!data) throw new Error('نرخی گەیاندن و کرێی پلاتفۆرم لە Supabase وەرنەگیرا.');
  return data as OrderFeeQuote;
}

export async function getDeliveryFeeRules(): Promise<DeliveryFeeRule[]> {
  const { data, error } = await supabase
    .from('delivery_fee_rules')
    .select('id,city,category_key,delivery_fee_iqd,is_active,updated_at')
    .order('city', { ascending: true })
    .order('category_key', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeliveryFeeRule[];
}

export async function getDeliveryCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from('delivery_fee_rules')
    .select('city')
    .eq('is_active', true)
    .neq('city', '*')
    .order('city', { ascending: true });
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.city.trim()).filter((city) => city.length >= 2))];
}

export async function getPlatformFeeSetting(): Promise<PlatformFeeSetting> {
  const { data, error } = await supabase
    .from('platform_fee_settings')
    .select('id,platform_fee_iqd,is_active,updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? { id: 1, platform_fee_iqd: 0, is_active: true, updated_at: new Date(0).toISOString() }) as PlatformFeeSetting;
}

export async function savePlatformFeeSetting(platformFeeIqd: number, isActive: boolean): Promise<void> {
  if (!Number.isFinite(platformFeeIqd) || platformFeeIqd < 0 || platformFeeIqd > 100000000) {
    throw new Error('کرێی پلاتفۆرم دەبێت ژمارەیەکی سفر یان زیاتر بێت.');
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('پێویستە بچیتە ژوورەوە.');
  const { error } = await supabase
    .from('platform_fee_settings')
    .upsert({
      id: 1,
      platform_fee_iqd: Math.round(platformFeeIqd),
      is_active: isActive,
      updated_by: authData.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveDeliveryFeeRule(input: {
  id?: string;
  city: string;
  categoryKey: string;
  deliveryFeeIqd: number;
  isActive: boolean;
}): Promise<void> {
  const city = input.city.trim();
  const categoryKey = input.categoryKey.trim().toLowerCase();
  if (!city || (city !== '*' && (city.length < 2 || city.length > 120))) {
    throw new Error('شارێکی دروست بنووسە؛ بۆ هەموو شارەکان «هەموو شارەکان» هەڵبژێرە.');
  }
  if (!categoryKey || categoryKey.length > 80) throw new Error('کاتەگۆرییەک هەڵبژێرە.');
  if (DELIVERY_EXEMPT_CATEGORY_KEYS.has(categoryKey)) {
    throw new Error('بۆ ئۆتۆمبێل و حەج/عومرە کرێی گەیاندن دانانرێت.');
  }
  if (!Number.isFinite(input.deliveryFeeIqd) || input.deliveryFeeIqd < 0 || input.deliveryFeeIqd > 100000000) {
    throw new Error('کرێی گەیاندن دەبێت ژمارەیەکی سفر یان زیاتر بێت.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('پێویستە بچیتە ژوورەوە.');

  const payload = {
    city,
    category_key: categoryKey,
    delivery_fee_iqd: Math.round(input.deliveryFeeIqd),
    is_active: input.isActive,
    updated_by: authData.user.id,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? supabase.from('delivery_fee_rules').update(payload).eq('id', input.id)
    : supabase.from('delivery_fee_rules').upsert(payload, { onConflict: 'city,category_key' });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteDeliveryFeeRule(ruleId: string): Promise<void> {
  const { error } = await supabase.from('delivery_fee_rules').delete().eq('id', ruleId);
  if (error) throw error;
}
