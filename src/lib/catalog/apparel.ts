export type ApparelProductType =
  | 'mens_clothing'
  | 'womens_clothing'
  | 'kids_clothing'
  | 'mens_shoes'
  | 'womens_shoes'
  | 'kids_shoes'
  | 'bags'
  | 'sportswear'
  | 'homewear'
  | 'fashion_beauty'
  | 'accessories';

export type ApparelSeason = 'summer' | 'winter' | 'all_seasons';

export type ApparelColor = {
  key: string;
  name_ku: string;
  name_ar: string;
  name_en: string;
  hex: string;
  imageRef: string;
  custom?: boolean;
};

export const apparelTypeOptions: Array<{ value: ApparelProductType; label: string; group: 'clothing' | 'shoes' | 'other' }> = [
  { value: 'mens_clothing', label: 'جل‌وبەرگی پیاوان', group: 'clothing' },
  { value: 'womens_clothing', label: 'جل‌وبەرگی ئافرەتان', group: 'clothing' },
  { value: 'kids_clothing', label: 'جل‌وبەرگی منداڵان', group: 'clothing' },
  { value: 'mens_shoes', label: 'پێڵاوی پیاوان', group: 'shoes' },
  { value: 'womens_shoes', label: 'پێڵاوی ئافرەتان', group: 'shoes' },
  { value: 'kids_shoes', label: 'پێڵاوی منداڵان', group: 'shoes' },
  { value: 'bags', label: 'جانتـا', group: 'other' },
  { value: 'sportswear', label: 'جل‌وبەرگی وەرزشی', group: 'clothing' },
  { value: 'homewear', label: 'جل‌وبەرگی ناوماڵ', group: 'clothing' },
  { value: 'fashion_beauty', label: 'کەلوپەلی جوانکاری و جوانکاریی جل‌وبەرگ', group: 'other' },
  { value: 'accessories', label: 'پێداویستیی تر و ئەکسسوارات', group: 'other' },
];

export const apparelTypeLabelsKu: Record<ApparelProductType, string> = Object.fromEntries(
  apparelTypeOptions.map((item) => [item.value, item.label]),
) as Record<ApparelProductType, string>;

export const apparelSeasonOptions: Array<{ value: ApparelSeason; label: string }> = [
  { value: 'summer', label: 'هاوین' },
  { value: 'winter', label: 'زستان' },
  { value: 'all_seasons', label: 'هەموو وەرزەکان' },
];

export const apparelColorPalette: Omit<ApparelColor, 'imageIndex'>[] = [
  { key: 'black', name_ku: 'ڕەش', name_ar: 'أسود', name_en: 'Black', hex: '#171717' },
  { key: 'white', name_ku: 'سپی', name_ar: 'أبيض', name_en: 'White', hex: '#FFFFFF' },
  { key: 'red', name_ku: 'سوور', name_ar: 'أحمر', name_en: 'Red', hex: '#E53935' },
  { key: 'blue', name_ku: 'شین', name_ar: 'أزرق', name_en: 'Blue', hex: '#2563EB' },
  { key: 'navy', name_ku: 'شینی تۆخ', name_ar: 'كحلي', name_en: 'Navy', hex: '#172554' },
  { key: 'gray', name_ku: 'خاکستەری', name_ar: 'رمادي', name_en: 'Gray', hex: '#9CA3AF' },
  { key: 'brown', name_ku: 'قاوەیی', name_ar: 'بني', name_en: 'Brown', hex: '#854D0E' },
  { key: 'green', name_ku: 'سەوز', name_ar: 'أخضر', name_en: 'Green', hex: '#16A34A' },
  { key: 'yellow', name_ku: 'زەرد', name_ar: 'أصفر', name_en: 'Yellow', hex: '#FACC15' },
  { key: 'pink', name_ku: 'پەمەیی', name_ar: 'وردي', name_en: 'Pink', hex: '#F472B6' },
  { key: 'beige', name_ku: 'بێژ', name_ar: 'بيج', name_en: 'Beige', hex: '#D6C6A5' },
  { key: 'purple', name_ku: 'مۆر', name_ar: 'بنفسجي', name_en: 'Purple', hex: '#9333EA' },
];

export function defaultSizesForApparel(type: ApparelProductType | ''): string[] {
  if (type === 'mens_shoes' || type === 'womens_shoes') return Array.from({ length: 11 }, (_, index) => String(index + 36));
  if (type === 'kids_shoes') return Array.from({ length: 13 }, (_, index) => String(index + 24));
  if (type === 'kids_clothing') return ['2Y', '3Y', '4Y', '5Y', '6Y', '8Y', '10Y', '12Y', '14Y'];
  if (type === 'bags' || type === 'fashion_beauty' || type === 'accessories' || type === 'homewear') return ['یەک قەبارە'];
  if (type === 'mens_clothing' || type === 'womens_clothing' || type === 'sportswear') return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  return [];
}

export function isShoeType(type: ApparelProductType | ''): boolean {
  return type === 'mens_shoes' || type === 'womens_shoes' || type === 'kids_shoes';
}
