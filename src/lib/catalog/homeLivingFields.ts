import type { CategoryDetailField } from './categoryDetails';

const conditionOptions = [
  { value: 'new', label: 'نوێ' },
  { value: 'used', label: 'بەکارهاتوو' },
];

export const homeLivingFields: CategoryDetailField[] = [
  { key: 'listing_kind', label: 'جۆری پۆست', type: 'select', required: true, options: [
    { value: 'property', label: 'خانوو، زەوی و موڵک' },
    { value: 'furniture', label: 'مۆبیلیات و کەلوپەل' },
  ] },
  { key: 'property_type', label: 'جۆری موڵک', type: 'select', options: [
    { value: 'house', label: 'خانوو' }, { value: 'apartment', label: 'شوقە' },
    { value: 'land', label: 'زەوی' }, { value: 'commercial', label: 'موڵکی بازرگانی' },
    { value: 'villa', label: 'ڤێلا' }, { value: 'other', label: 'جۆری تر' },
  ] },
  { key: 'deal_type', label: 'جۆری مامەڵە', type: 'select', options: [
    { value: 'sale', label: 'فرۆشتن' }, { value: 'rent', label: 'کرێ' },
  ] },
  { key: 'area_sqm', label: 'ڕووبەر', type: 'number', min: 1, max: 1000000, unit: 'م²' },
  { key: 'bedrooms', label: 'ژووری نوستن', type: 'number', min: 0, max: 100 },
  { key: 'bathrooms', label: 'حەمام', type: 'number', min: 0, max: 100 },
  { key: 'floor_number', label: 'ژمارەی نهۆم', type: 'number', min: 0, max: 300 },
  { key: 'property_condition', label: 'دۆخی موڵک', type: 'select', options: [
    { value: 'new', label: 'نوێ' }, { value: 'used', label: 'بەکارهاتوو' },
    { value: 'under_construction', label: 'لە ژێر دروستکردندا' },
  ] },
  { key: 'ownership_documents', label: 'بەڵگەی خاوەندارێتی', type: 'select', options: [
    { value: 'available', label: 'بەردەستە' }, { value: 'missing', label: 'نییە' },
    { value: 'unknown', label: 'پشتڕاست نەکراوەتەوە' },
  ] },
  { key: 'furniture_condition', label: 'دۆخی مۆبیلیات و کەلوپەل', type: 'select', options: conditionOptions },
  { key: 'color', label: 'ڕەنگ', type: 'text', maxLength: 100 },
  { key: 'style', label: 'ستایل / شێواز', type: 'text', maxLength: 120 },
  { key: 'room_or_location', label: 'شوێنی بەکارهێنان', type: 'text', maxLength: 120 },
  { key: 'dimension_length', label: 'درێژی', type: 'number', min: 0, max: 100000 },
  { key: 'dimension_width', label: 'پانی', type: 'number', min: 0, max: 100000 },
  { key: 'dimension_height', label: 'بەرزی', type: 'number', min: 0, max: 100000 },
  { key: 'dimension_unit', label: 'یەکەی پێوانە', type: 'select', options: [
    { value: 'cm', label: 'سانتیمەتر' }, { value: 'm', label: 'مەتر' }, { value: 'inch', label: 'ئینچ' },
  ] },
  { key: 'weight_value', label: 'کێش', type: 'number', min: 0, max: 1000000 },
  { key: 'weight_unit', label: 'یەکەی کێش', type: 'select', options: [
    { value: 'g', label: 'گرام' }, { value: 'kg', label: 'کیلۆگرام' },
  ] },
  { key: 'assembly_required', label: 'پێویستی بە کۆکردنەوە هەیە', type: 'checkbox' },
  { key: 'warranty_months', label: 'ماوەی گەرەنتی', type: 'number', min: 0, max: 120, unit: 'مانگ' },
  { key: 'care_instructions', label: 'ڕێنمایی چاودێری و پاککردنەوە', type: 'textarea', maxLength: 2000 },
];
