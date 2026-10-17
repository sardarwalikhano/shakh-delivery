import { LocateFixed, MapPin } from 'lucide-react';
import { useState } from 'react';

export type DeliveryCoordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  coordinates: DeliveryCoordinates | null;
  onChange: (coordinates: DeliveryCoordinates | null) => void;
  disabled?: boolean;
};

export function BuyerDeliveryLocationField({ coordinates, onChange, disabled = false }: Props) {
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
        onChange({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setError('نەتوانرا شوێنی GPS وەربگیرێت. مۆڵەتی شوێن لە وێبگەڕەکەت چالاک بکە و دووبارە هەوڵ بدەوە.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  return (
    <section className="rounded-2xl border border-[var(--shakh-blue)]/15 bg-[var(--shakh-blue)]/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin size={18} className="mt-0.5 shrink-0 text-[var(--shakh-blue)]" />
          <div>
            <h3 className="text-sm font-black">شوێنی گەیاندن (GPS)</h3>
            <p className="mt-1 text-xs leading-5 text-black/50">بۆ پشکنینی زۆنی گەیاندن پێویستە. شوێنەکەت وەک زانیاریی ئۆردەر پاشەکەوت ناکرێت.</p>
          </div>
        </div>
        <button type="button" disabled={disabled || locating} onClick={locate} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
          <LocateFixed size={15} />{locating ? 'دۆزینەوە...' : coordinates ? 'نوێکردنەوەی GPS' : 'شوێنی ئێستام وەربگرە'}
        </button>
      </div>
      {coordinates ? <p className="mt-2 text-xs font-bold text-emerald-700">شوێن دیاریکرا · {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</p> : <p className="mt-2 text-xs font-bold text-amber-700">پێش تۆمارکردنی ئۆردەر شوێنی خۆت دیاری بکە.</p>}
      {error ? <p role="alert" className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
    </section>
  );
}
