import { LocateFixed, MapPin } from 'lucide-react';
import { useState } from 'react';
import type { DeliveryPoint } from '../deliveryZones';

type Props = {
  value: DeliveryPoint | null;
  onChange: (point: DeliveryPoint) => void;
  title: string;
  description?: string;
};

export function DeliveryPointPicker({ value, onChange, title, description }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) {
      setError('ئەم browser ـە GPS پشتیوانی ناکات.');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ latitude: coords.latitude, longitude: coords.longitude });
        setBusy(false);
      },
      (gpsError) => {
        setError(gpsError.code === gpsError.PERMISSION_DENIED
          ? 'مۆڵەتی شوێن پێویستە؛ ڕێگە بە GPS بدە و دووبارە هەوڵ بدەوە.'
          : 'شوێنی GPS نەدۆزرایەوە. تکایە GPS چالاک بکە و دووبارە هەوڵ بدەوە.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--shakh-blue)]/15 bg-white p-4">
      <div className="flex items-start gap-2">
        <MapPin size={18} className="mt-0.5 shrink-0 text-[var(--shakh-blue)]" />
        <div>
          <div className="text-sm font-black">{title}</div>
          {description ? <p className="mt-1 text-xs leading-5 text-black/50">{description}</p> : null}
        </div>
      </div>
      {value ? (
        <div role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-800">
          شوێنەکە دیاریکرا: {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
        </div>
      ) : (
        <p className="text-xs leading-5 text-amber-700">بێ شوێنی GPS، مەودای گەیاندن ناتوانرێت پشتڕاست بکرێتەوە.</p>
      )}
      <button type="button" onClick={locate} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-[var(--shakh-bg)] px-4 py-2.5 text-xs font-black disabled:opacity-50">
        <LocateFixed size={16} /> {busy ? 'دۆزینەوەی شوێن...' : value ? 'نوێکردنەوەی شوێن' : 'وەرگرتنی شوێنی GPS'}
      </button>
      {error ? <p role="alert" className="text-xs font-bold leading-5 text-red-600">{error}</p> : null}
    </section>
  );
}
