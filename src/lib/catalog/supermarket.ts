export type SupermarketUnit = 'g' | 'kg' | 'ml' | 'l' | 'pack' | 'piece' | 'carton';

const UNIT_LABELS: Record<SupermarketUnit, string> = {
  g: 'گرام',
  kg: 'کیلۆگرام',
  ml: 'ملیلتر',
  l: 'لیتر',
  pack: 'پاکێت',
  piece: 'دانە',
  carton: 'کارتۆن',
};

const TYPE_LABELS: Record<string, string> = {
  food: 'خواردەمەنی',
  beverage: 'خواردنەوە',
  cleaning: 'پاککەرەوە',
  daily_essentials: 'کاڵای ڕۆژانە',
  fresh_food: 'خواردنی تازە',
  other: 'کاڵای تر',
};

export function supermarketUnitLabel(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return UNIT_LABELS[unit as SupermarketUnit] ?? unit;
}

export function supermarketTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return TYPE_LABELS[type] ?? type;
}

export function formatSupermarketQuantity(
  value: number | null | undefined,
  unit: string | null | undefined,
  packageCount?: number | null,
): string | null {
  const label = supermarketUnitLabel(unit);
  if (value == null || !label) return null;
  const quantity = Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const packages = packageCount != null && packageCount > 1
    ? ` · ${packageCount.toLocaleString('en-US')} ${label === 'دانە' ? 'دانە' : 'پاکێت'}`
    : '';
  return `${quantity} ${label}${packages}`;
}

export function isSupermarketItemExpired(
  expiryDate: string | null | undefined,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return Boolean(expiryDate && expiryDate < today);
}
