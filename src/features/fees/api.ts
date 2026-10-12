import { supabase } from '@/lib/supabase/client';

export type DeliveryFeeRule = {
  id: string;
  city_name_ku: string;
  delivery_fee_iqd: number;
  is_active: boolean;
  is_default: boolean;
  updated_at: string;
};

export type PlatformFeeSetting = {
  id: number;
  fee_percent: number;
  updated_at: string;
};

export type OrderFeeQuote = {
  delivery_city: string;
  category_key: string;
  delivery_fee_iqd: number;
  platform_fee_percent: number;
  platform_fee_iqd: number;
  total_fees_iqd: number;
  delivery_exempt: boolean;
};

export const DELIVERY_EXEMPT_CATEGORY_KEYS = new Set([
  'cars', 'car', 'umrah', 'hajj', 'hajj-umrah', 'hajj_umrah',
  'hajj-umrah-packages', 'hajj-packages', 'umrah-packages',
]);

export function isDeliveryExemptCategory(categoryKey: string): boolean {
  const normalized = categoryKey.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
  return DELIVERY_EXEMPT_CATEGORY_KEYS.has(normalized);
}

export async function quoteOrderFees(
  city: string,
  categoryKey: string,
  subtotalIqd: number,
): Promise<OrderFeeQuote> {
  const deliveryCity = city.trim();
  if (deliveryCity.length < 2) throw new Error('شاری گەیاندن دیاری بکە.');
  if (!Number.isFinite(subtotalIqd) || subtotalIqd < 0) throw new Error('کۆی بەرهەمەکان دروست نییە.');

  const { data, error } = await supabase.rpc('quote_order_fees', {
    p_delivery_city: deliveryCity,
    p_category_key: categoryKey.trim() || 'general',
    p_subtotal_iqd: Math.round(subtotalIqd),
  });
  if (error) throw error;
  if (!data) throw new Error('نرخی گەیاندن و کرێی پلاتفۆرم لە Supabase وەرنەگیرا.');
  return data as OrderFeeQuote;
}

export async function getDeliveryFeeRules(): Promise<DeliveryFeeRule[]> {
  const { data, error } = await supabase
    .from('delivery_fee_rules')
    .select('id,city_name_ku,delivery_fee_iqd,is_active,is_default,updated_at')
    .order('is_default', { ascending: false })
    .order('city_name_ku', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeliveryFeeRule[];
}

export async function getDeliveryCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from('delivery_fee_rules')
    .select('city_name_ku')
    .eq('is_active', true)
    .eq('is_default', false)
    .order('city_name_ku', { ascending: true });
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.city_name_ku.trim()).filter((city) => city.length >= 2))];
}

export async function getPlatformFeeSetting(): Promise<PlatformFeeSetting> {
  const { data, error } = await supabase
    .from('platform_fee_settings')
    .select('id,fee_percent,updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? { id: 1, fee_percent: 0, updated_at: new Date(0).toISOString() }) as PlatformFeeSetting;
}

export async function savePlatformFeeSetting(feePercent: number): Promise<void> {
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) {
    throw new Error('ڕێژەی کرێی پلاتفۆرم دەبێت لە ٠ تا ١٠٠٪ بێت.');
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('پێویستە بچیتە ژوورەوە.');

  const { data, error } = await supabase
    .from('platform_fee_settings')
    .update({
      fee_percent: Math.round(feePercent * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ڕێکخستنی کرێی پلاتفۆرم نەدۆزرایەوە یان مۆڵەتی گۆڕینی نییە.');
}

export async function saveDeliveryFeeRule(input: {
  id?: string;
  city: string;
  deliveryFeeIqd: number;
  isActive: boolean;
  isDefault: boolean;
}): Promise<void> {
  const rawCity = input.city.trim();
  const isDefault = input.isDefault || rawCity === '*' || rawCity === 'هەموو شارەکان';
  const city = isDefault ? '__default__' : rawCity;

  if (!isDefault && (city.length < 2 || city.length > 100)) {
    throw new Error('ناوی شار دەبێت لە ٢ تا ١٠٠ پیت بێت.');
  }
  if (!Number.isFinite(input.deliveryFeeIqd) || input.deliveryFeeIqd < 0 || input.deliveryFeeIqd > 100000000) {
    throw new Error('کرێی گەیاندن دەبێت ژمارەیەکی سفر یان زیاتر بێت.');
  }
  if (isDefault && !input.isActive) {
    throw new Error('نرخی بنەڕەتی دەبێت چالاک بمێنێتەوە؛ دەتوانیت بڕەکەی بکەیتە سفر.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('پێویستە بچیتە ژوورەوە.');

  const payload = {
    city_name_ku: city,
    delivery_fee_iqd: Math.round(input.deliveryFeeIqd),
    is_active: input.isActive,
    is_default: isDefault,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from('delivery_fee_rules').update(payload).eq('id', input.id);
    if (error) throw error;
    return;
  }

  // One rule per normalized city; update existing rows rather than creating
  // duplicate city rates when the admin edits a value through the add form.
  const { data: existing, error: lookupError } = await supabase
    .from('delivery_fee_rules')
    .select('id')
    .eq('city_name_ku', city)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase.from('delivery_fee_rules').update(payload).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('delivery_fee_rules').insert(payload);
    if (error) throw error;
  }
}

export async function deleteDeliveryFeeRule(ruleId: string): Promise<void> {
  // Retain the row for auditability. Inactive city rules fall back to the
  // active default rate; the default rule itself is not allowed to deactivate.
  const { data: rule, error: lookupError } = await supabase
    .from('delivery_fee_rules')
    .select('is_default')
    .eq('id', ruleId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!rule) throw new Error('ڕێسای گەیاندن نەدۆزرایەوە.');
  if (rule.is_default) throw new Error('نرخی بنەڕەتی ناسڕدرێتەوە و ناچالاک ناکرێت.');

  const { error } = await supabase
    .from('delivery_fee_rules')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', ruleId);
  if (error) throw error;
}
