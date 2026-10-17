import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import type { DeliveryCoordinates } from './BuyerDeliveryLocationField';

type Props = {
  radiusKm: number;
  onRadiusChange: (radiusKm: number) => void;
  coordinates: DeliveryCoordinates | null;
  onCoordinatesChange: (coordinates: DeliveryCoordinates | null) => void;
  disabled?: boolean;
};

export function DeliveryZoneFields({ radiusKm, onRadiusChange, coordinates, onCoordinatesChange, disabled = false }: Props) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) {
      setError('ئەم وێبگەڕە GPS پشتیوانی ناکات.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onCoordinatesChange({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setError('نەتوانرا GPS وەربگیرێت. مۆڵەتی شوێن لە وێبگەڕەکەت چالاک بکە و دووبارە هەوڵ بدەوە.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  return (
    <section className="space-y-4 rounded-[24px] border border-[var(--shakh-blue)]/20 bg-[var(--shakh-blue)]/[0.035] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><MapPin size={20} /></div>
        <div>
          <h2 className="text-lg font-black">زۆنی گەیاندنی ئەم پۆستە</h2>
          <p className="mt-1 text-sm leading-6 text-black/55">شوێنی فرۆشگا یان شوێنی ئامادەکردنی داواکاری بە GPS دیاری بکە. ئۆردەرەکان تەنها لە ناو ئەم مەودایەدا قبوڵ دەکرێن.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3">
        <div>
          <div className="text-xs font-bold text-black/45">مەودای گەیاندن</div>
          <div className="mt-1 text-2xl font-black text-[var(--shakh-navy)]" aria-live="polite">{radiusKm} <span className="text-sm">کم</span></div>
          <p className="mt-1 text-xs text-black/40">{radiusKm === 5 ? 'مەودای بنەڕەتیی خواردن' : radiusKm === 15 ? 'مەودای بنەڕەتیی مارکێت' : 'مەودای دیاریکراوی خۆت'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="کەمکردنەوەی مەودای گەیاندن" disabled={disabled || radiusKm <= 1} onClick={() => onRadiusChange(Math.max(1, radiusKm - 1))} className="grid size-11 place-items-center rounded-xl border border-black/10 bg-white disabled:opacity-30"><Minus size={17} /></button>
          <button type="button" aria-label="زیادکردنی مەودای گەیاندن" disabled={disabled || radiusKm >= 100} onClick={() => onRadiusChange(Math.min(100, radiusKm + 1))} className="grid size-11 place-items-center rounded-xl border border-black/10 bg-white disabled:opacity-30"><Plus size={17} /></button>
        </div>
      </div>
      <p className="text-xs leading-5 text-black/45">خواردن بە بنەڕەت ٥ کم و مارکێت ١٥ کمە؛ بۆ هەموو پۆستەکانی تر دەتوانیت مەوداکە بە + و − بگۆڕیت. مەودا لە ١ تا ١٠٠ کم دەبێت.</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white p-3">
        <div className="min-w-0">
          <div className="text-sm font-black">شوێنی بڵاوکەرەوە</div>
          {coordinates ? <div className="mt-1 text-xs font-bold text-emerald-700">GPS تۆمارکرا · {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</div> : <div className="mt-1 text-xs font-bold text-amber-700">شوێن دیاری نەکراوە</div>}
        </div>
        <button type="button" disabled={disabled || locating} onClick={locate} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
          <LocateFixed size={15} />{locating ? 'دۆزینەوە...' : coordinates ? 'نوێکردنەوەی شوێن' : 'وەرگرتنی شوێنی GPS'}
        </button>
      </div>
      {error ? <p role="alert" className="text-xs font-bold text-red-600">{error}</p> : null}
    </section>
  );
}
