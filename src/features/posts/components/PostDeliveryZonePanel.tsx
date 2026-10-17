import { Check, LoaderCircle, LocateFixed, Minus, Plus, Save, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/supabase/client';
import type { Post } from '../types';
import { DeliveryPointPicker } from './DeliveryPointPicker';
import type { DeliveryPoint } from '../deliveryZones';

type Props = {
  post: Post;
  canEdit: boolean;
  onSaved: (post: Post) => void;
};

export function PostDeliveryZonePanel({ post, canEdit, onSaved }: Props) {
  const { user } = useAuth();
  const defaultRadius = post.category === 'food' ? 5 : 15;
  const [point, setPoint] = useState<DeliveryPoint | null>(() =>
    post.delivery_latitude != null && post.delivery_longitude != null
      ? { latitude: Number(post.delivery_latitude), longitude: Number(post.delivery_longitude) }
      : null
  );
  const [radiusKm, setRadiusKm] = useState(() =>
    post.delivery_latitude != null && post.delivery_longitude != null
      ? Number(post.delivery_radius_km || defaultRadius)
      : defaultRadius
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPoint(post.delivery_latitude != null && post.delivery_longitude != null
      ? { latitude: Number(post.delivery_latitude), longitude: Number(post.delivery_longitude) }
      : null);
    setRadiusKm(post.delivery_latitude != null && post.delivery_longitude != null
      ? Number(post.delivery_radius_km || defaultRadius)
      : defaultRadius);
  }, [post.id, post.delivery_latitude, post.delivery_longitude, post.delivery_radius_km, defaultRadius]);

  const save = async () => {
    if (!user) { setError('پێویستە سەرەتا بچیتە ژوورەوە.'); return; }
    if (!canEdit) return;
    if (!point) { setError('شوێنی GPS دیاری بکە.'); return; }
    if (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > 100) {
      setError('مەودای گەیاندن دەبێت لە ١ تا ١٠٠ کیلۆمەتر بێت.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.rpc('set_post_delivery_zone', {
        p_post_id: post.id,
        p_latitude: point.latitude,
        p_longitude: point.longitude,
        p_radius_km: radiusKm,
      });
      if (updateError) throw updateError;
      onSaved({
        ...post,
        delivery_latitude: point.latitude,
        delivery_longitude: point.longitude,
        delivery_radius_km: radiusKm,
      });
      setMessage('زۆنی گەیاندن پاشەکەوت کرا.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی زۆنی گەیاندن سەرکەوتوو نەبوو.');
    } finally {
      setSaving(false);
    }
  };

  const hasZone = post.delivery_latitude != null && post.delivery_longitude != null;

  return (
    <section className="mt-4 rounded-2xl border border-[var(--shakh-blue)]/15 bg-white p-4 sm:p-5" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><Truck size={19}/></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-black">زۆنی گەیاندن</h2>
          {hasZone ? (
            <p className="mt-1 text-sm leading-6 text-black/55">ئەم پۆستە تا {Number(post.delivery_radius_km).toLocaleString('en-US')} کیلۆمەتر لە ناوەندی شوێنی دیاریکراو دەگەیەنرێت.</p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-amber-700">زۆنی گەیاندنی ئەم پۆستە هێشتا دیاری نەکراوە؛ تا ڕێکخستنی GPS و مەودا، داواکاری بۆ ئەم پۆستە وەرناگیرێت.</p>
          )}
        </div>
      </div>
      {canEdit ? (
        <div className="mt-4 space-y-4">
          <DeliveryPointPicker value={point} onChange={(nextPoint) => { setPoint(nextPoint); setMessage(null); }} title="شوێنی بنەڕەتی گەیاندن" description="بۆ پۆستی خواردن بە ناوەندی چێشتخانە، و بۆ بەرهەمەکان بە شوێنی فرۆشیار GPS وەربگرە." />
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3">
            <div><div className="text-sm font-black">مەودا</div><div className="mt-1 text-xs text-black/45">١ تا ١٠٠ کیلۆمەتر</div></div>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="کەمکردنەوەی مەودا" disabled={saving || radiusKm <= 1} onClick={() => { setRadiusKm((v) => Math.max(1, v - 1)); setMessage(null); }} className="grid size-10 place-items-center rounded-xl border border-black/10 bg-white disabled:opacity-30"><Minus size={16}/></button>
              <span className="min-w-16 text-center text-lg font-black tabular-nums">{radiusKm} کم</span>
              <button type="button" aria-label="زیادکردنی مەودا" disabled={saving || radiusKm >= 100} onClick={() => { setRadiusKm((v) => Math.min(100, v + 1)); setMessage(null); }} className="grid size-10 place-items-center rounded-xl border border-black/10 bg-white disabled:opacity-30"><Plus size={16}/></button>
            </div>
          </div>
          {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm font-bold leading-6 text-red-700">{error}</p> : null}
          {message ? <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><Check size={16}/>{message}</p> : null}
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            {saving ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>} پاشەکەوتکردنی زۆن
          </button>
        </div>
      ) : null}
    </section>
  );
}
