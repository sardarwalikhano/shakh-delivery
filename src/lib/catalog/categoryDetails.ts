import { homeLivingFields } from './homeLivingFields';
export type CategoryDetails = Record<string, string | boolean | number>;

export type CategoryDetailField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  unit?: string;
};

const conditionOptions = [
  { value: 'new', label: 'نوێ' },
  { value: 'open_box', label: 'پاکێتی کراوە، بەکارنەهاتوو' },
  { value: 'refurbished', label: 'نوێکراوە' },
  { value: 'used', label: 'بەکارهاتوو' },
];

const foodFields: CategoryDetailField[] = [
  { key: 'product_type', label: 'جۆری بەرهەم', type: 'select', required: true, options: [
    { value: 'prepared_meal', label: 'خواردنی ئامادە' }, { value: 'bakery', label: 'نان و شیرینی' },
    { value: 'dessert', label: 'شیرینی و دێسێرت' }, { value: 'packaged_food', label: 'خواردنی پاکێتکراو' },
    { value: 'frozen_food', label: 'خواردنی بەستوو' }, { value: 'fresh_ingredients', label: 'پێکهاتەی تازە' },
    { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'serving_size', label: 'قەبارەی یەک خزمەت', type: 'text', placeholder: 'وەک ٣٠٠ گرام یان بۆ ٢ کەس' },
  { key: 'calories_kcal', label: 'کالۆری (kcal)', type: 'number', min: 0, max: 100000, unit: 'kcal' },
  { key: 'dietary_suitability', label: 'گونجاوی خواردن', type: 'text', placeholder: 'وەک حەڵاڵ، گیاخواردن، بێ گلوتین' },
  { key: 'preparation_instructions', label: 'ڕێنمایی ئامادەکردن / گەرمکردن', type: 'textarea', maxLength: 2000 },
  { key: 'requires_refrigeration', label: 'پێویستی بە ساردکردنەوە هەیە', type: 'checkbox' },
];

const supermarketFields: CategoryDetailField[] = [
  { key: 'nutrition_serving_size', label: 'قەبارەی بەشی خۆراک', type: 'text', placeholder: 'وەک ١٠٠ گرام' },
  { key: 'nutrition_calories_kcal', label: 'کالۆری بۆ هەر بەش', type: 'number', min: 0, max: 100000, unit: 'kcal' },
  { key: 'nutrition_protein_g', label: 'پرۆتین', type: 'number', min: 0, max: 100000, unit: 'g' },
  { key: 'nutrition_carbohydrates_g', label: 'کاربۆهایدرات', type: 'number', min: 0, max: 100000, unit: 'g' },
  { key: 'nutrition_sugars_g', label: 'شەکر', type: 'number', min: 0, max: 100000, unit: 'g' },
  { key: 'nutrition_fat_g', label: 'چەوری', type: 'number', min: 0, max: 100000, unit: 'g' },
  { key: 'nutrition_fiber_g', label: 'فایبەر', type: 'number', min: 0, max: 100000, unit: 'g' },
  { key: 'nutrition_sodium_mg', label: 'سۆدیۆم', type: 'number', min: 0, max: 100000, unit: 'mg' },
  { key: 'dietary_certifications', label: 'نیشانە و تایبەتمەندییەکانی خۆراک', type: 'text', placeholder: 'تەنها زانیاری پشتڕاستکراو بنووسە' },
  { key: 'batch_number', label: 'ژمارەی بەرھەمھێنان / Batch', type: 'text', maxLength: 100 },
  { key: 'storage_after_opening', label: 'ڕێنمایی دوای کردنەوەی پاکێت', type: 'textarea', maxLength: 2000 },
];

const electronicsFields: CategoryDetailField[] = [
  { key: 'product_type', label: 'جۆری ئامێر', type: 'select', required: true, options: [
    { value: 'phone', label: 'مۆبایل' }, { value: 'tablet', label: 'تابلێت' }, { value: 'laptop', label: 'لابتۆپ' },
    { value: 'desktop', label: 'دیسکۆپ / کۆمپیوتەر' }, { value: 'monitor', label: 'مۆنیتەر' }, { value: 'tv', label: 'تەلەڤیزیۆن' },
    { value: 'audio', label: 'دەنگ و هێدفۆن' }, { value: 'camera', label: 'کامێرا' },
    { value: 'gaming', label: 'گێمینگ' }, { value: 'appliance', label: 'ئامێری کارەبایی' },
    { value: 'accessory', label: 'ئەکسسوارات' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'model', label: 'مۆدێل / Model', type: 'text', maxLength: 120 },
  { key: 'color', label: 'ڕەنگی سەرەکی', type: 'select', required: true, options: [
    { value: 'black', label: 'ڕەش' }, { value: 'white', label: 'سپی' },
    { value: 'blue', label: 'شین' }, { value: 'silver', label: 'زیوی' },
    { value: 'gray', label: 'خاکستەری' }, { value: 'gold', label: 'زێڕی' },
    { value: 'green', label: 'سەوز' }, { value: 'red', label: 'سوور' },
    { value: 'purple', label: 'مۆر' }, { value: 'pink', label: 'پەمەیی' },
    { value: 'other', label: 'ڕەنگی تر' },
  ] },
  { key: 'available_colors', label: 'ڕەنگە هەڵبژێردراوەکان', type: 'text', maxLength: 300 },
  { key: 'color_image_indexes', label: 'پێوەندی وێنەی ڕەنگەکان', type: 'text', maxLength: 1200 },
  { key: 'color_image_paths', label: 'شوێنی وێنەی ڕەنگەکان', type: 'text', maxLength: 3000 },
  { key: 'condition', label: 'دۆخی بەرهەم', type: 'select', required: true, options: conditionOptions },
  { key: 'operating_system', label: 'سیستەمی کارپێکردن', type: 'text', placeholder: 'وەک Android، iOS، Windows' },
  { key: 'ram_capacity', label: 'RAM', type: 'text', placeholder: 'وەک 8GB، 16GB' },
  { key: 'storage_capacity', label: 'بیرگە / Storage', type: 'text', placeholder: 'وەک 128GB، 1TB' },
  { key: 'stock_quantity', label: 'ژمارەی دانەی بەردەست', type: 'number', required: true, min: 1, max: 100000, unit: 'دانە' },
  { key: 'screen_size_inches', label: 'قەبارەی شاشە', type: 'number', min: 0, max: 300, unit: 'ئینچ' },
  { key: 'battery_capacity_mah', label: 'توانای باتری', type: 'number', min: 0, max: 1000000, unit: 'mAh' },
  { key: 'connectivity', label: 'پەیوەندی و تۆڕ', type: 'text', placeholder: 'وەک 4G/5G، Wi‑Fi، Bluetooth' },
  { key: 'ports_and_interfaces', label: 'پۆرت و دەروازەکان', type: 'text', placeholder: 'وەک USB‑C، HDMI' },
  { key: 'warranty_months', label: 'ماوەی گەرەنتی', type: 'number', min: 0, max: 120, unit: 'مانگ' },
  { key: 'power_source', label: 'سەرچاوەی وزە', type: 'select', options: [
    { value: 'mains', label: 'کارەبای ڕاستەوخۆ' }, { value: 'rechargeable', label: 'باتریی شارژکراو' },
    { value: 'battery', label: 'باتریی گۆڕاو' }, { value: 'solar', label: 'خۆرەکی' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'included_accessories', label: 'شتە هاوپێچەکان لەگەڵ پاکێت', type: 'textarea', maxLength: 2000 },
  { key: 'compatibility', label: 'گونجان لەگەڵ ئامێرەکان', type: 'text', maxLength: 500 },
];

const beautyFields: CategoryDetailField[] = [
  { key: 'product_type', label: 'جۆری بەرهەمی جوانکاری', type: 'select', required: true, options: [
    { value: 'skincare', label: 'چاودێری پێست' }, { value: 'makeup', label: 'میکاپ' }, { value: 'haircare', label: 'چاودێری قژ' },
    { value: 'fragrance', label: 'بۆن و عەتریات' }, { value: 'bodycare', label: 'چاودێری جەستە' },
    { value: 'personal_care', label: 'چاودێری کەسی' }, { value: 'beauty_tool', label: 'ئامێری جوانکاری' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'skin_type', label: 'جۆری پێست', type: 'select', options: [
    { value: 'all', label: 'هەموو جۆرەکان' }, { value: 'normal', label: 'ئاسایی' }, { value: 'dry', label: 'وشک' },
    { value: 'oily', label: 'چەور' }, { value: 'combination', label: 'تێکەڵ' }, { value: 'sensitive', label: 'هەستیار' },
  ] },
  { key: 'hair_type', label: 'جۆری قژ', type: 'select', options: [
    { value: 'all', label: 'هەموو جۆرەکان' }, { value: 'straight', label: 'ڕاست' }, { value: 'wavy', label: 'شەپۆلدار' },
    { value: 'curly', label: 'لوول' }, { value: 'coily', label: 'زۆر لوول' }, { value: 'dry', label: 'وشک' }, { value: 'oily', label: 'چەور' },
  ] },
  { key: 'main_concern', label: 'مەبەست / کێشەی سەرەکی', type: 'text', maxLength: 200, placeholder: 'وەک وشکی پێست، پاراستن لە خۆر' },
  { key: 'shade_or_tone', label: 'سایە / تۆنی ڕەنگ', type: 'text', maxLength: 120 },
  { key: 'volume_value', label: 'بڕ / قەبارە', type: 'number', min: 0, max: 100000, unit: 'بڕی هەڵبژێردراو' },
  { key: 'expiry_date', label: 'بەرواری بەسەرچوون / بەکارهێنانی پێش', type: 'date' },
  { key: 'volume_unit', label: 'یەکەی بڕ', type: 'select', options: [
    { value: 'ml', label: 'ملیلتر' }, { value: 'l', label: 'لیتر' }, { value: 'g', label: 'گرام' },
    { value: 'kg', label: 'کیلۆگرام' }, { value: 'piece', label: 'دانە' },
  ] },
  { key: 'fragrance', label: 'بۆن / Fragrance', type: 'text', maxLength: 120 },
  { key: 'ingredients', label: 'پێکهاتەکان', type: 'textarea', maxLength: 2000 },
  { key: 'allergen_warnings', label: 'هۆشداریی هەستیاربوون', type: 'textarea', maxLength: 1500 },
  { key: 'usage_instructions', label: 'ڕێنمایی بەکارهێنان', type: 'textarea', maxLength: 2000 },
  { key: 'storage_instructions', label: 'ڕێنمایی هەڵگرتن', type: 'textarea', maxLength: 1500 },
  { key: 'halal_certified', label: 'حەڵاڵە (تەنها بەڵگەدار)', type: 'checkbox' },
];

const kidsFields: CategoryDetailField[] = [
  { key: 'product_type', label: 'جۆری کاڵای منداڵان', type: 'select', required: true, options: [
    { value: 'clothing', label: 'جل‌وبەرگ' }, { value: 'toy', label: 'یاری' }, { value: 'feeding', label: 'خواردن و خواردنەوەی منداڵ' },
    { value: 'care', label: 'چاودێری منداڵ' }, { value: 'furniture', label: 'کەلوپەلی منداڵ' },
    { value: 'book', label: 'کتێب و فێرکاری' }, { value: 'safety', label: 'پاراستن و سەلامەتی' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'age_range', label: 'تەمەنی گونجاو', type: 'text', maxLength: 100, placeholder: 'وەک ٠–٦ مانگ، ٣+ ساڵ' },
  { key: 'recommended_age_months', label: 'کەمترین تەمەن', type: 'number', min: 0, max: 240, unit: 'مانگ' },
  { key: 'suitable_gender', label: 'گونجاو بۆ', type: 'select', options: [
    { value: 'all', label: 'هەموو منداڵان' }, { value: 'girls', label: 'کچان' }, { value: 'boys', label: 'کوڕان' },
  ] },
  { key: 'safety_certification', label: 'ستاندارد / بڕوانامەی سەلامەتی', type: 'text', maxLength: 200 },
  { key: 'safety_notes', label: 'تێبینیی سەلامەتی', type: 'textarea', maxLength: 2000 },
  { key: 'small_parts_warning', label: 'پارچەی بچووک هەیە (مەترسی هەڵمژین)', type: 'checkbox' },
  { key: 'batteries_required', label: 'پێویستی بە باتری هەیە', type: 'checkbox' },
  { key: 'washable', label: 'دەشۆردرێت', type: 'checkbox' },
  { key: 'care_instructions', label: 'ڕێنمایی چاودێری', type: 'textarea', maxLength: 1500 },
];

const generalFields: CategoryDetailField[] = [
  { key: 'condition', label: 'دۆخی بەرهەم', type: 'select', options: conditionOptions },
  { key: 'model', label: 'مۆدێل / کۆدی کاڵا', type: 'text', maxLength: 120 },
  { key: 'color', label: 'ڕەنگ', type: 'text', maxLength: 100 },
  { key: 'dimensions', label: 'قەبارە / پێوانە', type: 'text', maxLength: 200, placeholder: 'وەک درێژی × پانی × بەرزی' },
  { key: 'weight', label: 'کێش', type: 'text', maxLength: 100, placeholder: 'وەک ٢ کیلۆگرام' },
  { key: 'warranty_months', label: 'ماوەی گەرەنتی', type: 'number', min: 0, max: 120, unit: 'مانگ' },
  { key: 'included_items', label: 'شتە هاوپێچەکان', type: 'textarea', maxLength: 2000 },
  { key: 'usage_notes', label: 'تێبینیی بەکارهێنان', type: 'textarea', maxLength: 2000 },
];

const clothingFields: CategoryDetailField[] = [
  { key: 'condition', label: 'دۆخی بەرهەم', type: 'select', options: conditionOptions },
  { key: 'pattern', label: 'نەخش / پاتێرن', type: 'select', options: [
    { value: 'solid', label: 'یەکڕەنگ' }, { value: 'striped', label: 'هێڵدار' }, { value: 'printed', label: 'چاپکراو' },
    { value: 'floral', label: 'گوڵدار' }, { value: 'checked', label: 'خانەخانە' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'fit', label: 'فیت / قەبارەگرتن', type: 'select', options: [
    { value: 'slim', label: 'Slim' }, { value: 'regular', label: 'Regular' },
    { value: 'relaxed', label: 'Relaxed' }, { value: 'oversized', label: 'Oversized' },
  ] },
  { key: 'occasion', label: 'بۆچی بەکاردێت', type: 'text', maxLength: 160, placeholder: 'وەک ڕۆژانە، فەرمی، وەرزشی' },
  { key: 'sleeve_type', label: 'جۆری قۆڵ', type: 'select', options: [
    { value: 'sleeveless', label: 'بێ قۆڵ' }, { value: 'short', label: 'قۆڵی کورت' }, { value: 'long', label: 'قۆڵی درێژ' },
  ] },
  { key: 'closure_type', label: 'جۆری داخستن', type: 'select', options: [
    { value: 'zipper', label: 'زنجیر' }, { value: 'buttons', label: 'دوگمە' }, { value: 'pull_on', label: 'پۆشینی ڕاستەوخۆ' },
    { value: 'laces', label: 'گرێ' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'care_instructions', label: 'ڕێنمایی شۆردن و پاراستن', type: 'textarea', maxLength: 1500 },
];

const shoeFields: CategoryDetailField[] = [
  { key: 'condition', label: 'دۆخی بەرهەم', type: 'select', options: conditionOptions },
  { key: 'shoe_material', label: 'ماددەی سەرەوەی پێڵاو', type: 'text', maxLength: 160 },
  { key: 'sole_material', label: 'ماددەی بن پێڵاو', type: 'text', maxLength: 160 },
  { key: 'shoe_closure', label: 'جۆری داخستن', type: 'select', options: [
    { value: 'laces', label: 'گرێ' }, { value: 'slip_on', label: 'بێ گرێ' }, { value: 'zipper', label: 'زنجیر' },
    { value: 'velcro', label: 'ڤێلکرۆ' }, { value: 'buckle', label: 'قوفڵ' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'intended_use', label: 'مەبەستی بەکارهێنان', type: 'select', options: [
    { value: 'daily', label: 'ڕۆژانە' }, { value: 'sports', label: 'وەرزشی' },
    { value: 'formal', label: 'فەرمی' }, { value: 'outdoor', label: 'دەرەوە' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'care_instructions', label: 'ڕێنمایی چاودێری', type: 'textarea', maxLength: 1500 },
];

const bagFields: CategoryDetailField[] = [
  { key: 'condition', label: 'دۆخی بەرهەم', type: 'select', options: conditionOptions },
  { key: 'bag_type', label: 'جۆری جانتا / ئەکسسوارات', type: 'text', maxLength: 120 },
  { key: 'capacity_liters', label: 'قەبارەی ناوەوە', type: 'number', min: 0, max: 10000, unit: 'لیتر' },
  { key: 'strap_type', label: 'جۆری شانەبەند', type: 'text', maxLength: 120 },
  { key: 'closure_type', label: 'جۆری داخستن', type: 'text', maxLength: 120 },
  { key: 'included_items', label: 'شتە هاوپێچەکان', type: 'textarea', maxLength: 1500 },
  { key: 'care_instructions', label: 'ڕێنمایی چاودێری', type: 'textarea', maxLength: 1500 },
];

export function getCategoryRootSlug(
  categoryId: string,
  categories: Array<{ id: string; parent_id: string | null; slug: string }>,
): string {
  if (!categoryId) return '';
  let current = categories.find((item) => item.id === categoryId);
  let depth = 0;
  while (current?.parent_id && depth < 8) {
    const parent = categories.find((item) => item.id === current?.parent_id);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return current?.slug ?? categories.find((item) => item.id === categoryId)?.slug ?? '';
}

export function normalizeCategoryRootSlug(slug: string | null | undefined): string {
  if (!slug) return '';
  if (slug === 'supermarket' || slug.startsWith('supermarket-')) return 'supermarket';
  if (slug === 'fashion' || slug.startsWith('fashion-')) return 'fashion';
  if (slug === 'food' || slug.startsWith('food-')) return 'food';
  return slug;
}

export function getCategoryDetailFields(rootSlug: string, apparelType = ''): CategoryDetailField[] {
  const root = normalizeCategoryRootSlug(rootSlug);
  if (root === 'food') return foodFields;
  if (root === 'supermarket') return supermarketFields;
  if (root === 'electronics') return electronicsFields;
  if (root === 'home-living') return homeLivingFields;
  if (root === 'beauty') return beautyFields;
  if (root === 'kids') return kidsFields;
  if (root === 'general' || root === 'online-stores') return generalFields;
  if (root === 'fashion') {
    if (apparelType.includes('shoes')) return shoeFields;
    if (apparelType === 'bags' || apparelType === 'accessories') return bagFields;
    if (apparelType === 'fashion_beauty') return beautyFields;
    return clothingFields;
  }
  return [];
}

export function sanitizeCategoryDetails(
  rootSlug: string,
  value: CategoryDetails,
  apparelType = '',
): { values: CategoryDetails; error: string | null } {
  const root = normalizeCategoryRootSlug(rootSlug);
  const fields = getCategoryDetailFields(root, apparelType);
  const electronicsType = typeof value.product_type === 'string' ? value.product_type : '';
  const requiresMemorySpecs = root === 'electronics' && ['phone', 'tablet', 'laptop', 'desktop'].includes(electronicsType);
  const values: CategoryDetails = {};
  for (const field of fields) {
    const raw = value[field.key];
    const normalizedRaw = typeof raw === 'number' && field.type === 'number' ? String(raw) : raw;
    const empty = normalizedRaw === undefined || normalizedRaw === null || (typeof normalizedRaw === 'string' && !normalizedRaw.trim());
    if (empty) {
      if (field.required || (requiresMemorySpecs && ['ram_capacity', 'storage_capacity'].includes(field.key))) return { values: {}, error: `تکایە «${field.label}» پڕ بکەرەوە.` };
      continue;
    }
    if (field.type === 'checkbox') {
      if (normalizedRaw === true) values[field.key] = true;
      continue;
    }
    if (typeof normalizedRaw !== 'string') return { values: {}, error: `بەهای «${field.label}» دروست نییە.` };
    const normalized = normalizedRaw.trim();
    if ((field.type === 'text' || field.type === 'textarea') && normalized.length > (field.maxLength ?? (field.type === 'textarea' ? 2000 : 120))) {
      return { values: {}, error: `زانیاریی «${field.label}» زۆر درێژە.` };
    }
    if (field.type === 'date') {
      const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
      const parsedDate = isoDate ? new Date(normalized + 'T00:00:00.000Z') : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== normalized) {
        return { values: {}, error: `بەرواری «${field.label}» دروست نییە.` };
      }
      values[field.key] = normalized;
      continue;
    }
    if (field.type === 'number') {
      const number = Number(normalized);
      if (!Number.isFinite(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
        return { values: {}, error: `ژمارەی «${field.label}» دروست نییە.` };
      }
      values[field.key] = String(number);
      continue;
    }
    if (field.type === 'select' && !field.options?.some((option) => option.value === normalized)) {
      return { values: {}, error: `تکایە بۆ «${field.label}» هەڵبژاردەیەکی دروست دیاری بکە.` };
    }
    values[field.key] = normalized;
  }
  if (root === 'electronics') {
    const colorOptions = electronicsFields.find((field) => field.key === 'color')?.options ?? [];
    const rawColors = typeof values.available_colors === 'string'
      ? values.available_colors.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    const selectedColors = [...new Set(rawColors.length ? rawColors : (typeof values.color === 'string' && values.color ? [values.color] : []))];
    if (!selectedColors.length) return { values: {}, error: 'لانیکەم یەک ڕەنگی بەردەست دیاری بکە.' };
    if (selectedColors.some((color) => !colorOptions.some((option) => option.value === color))) {
      return { values: {}, error: 'یەکێک لە ڕەنگەکان دروست نییە؛ تەنها ڕەنگە هەڵبژێردراوەکان بەکاربهێنە.' };
    }
    values.color = selectedColors[0];
    values.available_colors = selectedColors.join(',');

    const rawIndexes = values.color_image_indexes;
    if (typeof rawIndexes === 'string' && rawIndexes.trim()) {
      let parsedIndexes: unknown;
      try { parsedIndexes = JSON.parse(rawIndexes); } catch { return { values: {}, error: 'پێوەندی وێنەکان دروست نییە.' }; }
      if (!parsedIndexes || typeof parsedIndexes !== 'object' || Array.isArray(parsedIndexes)) {
        return { values: {}, error: 'پێوەندی وێنەکان دروست نییە.' };
      }
      const indexMap = parsedIndexes as Record<string, unknown>;
      if (Object.keys(indexMap).some((color) => !selectedColors.includes(color))
        || selectedColors.some((color) => !Number.isInteger(indexMap[color]) || Number(indexMap[color]) < 0 || Number(indexMap[color]) >= 8)) {
        return { values: {}, error: 'بۆ هەر ڕەنگێک وێنەیەکی دروست دیاری بکە.' };
      }
      values.color_image_indexes = JSON.stringify(indexMap);
    }
  }
  return { values, error: null };
}

export function getVisibleCategoryDetails(
  rootSlug: string,
  value: CategoryDetails | null | undefined,
  apparelType = '',
): Array<{ key: string; label: string; value: string }> {
  const values = value ?? {};
  return getCategoryDetailFields(rootSlug, apparelType).flatMap((field) => {
    if (field.key === 'expiry_date' || field.key === 'color_image_indexes' || field.key === 'color_image_paths') return [];
    if (field.key === 'color' && typeof values.available_colors === 'string' && values.available_colors.trim()) return [];
    const raw = field.key === 'available_colors' && typeof values.available_colors !== 'string' && typeof values.color === 'string'
      ? values.color
      : values[field.key];
    if (typeof raw === 'boolean') return raw ? [{ key: field.key, label: field.label, value: 'بەڵێ' }] : [];
    if ((typeof raw !== 'string' && typeof raw !== 'number') || String(raw).trim() === '') return [];
    const normalized = String(raw);
    if (field.key === 'available_colors') {
      const colorOptions = electronicsFields.find((item) => item.key === 'color')?.options ?? [];
      const labels = normalized.split(',').map((value) => value.trim()).filter(Boolean)
        .map((value) => colorOptions.find((option) => option.value === value)?.label ?? value);
      return labels.length ? [{ key: field.key, label: 'ڕەنگەکان', value: labels.join('، ') }] : [];
    }
    const display = field.type === 'select'
      ? field.options?.find((option) => option.value === normalized)?.label ?? normalized
      : field.type === 'number' && field.unit
        ? `${normalized} ${field.unit}`
        : normalized;
    return [{ key: field.key, label: field.label, value: display }];
  });
}
