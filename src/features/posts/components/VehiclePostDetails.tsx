import { AlertTriangle, CarFront, FileText, Fuel, Gauge, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import {
  VEHICLE_BODY_LABELS,
  VEHICLE_CONDITION_LABELS,
  VEHICLE_DOCUMENT_LABELS,
  VEHICLE_DRIVETRAIN_LABELS,
  VEHICLE_FEATURE_OPTIONS,
  VEHICLE_FUEL_LABELS,
  VEHICLE_ORIGIN_LABELS,
  VEHICLE_READINESS_LABELS,
  VEHICLE_TRANSMISSION_LABELS,
  VEHICLE_TRI_STATE_LABELS,
  VEHICLE_TYPE_LABELS,
  type VehicleListingRecord,
} from '../vehicleTypes';

type Props = {
  listing: VehicleListingRecord;
  location?: string | null;
};

function valueLabel(raw: string | null | undefined, labels?: Record<string, string>) {
  if (raw == null || raw.trim() === '') return 'زانیاری تۆمار نەکراوە';
  if (raw === 'unknown') return 'نازانم';
  return labels?.[raw] ?? raw;
}

function TextValue({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value == null || value === '' ? 'زانیاری تۆمار نەکراوە' : String(value);
  return (
    <div className="min-w-0 rounded-xl border border-black/[0.04] bg-[var(--shakh-bg)] p-3">
      <div className="text-xs font-bold text-black/45">{label}</div>
      <div className="mt-1 break-words whitespace-pre-wrap text-sm font-black leading-6">{display === 'unknown' ? 'نازانم' : display}</div>
    </div>
  );
}

function Section({
  icon: Icon, title, children,
}: {
  icon: typeof CarFront; title: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-black"><Icon size={18} className="text-[var(--shakh-orange)]"/>{title}</h2>
      {children}
    </section>
  );
}

const issueLabels: Array<[keyof VehicleListingRecord, string]> = [
  ['engine_issue', 'کێشەی بزوێنەر'],
  ['transmission_issue', 'کێشەی گێڕ'],
  ['electrical_issue', 'کێشەی کارەبا'],
  ['paint_issue', 'کێشەی بۆیاغ / ڕەنگ'],
  ['tire_issue', 'کێشەی تایەر'],
  ['other_issue', 'کێشەی سیستەمی تر'],
];

export function VehiclePostDetails({ listing, location }: Props) {
  const currencyLabel = listing.currency === 'USD' ? '$' : 'د.ع';
  const discountedPrice = Math.round(Number(listing.price_amount) * (100 - listing.discount_percent) / 100);
  const knownFeatures = VEHICLE_FEATURE_OPTIONS
    .filter(([key]) => listing.features?.includes(key))
    .map(([, label]) => label);
  const issues = issueLabels
    .map(([key, label]) => ({ label, value: listing[key] as string | null }))
    .filter((item) => item.value != null && item.value !== '');

  return (
    <div className="mt-6 space-y-4" dir="rtl">
      <section className="rounded-2xl border border-[var(--shakh-orange)]/20 bg-[var(--shakh-orange)]/[0.04] p-4 sm:p-5">
        <div className="flex items-center gap-2"><CarFront size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">پوختەی ئۆتۆمبێل</h2></div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black">
          <span className="rounded-full bg-white px-3 py-1.5">{valueLabel(listing.vehicle_type, VEHICLE_TYPE_LABELS)}</span>
          <span className="rounded-full bg-white px-3 py-1.5">{valueLabel(listing.vehicle_condition, VEHICLE_CONDITION_LABELS)}</span>
          <span className="rounded-full bg-white px-3 py-1.5">{valueLabel(listing.origin, VEHICLE_ORIGIN_LABELS)}</span>
          {listing.discount_percent > 0 ? <span className="rounded-full bg-red-500/10 px-3 py-1.5 text-red-700">{listing.discount_percent}٪ داشکاندن</span> : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <TextValue label="براند / کۆمپانیا" value={listing.make}/>
          <TextValue label="مۆدێل" value={listing.model}/>
          <TextValue label="تریم / مۆدێلی لاوەکی" value={listing.trim}/>
          <TextValue label="ساڵی دروستکردن" value={listing.manufacturing_year}/>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-3">
            <div className="text-xs font-bold text-black/45">نرخی ڕەسەن</div>
            <div className="mt-1 text-base font-black">{Number(listing.price_amount).toLocaleString('en-US')} {currencyLabel}</div>
          </div>
          {listing.discount_percent > 0 ? <div className="rounded-xl bg-white p-3">
            <div className="text-xs font-bold text-black/45">نرخ دوای داشکاندن</div>
            <div className="mt-1 text-base font-black text-[var(--shakh-orange)]">{discountedPrice.toLocaleString('en-US')} {currencyLabel}</div>
          </div> : null}
          <TextValue label="جێگۆڕکێی نرخ" value={listing.price_negotiable === true ? 'بەڵێ' : listing.price_negotiable === false ? 'نەخێر' : 'نازانم'}/>
          {location ? <div className="rounded-xl bg-white p-3"><div className="flex items-center gap-1 text-xs font-bold text-black/45"><MapPin size={14}/>شوێنی ئۆتۆمبێل</div><div className="mt-1 break-words text-sm font-black">{location}</div></div> : null}
        </div>
      </section>

      <Section icon={Gauge} title="زانیاریی تەکنیکی">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <TextValue label="ڕەنگی دەرەوە" value={listing.exterior_color}/>
          <TextValue label="ڕەنگی ناوەوە" value={listing.interior_color}/>
          <TextValue label="کیلۆمەتر" value={listing.mileage_km == null ? 'نازانراوە' : Number(listing.mileage_km).toLocaleString('en-US') + ' km'}/>
          <TextValue label="سووتەمەنی" value={valueLabel(listing.fuel_type, VEHICLE_FUEL_LABELS)}/>
          <TextValue label="جۆری گێڕ" value={valueLabel(listing.transmission, VEHICLE_TRANSMISSION_LABELS)}/>
          <TextValue label="قەبارەی بزوێنەر" value={listing.engine_cc == null ? 'نازانراوە' : Number(listing.engine_cc).toLocaleString('en-US') + ' CC'}/>
          <TextValue label="جۆری جەستە" value={valueLabel(listing.body_type, VEHICLE_BODY_LABELS)}/>
          <TextValue label="سیستەمی ڕاکێشان" value={valueLabel(listing.drivetrain, VEHICLE_DRIVETRAIN_LABELS)}/>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="دۆخ و مێژووی ئۆتۆمبێل">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <TextValue label="ژمارەی خاوەندارێتی" value={listing.ownership_count == null ? 'نازانراوە' : listing.ownership_count}/>
          <TextValue label="ڕووداوی پێشوو" value={valueLabel(listing.accident_history, VEHICLE_TRI_STATE_LABELS)}/>
          <TextValue label="ڕەنگکراوە / پارچەی گۆڕدراو" value={valueLabel(listing.repainted_or_replaced_parts, VEHICLE_TRI_STATE_LABELS)}/>
          {listing.repaint_replacement_details ? <div className="sm:col-span-2 lg:col-span-3"><TextValue label="وردەکاریی ڕەنگکردن و گۆڕینی پارچە" value={listing.repaint_replacement_details}/></div> : null}
        </div>
      </Section>

      <Section icon={Wrench} title="کێشە، سێرڤیس و تایبەتمەندی">
        {issues.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{issues.map((item) => <TextValue key={item.label} label={item.label} value={valueLabel(item.value, VEHICLE_TRI_STATE_LABELS}/>)}</div> : <p className="text-sm text-black/45">هیچ وەڵامێک بۆ کێشەکان تۆمار نەکراوە؛ ئەمە بە مانای نەبوونی کێشە نییە.</p>}
        {listing.known_problems ? <TextValue label="وەسفی کێشەکان" value={listing.known_problems}/> : null}
        {listing.service_history ? <TextValue label="مێژووی چاککردنەوە و سێرڤیس" value={listing.service_history}/> : null}
        <div>
          <div className="mb-2 text-xs font-bold text-black/45">تایبەتمەندییە ڕاستەقینە هەڵبژێردراوەکان</div>
          {knownFeatures.length ? <div className="flex flex-wrap gap-2">{knownFeatures.map((feature) => <span key={feature} className="rounded-full border border-black/10 bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-bold">{feature}</span>)}</div> : <p className="text-sm text-black/45">هیچ تایبەتمەندییەک دیاری نەکراوە.</p>}
        </div>
      </Section>

      <Section icon={FileText} title="بەڵگەنامە، ئامادەبوون و پەیوەندی">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <TextValue label="ئامادەبوون بۆ فرۆشتن" value={valueLabel(listing.sale_readiness, VEHICLE_READINESS_LABELS)}/>
          <TextValue label="بەڵگەنامە یاساییەکان" value={valueLabel(listing.legal_documents_status, VEHICLE_DOCUMENT_LABELS)}/>
          {listing.legal_document_notes ? <TextValue label="وردەکاریی بەڵگەنامەکان" value={listing.legal_document_notes}/> : null}
          {listing.contact_name ? <TextValue label="ناوی پەیوەندی" value={listing.contact_name}/> : null}
          <div className="rounded-xl border border-black/[0.04] bg-[var(--shakh-bg)] p-3">
            <div className="text-xs font-bold text-black/45">ژمارەی پەیوەندی</div>
            <a className="mt-1 inline-block text-sm font-black text-[var(--shakh-blue)] underline" href={'tel:' + listing.contact_phone}>{listing.contact_phone}</a>
          </div>
        </div>
        {listing.legal_documents_status === 'missing' ? <div className="mt-3 flex gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-6 text-amber-800"><AlertTriangle size={16} className="mt-1 shrink-0"/> فرۆشیار تۆماری کردووە کە بەڵگەنامەکان بەردەست نین یان ناتەواون؛ پێش کڕین پشتڕاستی بکەرەوە.</div> : null}
      </Section>
    </div>
  );
}
