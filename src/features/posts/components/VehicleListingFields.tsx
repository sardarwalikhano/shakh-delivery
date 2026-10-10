import { AlertTriangle, Camera, CarFront, CircleDollarSign, ClipboardCheck, FileText, Gauge, MapPin, Settings2, ShieldCheck, Wrench } from 'lucide-react';
import { Field, inputClass } from '@/features/auth/components/AuthCard';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import {
  VEHICLE_BODY_LABELS,
  VEHICLE_CONDITION_LABELS,
  VEHICLE_DOCUMENT_LABELS,
  VEHICLE_DRIVETRAIN_LABELS,
  VEHICLE_FEATURE_OPTIONS,
  VEHICLE_FUEL_LABELS,
  VEHICLE_ORIGIN_LABELS,
  VEHICLE_PHOTO_KIND_LABELS,
  VEHICLE_READINESS_LABELS,
  VEHICLE_TRANSMISSION_LABELS,
  VEHICLE_TRI_STATE_LABELS,
  VEHICLE_TYPE_LABELS,
  type VehicleListingDraft,
  type VehiclePhotoKind,
} from '../vehicleTypes';
import { MAX_POST_IMAGES } from '@/lib/storage/postMedia';

type Props = {
  value: VehicleListingDraft;
  onChange: (next: VehicleListingDraft) => void;
  title: string;
  onTitleChange: (next: string) => void;
  content: string;
  onContentChange: (next: string) => void;
  images: File[];
  onImagesChange: (next: File[]) => void;
  imageKinds: Map<File, VehiclePhotoKind>;
  onPhotoKindChange: (file: File, kind: VehiclePhotoKind) => void;
  reviewing: boolean;
  onEdit: () => void;
  disabled?: boolean;
};

const issueOptions = [
  ['engine_issue', 'بزوێنەر'],
  ['transmission_issue', 'گێڕ'],
  ['electrical_issue', 'کارەبا'],
  ['paint_issue', 'بۆیاغ / ڕەنگ'],
  ['tire_issue', 'تایەر'],
  ['other_issue', 'سیستەمی تر'],
] as const;

const photoKindOptions = Object.entries(VEHICLE_PHOTO_KIND_LABELS) as Array<[Exclude<VehiclePhotoKind, ''>, string]>;

function SectionHeading({ icon: Icon, title, description }: { icon: typeof CarFront; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><Icon size={19} /></span>
      <div>
        <h3 className="text-lg font-black">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-6 text-black/45">{description}</p> : null}
      </div>
    </div>
  );
}

function CarField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-sm font-black">
      <span className="mb-2 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-medium leading-5 text-black/40">{hint}</span> : null}
    </label>
  );
}

function OptionalNumberField({
  label, value, onChange, min = 0, max, suffix, disabled,
}: {
  label: string; value: string; onChange: (next: string) => void; min?: number; max?: number; suffix?: string; disabled?: boolean;
}) {
  const unknown = value === 'unknown';
  return (
    <div className="min-w-0">
      <CarField label={label} hint={suffix}>
        <input
          className={inputClass}
          type="number"
          min={min}
          max={max}
          step="1"
          inputMode="numeric"
          value={unknown ? '' : value}
          disabled={disabled || unknown}
          onChange={(event) => onChange(event.target.value)}
          placeholder="نەزانراوە / بەتاڵ بهێڵە"
        />
      </CarField>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-black/55">
        <input type="checkbox" checked={unknown} disabled={disabled} onChange={(event) => onChange(event.target.checked ? 'unknown' : '')} className="size-4 accent-[var(--shakh-orange)]" />
        زانیارییەکەم نازانم
      </label>
    </div>
  );
}

function selectDisplay(raw: string, labels?: Record<string, string>): string {
  if (raw === 'unknown') return 'نازانراوە';
  if (!raw) return 'زانیاری تۆمار نەکراوە';
  return labels?.[raw] ?? raw;
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 rounded-xl bg-white p-3"><div className="text-xs font-bold text-black/45">{label}</div><div className="mt-1 break-words text-sm font-black leading-6">{value || 'زانیاری تۆمار نەکراوە'}</div></div>;
}

export function VehicleListingFields({
  value, onChange, title, onTitleChange, content, onContentChange, images, onImagesChange,
  imageKinds, onPhotoKindChange, reviewing, onEdit, disabled = false,
}: Props) {
  const update = <K extends keyof VehicleListingDraft>(key: K, next: VehicleListingDraft[K]) => {
    onChange({ ...value, [key]: next });
  };

  const yearNow = new Date().getFullYear();
  const yearOptions = Array.from({ length: Math.max(0, yearNow + 1 - 1950 + 1) }, (_, index) => String(yearNow + 1 - index));
  const hasIssue = issueOptions.some(([key]) => value[key] === 'yes');
  const selectedFeatureLabels = VEHICLE_FEATURE_OPTIONS.filter(([key]) => value.features.includes(key)).map(([, label]) => label);

  const sections = [
    ['١', 'زانیاریی گشتی'], ['٢', 'زانیاریی تەکنیکی'], ['٣', 'دۆخی ئۆتۆمبێل'],
    ['٤', 'کێشە و سێرڤیس'], ['٥', 'نرخ و شوێن'], ['٦', 'وێنەکان'], ['٧', 'پێداچوونەوە'],
  ] as const;

  if (reviewing) {
    return (
      <section className="space-y-5" dir="rtl">
        <div className="rounded-2xl border border-[var(--shakh-blue)]/20 bg-[var(--shakh-blue)]/[0.04] p-4 sm:p-5">
          <div className="flex items-center gap-2"><ClipboardCheck className="text-[var(--shakh-blue)]" size={20}/><h2 className="text-xl font-black">پێداچوونەوەی کۆتایی پێش بڵاوکردنەوە</h2></div>
          <p className="mt-2 text-sm leading-6 text-black/50">تەنها زانیاریی نووسراو یان هەڵبژێردراو پیشان دەدرێت. خانە بەتاڵەکان وەک «زانیاری تۆمار نەکراوە» نیشان دەدرێن؛ هیچ تایبەتمەندییەک لە خۆوە زیاد نەکراوە.</p>
        </div>

        <section className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
          <SectionHeading icon={CarFront} title="١. زانیاریی گشتی" />
          <div className="grid gap-2 sm:grid-cols-2">
            <SummaryRow label="ناونیشانی پۆست" value={title.trim() || 'زانیاری تۆمار نەکراوە'} />
            <SummaryRow label="جۆری ئۆتۆمبێل" value={selectDisplay(value.vehicle_type, VEHICLE_TYPE_LABELS)} />
            <SummaryRow label="براند / کۆمپانیا" value={value.make.trim()} />
            <SummaryRow label="مۆدێل" value={value.model.trim()} />
            <SummaryRow label="تریم / مۆدێلی لاوەکی" value={value.trim.trim()} />
            <SummaryRow label="ساڵی دروستکردن" value={value.manufacturing_year === 'unknown' ? 'نازانراوە' : value.manufacturing_year || 'زانیاری تۆمار نەکراوە'} />
            <SummaryRow label="وەسفی فرۆشیار" value={<span className="whitespace-pre-wrap">{content.trim() || 'وەسف دانەنراوە.'}</span>} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
          <SectionHeading icon={Settings2} title="٢. زانیاریی تەکنیکی" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryRow label="ڕەنگی دەرەوە" value={value.exterior_color.trim()} />
            <SummaryRow label="ڕەنگی ناوەوە" value={value.interior_color.trim()} />
            <SummaryRow label="کیلۆمەتر" value={value.mileage_km === 'unknown' ? 'نازانراوە' : value.mileage_km ? Number(value.mileage_km).toLocaleString('en-US') + ' km' : undefined} />
            <SummaryRow label="سووتەمەنی" value={selectDisplay(value.fuel_type, VEHICLE_FUEL_LABELS)} />
            <SummaryRow label="جۆری گێڕ" value={selectDisplay(value.transmission, VEHICLE_TRANSMISSION_LABELS)} />
            <SummaryRow label="بزوێنەر (CC)" value={value.engine_cc === 'unknown' ? 'نازانراوە' : value.engine_cc ? Number(value.engine_cc).toLocaleString('en-US') + ' CC' : undefined} />
            <SummaryRow label="جۆری جەستە" value={selectDisplay(value.body_type, VEHICLE_BODY_LABELS)} />
            <SummaryRow label="سیستەمی ڕاکێشان" value={selectDisplay(value.drivetrain, VEHICLE_DRIVETRAIN_LABELS)} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
          <SectionHeading icon={ShieldCheck} title="٣. دۆخ و مێژووی ئۆتۆمبێل" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryRow label="دۆخی ئۆتۆمبێل" value={selectDisplay(value.vehicle_condition, VEHICLE_CONDITION_LABELS)} />
            <SummaryRow label="سەرچاوە" value={selectDisplay(value.origin, VEHICLE_ORIGIN_LABELS)} />
            <SummaryRow label="ژمارەی خاوەندارێتی" value={value.ownership_count === 'unknown' ? 'نازانراوە' : value.ownership_count || undefined} />
            <SummaryRow label="ڕووداوی پێشوو" value={selectDisplay(value.accident_history, VEHICLE_TRI_STATE_LABELS)} />
            <SummaryRow label="ڕەنگکراوە / پارچەی گۆڕدراو" value={selectDisplay(value.repainted_or_replaced_parts, VEHICLE_TRI_STATE_LABELS)} />
            <SummaryRow label="وردەکاریی ڕەنگکردن / گۆڕینی پارچە" value={value.repaint_replacement_details.trim()} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
          <SectionHeading icon={Wrench} title="٤. کێشە و سێرڤیس" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {issueOptions.map(([key, label]) => <SummaryRow key={key} label={'کێشەی ' + label} value={selectDisplay(value[key], VEHICLE_TRI_STATE_LABELS)} />)}
            <SummaryRow label="وەسفی کێشەکان" value={<span className="whitespace-pre-wrap">{value.known_problems.trim()}</span>} />
            <SummaryRow label="مێژووی چاککردنەوە و سێرڤیس" value={<span className="whitespace-pre-wrap">{value.service_history.trim()}</span>} />
            <SummaryRow label="ئامادەبوون بۆ فرۆشتن" value={selectDisplay(value.sale_readiness, VEHICLE_READINESS_LABELS)} />
            <SummaryRow label="بەڵگەنامە یاساییەکان" value={selectDisplay(value.legal_documents_status, VEHICLE_DOCUMENT_LABELS)} />
            <SummaryRow label="وردەکاریی بەڵگەنامەکان" value={value.legal_document_notes.trim()} />
            <SummaryRow label="تایبەتمەندییە هەڵبژێردراوەکان" value={selectedFeatureLabels.length ? selectedFeatureLabels.join('، ') : 'هیچ تایبەتمەندییەک تۆمار نەکراوە.'} />
          </div>
          {hasIssue ? <div className="rounded-xl bg-amber-500/10 p-3 text-sm leading-6 text-amber-800"><AlertTriangle size={16} className="me-1 inline" /> لانیکەم یەک کێشە وەڵامی «بەڵێ»ی وەرگرتووە؛ تکایە وەسفەکە بە وردی بخوێنەرەوە.</div> : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
          <SectionHeading icon={CircleDollarSign} title="٥. نرخ، شوێن و پەیوەندی" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryRow label="نرخ" value={value.price_amount ? Number(value.price_amount).toLocaleString('en-US') + ' ' + (value.currency || '') : undefined} />
            <SummaryRow label="داشکاندن" value={value.discount_percent !== '' ? value.discount_percent + '٪' : undefined} />
            <SummaryRow label="جێگۆڕکێی نرخ" value={selectDisplay(value.price_negotiable, { yes: 'بەڵێ', no: 'نەخێر' })} />
            <SummaryRow label="شوێن" value={value.location.trim()} />
            <SummaryRow label="ناوی پەیوەندی" value={value.contact_name.trim()} />
            <SummaryRow label="ژمارەی مۆبایل" value={value.contact_phone.trim()} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-black/[0.06] p-4">
          <SectionHeading icon={Camera} title="٦. وێنەکان" description="وێنەکان بە ڕیز و جۆری دیاریکراویان پیشان دەدرێن." />
          {images.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((file, index) => {
              const kind = imageKinds.get(file) ?? '';
              return <div key={file.name + file.size + file.lastModified + index} className="rounded-xl bg-white p-3">
                <div className="truncate text-xs font-black">وێنەی {index + 1}: {file.name}</div>
                <div className="mt-1 text-[11px] text-black/45">{kind ? VEHICLE_PHOTO_KIND_LABELS[kind] : 'جۆر دیاری نەکراوە'}</div>
              </div>;
            })}
          </div> : <p className="text-sm font-bold text-red-600">هیچ وێنەیەک دانەنراوە.</p>}
          <button type="button" onClick={onEdit} className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-black">گەڕانەوە بۆ دەستکاری</button>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-5" dir="rtl">
      <nav className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--shakh-bg)] p-3 sm:grid-cols-4 xl:grid-cols-7" aria-label="بەشەکانی فۆڕمی ئۆتۆمبێل">
        {sections.map(([number, label]) => <div key={number} className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-2 py-2 text-xs font-black"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]">{number}</span><span>{label}</span></div>)}
      </nav>

      <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
        <SectionHeading icon={CarFront} title="١. زانیاریی گشتی" description="تەنها زانیاریی ڕاستەقینەی ئۆتۆمبێلەکە بنووسە؛ خانەی نەزانراو بەتاڵ بهێڵە یان «نازانم» هەڵبژێرە." />
        <CarField label="ناونیشانی پۆست / ناوی ئۆتۆمبێل *">
          <input className={inputClass} value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={180} required placeholder="ناونیشان بنووسە" />
        </CarField>
        <div className="grid gap-4 sm:grid-cols-2">
          <CarField label="جۆری ئۆتۆمبێل *">
            <select className={inputClass} value={value.vehicle_type} onChange={(event) => update('vehicle_type', event.target.value)} required disabled={disabled}>
              <option value="">جۆر هەڵبژێرە</option>
              {Object.entries(VEHICLE_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </CarField>
          <CarField label="کۆمپانیا / براند *">
            <input className={inputClass} value={value.make} onChange={(event) => update('make', event.target.value)} maxLength={100} required disabled={disabled} placeholder="ناوی براند" />
          </CarField>
          <CarField label="مۆدێل *">
            <input className={inputClass} value={value.model} onChange={(event) => update('model', event.target.value)} maxLength={100} required disabled={disabled} placeholder="مۆدێل" />
          </CarField>
          <CarField label="تریم / مۆدێلی لاوەکی">
            <input className={inputClass} value={value.trim} onChange={(event) => update('trim', event.target.value)} maxLength={100} disabled={disabled} placeholder="ئارەزوومەندانە" />
          </CarField>
          <CarField label="ساڵی دروستکردن">
            <select className={inputClass} value={value.manufacturing_year} onChange={(event) => update('manufacturing_year', event.target.value)} disabled={disabled}>
              <option value="">هەڵبژاردن / زانیاری نییە</option>
              <option value="unknown">نازانم</option>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </CarField>
        </div>
        <CarField label="وەسفی پۆست">
          <textarea className={inputClass + ' min-h-24 resize-y'} value={content} onChange={(event) => onContentChange(event.target.value)} maxLength={12000} disabled={disabled} placeholder="تەنها وردەکاریی ڕاستەقینەی فرۆشیار بنووسە..." />
        </CarField>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
        <SectionHeading icon={Gauge} title="٢. زانیاریی تەکنیکی" description="ئەگەر زانیارییەک نازانیت، «نازانم» هەڵبژێرە یان زانیارییە هەڵنەزانراوەکان بەتاڵ بهێڵە." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CarField label="ڕەنگی دەرەوە"><input className={inputClass} value={value.exterior_color} onChange={(event) => update('exterior_color', event.target.value)} maxLength={60} disabled={disabled} placeholder="ڕەنگی ڕاستەقینە" /></CarField>
          <CarField label="ڕەنگی ناوەوە"><input className={inputClass} value={value.interior_color} onChange={(event) => update('interior_color', event.target.value)} maxLength={60} disabled={disabled} placeholder="ڕەنگی ڕاستەقینە" /></CarField>
          <OptionalNumberField label="کیلۆمەتر (km)" value={value.mileage_km} onChange={(next) => update('mileage_km', next)} min={0} max={2_000_000} disabled={disabled} />
          <CarField label="جۆری سووتەمەنی"><select className={inputClass} value={value.fuel_type} onChange={(event) => update('fuel_type', event.target.value)} disabled={disabled}><option value="">هەڵنەبژێردراو</option>{Object.entries(VEHICLE_FUEL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CarField>
          <CarField label="جۆری گێڕ"><select className={inputClass} value={value.transmission} onChange={(event) => update('transmission', event.target.value)} disabled={disabled}><option value="">هەڵنەبژێردراو</option>{Object.entries(VEHICLE_TRANSMISSION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CarField>
          <OptionalNumberField label="قەبارەی بزوێنەر (CC)" value={value.engine_cc} onChange={(next) => update('engine_cc', next)} min={0} max={20_000} disabled={disabled} />
          <CarField label="جۆری جەستە"><select className={inputClass} value={value.body_type} onChange={(event) => update('body_type', event.target.value)} disabled={disabled}><option value="">هەڵنەبژێردراو</option>{Object.entries(VEHICLE_BODY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CarField>
          <CarField label="جۆری ڕاکێشان"><select className={inputClass} value={value.drivetrain} onChange={(event) => update('drivetrain', event.target.value)} disabled={disabled}><option value="">هەڵنەبژێردراو</option>{Object.entries(VEHICLE_DRIVETRAIN_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CarField>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
        <SectionHeading icon={ShieldCheck} title="٣. دۆخی ئۆتۆمبێل" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CarField label="دۆخی ئۆتۆمبێل *"><select className={inputClass} value={value.vehicle_condition} onChange={(event) => update('vehicle_condition', event.target.value)} required disabled={disabled}><option value="">هەڵبژێرە</option><option value="new">نوێ</option><option value="used">بەکارهاتوو</option><option value="unknown">نازانم</option></select></CarField>
          <CarField label="ناوخۆیی یان هاوردەکراو *"><select className={inputClass} value={value.origin} onChange={(event) => update('origin', event.target.value)} required disabled={disabled}><option value="">هەڵبژێرە</option><option value="local">ناوخۆیی</option><option value="imported">هاوردەکراو</option><option value="unknown">نازانم</option></select></CarField>
          <OptionalNumberField label="ژمارەی خاوەندارێتی" value={value.ownership_count} onChange={(next) => update('ownership_count', next)} min={1} max={100} disabled={disabled} />
          <CarField label="ڕووداوی پێشوو *"><select className={inputClass} value={value.accident_history} onChange={(event) => update('accident_history', event.target.value)} required disabled={disabled}><option value="">هەڵبژێرە</option><option value="yes">بەڵێ</option><option value="no">نەخێر</option><option value="unknown">نازانم</option></select></CarField>
          <CarField label="ڕەنگکراوە یان پارچەی گۆڕدراوی هەیە؟ *"><select className={inputClass} value={value.repainted_or_replaced_parts} onChange={(event) => update('repainted_or_replaced_parts', event.target.value)} required disabled={disabled}><option value="">هەڵبژێرە</option><option value="yes">بەڵێ</option><option value="no">نەخێر</option><option value="unknown">نازانم</option></select></CarField>
        </div>
        {value.repainted_or_replaced_parts === 'yes' ? <CarField label="وردەکاریی ڕەنگکردن / پارچەی گۆڕدراو *"><textarea className={inputClass + ' min-h-20'} value={value.repaint_replacement_details} onChange={(event) => update('repaint_replacement_details', event.target.value)} maxLength={2000} required disabled={disabled} placeholder="کامیان و لە کوێ؟" /></CarField> : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
        <SectionHeading icon={Wrench} title="٤. کێشە، چاککردنەوە و تایبەتمەندییەکان" description="بۆ هەر خانەیەک دەتوانیت بەڵێ، نەخێر یان نازانم هەڵبژێریت. بەتاڵ بەجێهێشتن واتای پشتڕاستکردنەوەی نەبوونی کێشە نییە." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {issueOptions.map(([key, label]) => (
            <CarField key={key} label={'کێشەی ' + label}>
              <select className={inputClass} value={value[key]} onChange={(event) => update(key, event.target.value)} disabled={disabled}>
                <option value="">هەڵنەبژێردراو</option><option value="yes">بەڵێ</option><option value="no">نەخێر</option><option value="unknown">نازانم</option>
              </select>
            </CarField>
          ))}
        </div>
        <CarField label="وەسفی کێشەکان" hint="ئەگەر هەر کێشەیەک «بەڵێ» ـە، جۆر و وردەکارییەکانی بنووسە.">
          <textarea className={inputClass + ' min-h-24'} value={value.known_problems} onChange={(event) => update('known_problems', event.target.value)} maxLength={5000} disabled={disabled} placeholder="بزوێنەر، گێڕ، کارەبا، ڕەنگ، تایەر یان کێشەی تر..." />
        </CarField>
        <CarField label="مێژووی چاککردنەوە و سێرڤیس">
          <textarea className={inputClass + ' min-h-24'} value={value.service_history} onChange={(event) => update('service_history', event.target.value)} maxLength={5000} disabled={disabled} placeholder="ئەو سێرڤیس و چاککردنەوانە بنووسە کە پشتڕاستن." />
        </CarField>
        <div>
          <div className="mb-3 text-sm font-black">تایبەتمەندییەکان <span className="font-medium text-black/40">(تەنها ئەوانە هەڵبژێرە کە بە دڵنیایی هەن)</span></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {VEHICLE_FEATURE_OPTIONS.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm font-bold"><input type="checkbox" checked={value.features.includes(key)} disabled={disabled} onChange={(event) => update('features', event.target.checked ? [...value.features, key] : value.features.filter((feature) => feature !== key))} className="size-4 accent-[var(--shakh-orange)]" />{label}</label>)}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
        <SectionHeading icon={CircleDollarSign} title="٥. نرخ، شوێن و پەیوەندی" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CarField label="نرخ *"><input className={inputClass} type="number" min="0.01" step="any" inputMode="decimal" value={value.price_amount} onChange={(event) => update('price_amount', event.target.value)} required disabled={disabled} placeholder="نرخ بنووسە" /></CarField>
          <CarField label="دراو *"><select className={inputClass} value={value.currency} onChange={(event) => update('currency', event.target.value)} required disabled={disabled}><option value="">دراو هەڵبژێرە</option><option value="IQD">دیناری عێراقی (IQD)</option><option value="USD">دۆلاری ئەمریکی (USD)</option></select></CarField>
          <CarField label="داشکاندن (%) *"><select className={inputClass} value={value.discount_percent} onChange={(event) => update('discount_percent', event.target.value)} required disabled={disabled}><option value="">داشکاندن هەڵبژێرە</option>{Array.from({ length: 100 }, (_, index) => String(index)).map((percent) => <option key={percent} value={percent}>{percent}٪</option>)}</select></CarField>
          <CarField label="ئایا نرخ جێگۆڕکێی تێدایە؟ *"><select className={inputClass} value={value.price_negotiable} onChange={(event) => update('price_negotiable', event.target.value)} required disabled={disabled}><option value="">وەڵام هەڵبژێرە</option><option value="yes">بەڵێ</option><option value="no">نەخێر</option></select></CarField>
          <CarField label="شوێنی ئۆتۆمبێل *"><input className={inputClass} value={value.location} onChange={(event) => update('location', event.target.value)} required maxLength={180} disabled={disabled} placeholder="شار و ناوچە" /></CarField>
          <CarField label="ئاستی ئامادەبوون بۆ فرۆشتن *"><select className={inputClass} value={value.sale_readiness} onChange={(event) => update('sale_readiness', event.target.value)} required disabled={disabled}><option value="">هەڵبژێرە</option><option value="ready">ئامادەی فرۆشتنە</option><option value="not_ready">هێشتا ئامادە نییە</option><option value="unknown">نازانم</option></select></CarField>
          <CarField label="بەڵگەنامە یاساییەکان *"><select className={inputClass} value={value.legal_documents_status} onChange={(event) => update('legal_documents_status', event.target.value)} required disabled={disabled}><option value="">هەڵبژێرە</option><option value="available">بەردەستن</option><option value="missing">نییە / ناتەواون</option><option value="unknown">نازانم</option></select></CarField>
          <CarField label="ناوی پەیوەندی (ئارەزوومەندانە)"><input className={inputClass} value={value.contact_name} onChange={(event) => update('contact_name', event.target.value)} maxLength={100} disabled={disabled} placeholder="ناوی پەیوەندی" /></CarField>
          <CarField label="ژمارەی مۆبایل بۆ پەیوەندی *"><input className={inputClass} type="tel" inputMode="tel" dir="ltr" value={value.contact_phone} onChange={(event) => update('contact_phone', event.target.value)} minLength={6} maxLength={40} required disabled={disabled} placeholder="+964..." /></CarField>
        </div>
        <CarField label="وردەکاریی بەڵگەنامە یاساییەکان">
          <textarea className={inputClass + ' min-h-20'} value={value.legal_document_notes} onChange={(event) => update('legal_document_notes', event.target.value)} maxLength={2000} disabled={disabled} placeholder="ئەگەر وردەکارییەکی پێویست هەیە بنووسە." />
        </CarField>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
        <SectionHeading icon={Camera} title="٦. وێنەکان" description="لانیکەم یەک وێنە پێویستە. دەتوانیت وێنەی پێشەوە، پاشەوە، ناوەوە، داشبۆرد و بزوێنەر زیاد بکەیت." />
        <ImageUploadField
          files={images}
          onChange={onImagesChange}
          maxFiles={MAX_POST_IMAGES}
          disabled={disabled}
          required
          label="وێنەی ئۆتۆمبێل"
          hint="وێنەی ڕاستەقینەی JPG، PNG یان WebP؛ هەر وێنەیەک تا 5MB، زۆرترین 8 وێنە."
        />
        {images.length ? <div className="space-y-2">
          {images.map((file, index) => <div key={file.name + file.size + file.lastModified + index} className="grid gap-2 rounded-xl border border-black/[0.06] bg-[var(--shakh-bg)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.65fr)] sm:items-center">
            <div className="min-w-0"><div className="truncate text-sm font-black">وێنەی {index + 1}: {file.name}</div><div className="mt-1 text-[11px] text-black/40">{(file.size / 1024).toFixed(0)} KB</div></div>
            <label className="text-xs font-black">جۆری وێنە<select className={inputClass + ' mt-1'} value={imageKinds.get(file) ?? ''} onChange={(event) => onPhotoKindChange(file, event.target.value as VehiclePhotoKind)} disabled={disabled}><option value="">جۆر دیاری نەکراوە</option>{photoKindOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>)}
        </div> : null}
      </section>
    </section>
  );
}
