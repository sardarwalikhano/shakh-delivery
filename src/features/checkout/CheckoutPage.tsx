import { ArrowLeft, Banknote, LocateFixed, MapPin, Navigation, Smartphone, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCart } from '@/features/marketplace/api';
import type { CartItem } from '@/features/marketplace/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { createCheckout } from './api';
import { buildGoogleMapsLocationUrl } from '@/lib/maps/navigation';
import type { PaymentMethod } from './types';

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void getCart(user.id)
      .then(({ items: nextItems }) => setItems(nextItems))
      .catch((err) => setError(err instanceof Error ? err.message : 'نەتوانرا سەبەتە بخوێندرێتەوە.'))
      .finally(() => setLoading(false));
  }, [user]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.added_price_iqd * item.quantity, 0), [items]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!address.trim()) {
      setError('ناونیشانی گەیاندن پێویستە.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createCheckout({ deliveryAddress: address, deliveryLat: coordinates?.latitude ?? null, deliveryLng: coordinates?.longitude ?? null, customerNote: note, paymentMethod });
      navigate(`/orders?checkout=${result.checkout_id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout سەرنەکەوت.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Link to="/cart" className="inline-flex items-center gap-2 text-sm font-black text-black/45 hover:text-black">
          <ArrowLeft size={17} /> گەڕانەوە بۆ سەبەتە
        </Link>
        <div className="mt-5 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><ShoppingBag size={20} /></div>
          <div><div className="text-xs font-black text-[var(--shakh-blue)]">Checkout</div><h1 className="text-3xl font-black">تەواوکردنی داواکاری</h1></div>
        </div>

        {loading ? <div className="mt-6 rounded-[28px] bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : items.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-dashed border-black/10 bg-white p-14 text-center">
            <h2 className="text-xl font-black">سەبەتەکەت بەتاڵە</h2>
            <Link to="/search" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕان لە بازاڕ</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <div className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] sm:p-6">
                <div className="flex items-center gap-3"><MapPin size={19} className="text-[var(--shakh-blue)]" /><h2 className="text-lg font-black">ناونیشانی گەیاندن</h2></div>
                <textarea value={address} onChange={(event) => setAddress(event.target.value)} className="mt-4 min-h-28 w-full resize-y rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="شار، گەڕەک، شەقام، ژمارەی خانوو..." required />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={locating} onClick={() => {
                    if (!navigator.geolocation) { setError('ئەم browser ـە GPS پشتیوانی ناکات.'); return; }
                    setLocating(true); setError(null);
                    navigator.geolocation.getCurrentPosition(
                      ({ coords }) => { setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }); setLocating(false); },
                      (gpsError) => { setError(`GPS بەردەست نییە: ${gpsError.message}`); setLocating(false); },
                      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
                    );
                  }} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-xs font-black disabled:opacity-50">
                    <LocateFixed size={16} /> {locating ? 'دۆزینەوەی شوێن...' : 'شوێنی ئێستام وەربگرە'}
                  </button>
                  {coordinates ? <><span className="rounded-2xl bg-emerald-500/8 px-3 py-2 text-xs font-bold text-emerald-700">GPS تۆمارکرا</span><a href={buildGoogleMapsLocationUrl(coordinates)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-2xl px-3 text-xs font-black text-[var(--shakh-blue)]"><Navigation size={15} /> پیشاندانی شوێن</a></> : null}
                </div>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-3 min-h-20 w-full resize-y rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="تێبینی بۆ سەلماندنی داواکاری (ئارەزوومەندانە)" />
              </div>

              <div className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] sm:p-6">
                <h2 className="text-lg font-black">شێوازی پارەدان</h2>
                <div className="mt-4 grid gap-3">
                  <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${paymentMethod === 'cash_on_delivery' ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/[0.05]' : 'border-black/10'}`}>
                    <input type="radio" name="payment" value="cash_on_delivery" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} />
                    <Banknote size={20} className="text-[var(--shakh-orange)]" /><span><span className="block text-sm font-black">پارە لە کاتی گەیاندن</span><span className="mt-1 block text-xs text-black/45">پارەدان دوای گەیشتنی captain</span></span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${paymentMethod === 'mobile_cash' ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/[0.05]' : 'border-black/10'}`}>
                    <input type="radio" name="payment" value="mobile_cash" checked={paymentMethod === 'mobile_cash'} onChange={() => setPaymentMethod('mobile_cash')} />
                    <Smartphone size={20} className="text-[var(--shakh-blue)]" /><span><span className="block text-sm font-black">Mobile Cash</span><span className="mt-1 block text-xs text-black/45">لە ئێستادا pending ـە تا provider بەسترێت</span></span>
                  </label>
                </div>
              </div>

              {error ? <div role="alert" className="rounded-2xl bg-red-500/[0.08] px-4 py-3 text-sm font-bold leading-6 text-red-700">{error}</div> : null}
            </div>

            <aside className="h-fit rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] lg:sticky lg:top-24">
              <h2 className="text-lg font-black">کورتەی داواکاری</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-black/45">ژمارەی دانە</span><span className="font-black">{items.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
                <div className="flex justify-between"><span className="text-black/45">کۆی بەرهەمەکان</span><span className="font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>
                <div className="flex justify-between"><span className="text-black/45">گەیاندن</span><span className="font-bold text-black/45">لە ئێستادا هەژمار نەکراوە</span></div>
                <div className="border-t border-black/[0.06] pt-4 flex justify-between"><span className="font-black">کۆی کاتی</span><span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>
              </div>
              <button disabled={submitting} className="mt-5 w-full rounded-2xl bg-[var(--shakh-navy)] px-5 py-4 text-sm font-black text-white disabled:opacity-50">{submitting ? 'جێبەجێکردن...' : 'داواکاری تۆمار بکە'}</button>
              <p className="mt-3 text-xs leading-5 text-black/35">نرخ و stock لە server پشتڕاست کراوەتەوە. دووبارە ناردن بە idempotency پارێزراوە.</p>
            </aside>
          </form>
        )}
      </div>
    </section>
  );
}
