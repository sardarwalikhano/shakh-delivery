export type VehicleListingDraft = {
  vehicle_type: string;
  make: string;
  model: string;
  trim: string;
  manufacturing_year: string;
  price_amount: string;
  currency: string;
  discount_percent: string;
  price_negotiable: string;
  exterior_color: string;
  interior_color: string;
  mileage_km: string;
  fuel_type: string;
  transmission: string;
  engine_cc: string;
  body_type: string;
  drivetrain: string;
  vehicle_condition: string;
  origin: string;
  ownership_count: string;
  accident_history: string;
  repainted_or_replaced_parts: string;
  repaint_replacement_details: string;
  engine_issue: string;
  transmission_issue: string;
  electrical_issue: string;
  paint_issue: string;
  tire_issue: string;
  other_issue: string;
  known_problems: string;
  service_history: string;
  features: string[];
  sale_readiness: string;
  legal_documents_status: string;
  legal_document_notes: string;
  contact_name: string;
  contact_phone: string;
  location: string;
};

export type VehiclePhotoKind =
  | 'front_exterior'
  | 'rear'
  | 'interior'
  | 'dashboard'
  | 'engine'
  | 'other'
  | '';

export type VehicleListingRecord = {
  post_id: string;
  vehicle_type: string;
  make: string;
  model: string;
  trim: string | null;
  manufacturing_year: number | null;
  price_amount: number;
  currency: 'IQD' | 'USD';
  discount_percent: number;
  price_negotiable: boolean | null;
  exterior_color: string | null;
  interior_color: string | null;
  mileage_km: number | null;
  fuel_type: string | null;
  transmission: string | null;
  engine_cc: number | null;
  body_type: string | null;
  drivetrain: string | null;
  vehicle_condition: string;
  origin: string;
  ownership_count: number | null;
  accident_history: string;
  repainted_or_replaced_parts: string;
  repaint_replacement_details: string | null;
  engine_issue: string | null;
  transmission_issue: string | null;
  electrical_issue: string | null;
  paint_issue: string | null;
  tire_issue: string | null;
  other_issue: string | null;
  known_problems: string | null;
  service_history: string | null;
  features: string[];
  sale_readiness: string;
  legal_documents_status: string;
  legal_document_notes: string | null;
  contact_name: string | null;
  contact_phone: string;
  created_at: string;
  updated_at: string;
};

export const EMPTY_VEHICLE_LISTING: VehicleListingDraft = {
  vehicle_type: '',
  make: '',
  model: '',
  trim: '',
  manufacturing_year: '',
  price_amount: '',
  currency: '',
  discount_percent: '',
  price_negotiable: '',
  exterior_color: '',
  interior_color: '',
  mileage_km: '',
  fuel_type: '',
  transmission: '',
  engine_cc: '',
  body_type: '',
  drivetrain: '',
  vehicle_condition: '',
  origin: '',
  ownership_count: '',
  accident_history: '',
  repainted_or_replaced_parts: '',
  repaint_replacement_details: '',
  engine_issue: '',
  transmission_issue: '',
  electrical_issue: '',
  paint_issue: '',
  tire_issue: '',
  other_issue: '',
  known_problems: '',
  service_history: '',
  features: [],
  sale_readiness: '',
  legal_documents_status: '',
  legal_document_notes: '',
  contact_name: '',
  contact_phone: '',
  location: '',
};

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  sedan: 'سواری',
  suv: 'SUV',
  pickup: 'پیکاپ',
  hatchback: 'هاتچباک',
  coupe: 'کووپێ',
  convertible: 'سەقف‌کراو / کۆنڤێرتیبڵ',
  wagon: 'واگۆن',
  van: 'ڤان',
  minivan: 'مینی‌ڤان',
  truck: 'باری',
  motorcycle: 'ماتۆڕ',
  other: 'جۆری تر',
  unknown: 'نازانم',
};
export const VEHICLE_FUEL_LABELS: Record<string, string> = {
  gasoline: 'بەنزین',
  diesel: 'گازۆیل',
  hybrid: 'هايبرید',
  electric: 'کارەبایی',
  lpg: 'LPG',
  cng: 'CNG',
  other: 'جۆری تر',
  unknown: 'نازانم',
};
export const VEHICLE_TRANSMISSION_LABELS: Record<string, string> = {
  manual: 'دەستی',
  automatic: 'ئۆتۆماتیک',
  cvt: 'CVT',
  semi_automatic: 'نیوە ئۆتۆماتیک',
  other: 'جۆری تر',
  unknown: 'نازانم',
};
export const VEHICLE_DRIVETRAIN_LABELS: Record<string, string> = {
  fwd: 'FWD · پێشەوە',
  rwd: 'RWD · دواوە',
  awd: 'AWD · هەموو چەرخەکان',
  '4x4': '4×4',
  other: 'جۆری تر',
  unknown: 'نازانم',
};
export const VEHICLE_CONDITION_LABELS: Record<string, string> = {
  new: 'نوێ',
  used: 'بەکارهاتوو',
  unknown: 'نازانم',
};
export const VEHICLE_ORIGIN_LABELS: Record<string, string> = {
  local: 'ناوخۆیی',
  imported: 'هاوردەکراو',
  unknown: 'نازانم',
};
export const VEHICLE_TRI_STATE_LABELS: Record<string, string> = {
  yes: 'بەڵێ',
  no: 'نەخێر',
  unknown: 'نازانم',
};
export const VEHICLE_BODY_LABELS: Record<string, string> = {
  sedan: 'سواری',
  suv: 'SUV',
  pickup: 'پیکاپ',
  hatchback: 'هاتچباک',
  coupe: 'کووپێ',
  convertible: 'کۆنڤێرتیبڵ',
  wagon: 'واگۆن',
  van: 'ڤان',
  minivan: 'مینی‌ڤان',
  truck: 'باری',
  motorcycle: 'ماتۆڕ',
  other: 'جۆری تر',
  unknown: 'نازانم',
};
export const VEHICLE_READINESS_LABELS: Record<string, string> = {
  ready: 'ئامادەی فرۆشتنە',
  not_ready: 'هێشتا ئامادە نییە',
  unknown: 'نازانم',
};
export const VEHICLE_DOCUMENT_LABELS: Record<string, string> = {
  available: 'بەڵێ، بەردەستن',
  missing: 'نەخێر / ناتەواون',
  unknown: 'نازانم',
};

export const VEHICLE_FEATURE_OPTIONS = [
  ['abs', 'ABS'],
  ['airbags', 'Airbags'],
  ['parking_sensors', 'سێنسەری پارککردن'],
  ['rear_camera', 'کامێرای دواوە'],
  ['cruise_control', 'Cruise control'],
  ['sunroof', 'سەقف‌پانۆراما / Sunroof'],
  ['navigation', 'Navigation'],
  ['leather_seats', 'کورسیی چەرم'],
  ['heated_seats', 'کورسیی گەرمکەرەوە'],
  ['keyless_entry', 'Keyless entry'],
  ['apple_carplay', 'Apple CarPlay'],
  ['android_auto', 'Android Auto'],
  ['blind_spot_monitor', 'چاودێری خاڵی کوێر'],
  ['lane_assist', 'Lane assist'],
] as const;

export const VEHICLE_PHOTO_KIND_LABELS: Record<Exclude<VehiclePhotoKind, ''>, string> = {
  front_exterior: 'دەرەوە / پێشەوە',
  rear: 'پاشەوە',
  interior: 'ناوەوە',
  dashboard: 'داشبۆرد',
  engine: 'بزوێنەر',
  other: 'وێنەی تر',
};

export function validateVehicleListing(draft: VehicleListingDraft): string | null {
  if (!draft.vehicle_type) return 'جۆری ئۆتۆمبێل هەڵبژێرە.';
  if (draft.make.trim().length < 1 || draft.make.trim().length > 100) return 'ناوی کۆمپانیا / براند بنووسە.';
  if (draft.model.trim().length < 1 || draft.model.trim().length > 100) return 'ناوی مۆدێل بنووسە.';
  if (draft.trim.trim().length > 100) return 'زانیاریی تریم زۆر درێژە.';
  if (draft.manufacturing_year && draft.manufacturing_year !== 'unknown') {
    const year = Number(draft.manufacturing_year);
    if (!Number.isInteger(year) || year < 1886 || year > new Date().getFullYear() + 1) return 'ساڵی دروستکردن دروست نییە.';
  }
  const price = Number(draft.price_amount);
  if (!draft.price_amount.trim() || !Number.isFinite(price) || price <= 0) return 'نرخی ئۆتۆمبێل دەبێت لە سفر زیاتر بێت.';
  if (!['IQD', 'USD'].includes(draft.currency)) return 'دراوی نرخ هەڵبژێرە.';
  const discount = Number(draft.discount_percent);
  if (draft.discount_percent.trim() === '' || !Number.isInteger(discount) || discount < 0 || discount > 99) return 'داشکاندن لە ٠ تا ٩٩٪ دیاری بکە؛ ئەگەر نییە ٠ هەڵبژێرە.';
  if (!['yes', 'no', 'unknown'].includes(draft.price_negotiable)) return 'دیاری بکە نرخ جێگۆڕکێی تێدایە یان نا، یان نازانم هەڵبژێرە.';
  if (!['new', 'used', 'unknown'].includes(draft.vehicle_condition)) return 'دۆخی ئۆتۆمبێل هەڵبژێرە.';
  if (!['local', 'imported', 'unknown'].includes(draft.origin)) return 'ناوخۆیی یان هاوردەکراو دیاری بکە، یان نازانم هەڵبژێرە.';
  if (!['yes', 'no', 'unknown'].includes(draft.accident_history)) return 'بارودۆخی ڕووداوی پێشوو دیاری بکە.';
  if (!['yes', 'no', 'unknown'].includes(draft.repainted_or_replaced_parts)) return 'دیاری بکە ڕەنگکراوە یان پارچەی گۆڕدراوی هەیە یان زانیارییەکە نازانیت.';
  if (draft.repainted_or_replaced_parts === 'yes' && draft.repaint_replacement_details.trim().length < 3) return 'وردەکاریی ڕەنگکردن یان پارچەی گۆڕدراو بنووسە.';
  if (!['ready', 'not_ready', 'unknown'].includes(draft.sale_readiness)) return 'ئاستی ئامادەبوون بۆ فرۆشتن دیاری بکە.';
  if (!['available', 'missing', 'unknown'].includes(draft.legal_documents_status)) return 'بارودۆخی بەڵگەنامە یاساییەکان دیاری بکە.';
  if (draft.location.trim().length < 2 || draft.location.trim().length > 180) return 'شوێنی ئۆتۆمبێل بنووسە.';
  if (draft.contact_phone.trim().length < 6 || draft.contact_phone.trim().length > 40) return 'ژمارەی پەیوەندی دروست بنووسە.';

  for (const [label, raw, max] of [
    ['کیلۆمەتر', draft.mileage_km, 2_000_000],
    ['قەبارەی بزوێنەر', draft.engine_cc, 20_000],
    ['ژمارەی خاوەندارێتی', draft.ownership_count, 100],
  ] as const) {
    if (!raw || raw === 'unknown') continue;
    const value = Number(raw);
    const min = label === 'ژمارەی خاوەندارێتی' ? 1 : 0;
    if (!Number.isInteger(value) || value < min || value > max) return label + ' دروست نییە.';
  }
  if (draft.known_problems.length > 5000 || draft.service_history.length > 5000 || draft.legal_document_notes.length > 2000) {
    return 'یەکێک لە وەسفەکان زۆر درێژە.';
  }
  const hasKnownIssue = [draft.engine_issue, draft.transmission_issue, draft.electrical_issue, draft.paint_issue, draft.tire_issue, draft.other_issue].includes('yes');
  if (hasKnownIssue && draft.known_problems.trim().length < 3) return 'کێشەی دیاریکراو هەیە؛ تکایە وردەکارییەکانی بنووسە.';
  return null;
}

export function vehicleListingToDatabase(draft: VehicleListingDraft) {
  const optionalNumber = (value: string): number | null =>
    !value.trim() || value === 'unknown' ? null : Number(value);
  const optionalText = (value: string): string | null => value.trim() || null;
  return {
    vehicle_type: draft.vehicle_type,
    make: draft.make.trim(),
    model: draft.model.trim(),
    trim: optionalText(draft.trim),
    manufacturing_year: optionalNumber(draft.manufacturing_year),
    price_amount: Number(draft.price_amount),
    currency: draft.currency,
    discount_percent: Number(draft.discount_percent),
    price_negotiable: draft.price_negotiable === 'yes' ? true : draft.price_negotiable === 'no' ? false : null,
    exterior_color: optionalText(draft.exterior_color),
    interior_color: optionalText(draft.interior_color),
    mileage_km: optionalNumber(draft.mileage_km),
    fuel_type: optionalText(draft.fuel_type),
    transmission: optionalText(draft.transmission),
    engine_cc: optionalNumber(draft.engine_cc),
    body_type: optionalText(draft.body_type),
    drivetrain: optionalText(draft.drivetrain),
    vehicle_condition: draft.vehicle_condition,
    origin: draft.origin,
    ownership_count: optionalNumber(draft.ownership_count),
    accident_history: draft.accident_history,
    repainted_or_replaced_parts: draft.repainted_or_replaced_parts,
    repaint_replacement_details: optionalText(draft.repaint_replacement_details),
    engine_issue: optionalText(draft.engine_issue),
    transmission_issue: optionalText(draft.transmission_issue),
    electrical_issue: optionalText(draft.electrical_issue),
    paint_issue: optionalText(draft.paint_issue),
    tire_issue: optionalText(draft.tire_issue),
    other_issue: optionalText(draft.other_issue),
    known_problems: optionalText(draft.known_problems),
    service_history: optionalText(draft.service_history),
    features: draft.features,
    sale_readiness: draft.sale_readiness,
    legal_documents_status: draft.legal_documents_status,
    legal_document_notes: optionalText(draft.legal_document_notes),
    contact_name: optionalText(draft.contact_name),
    contact_phone: draft.contact_phone.trim(),
  };
}

export function singleVehicleListing(
  value: VehicleListingRecord | VehicleListingRecord[] | null | undefined,
): VehicleListingRecord | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
