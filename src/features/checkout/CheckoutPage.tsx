import { ArrowLeft, Banknote, LocateFixed, MapPin, Navigation, Smartphone, ShoppingBag, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCart } from '@/features/marketplace/api';
import type { CartItem } from '@/features/marketplace/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { getMyProfilePhone, updateMyPhone, validatePhone } from '@/lib/auth/auth';
import { createCheckout } from './api';
import { buildGoogleMapsLocationUrl } from '@/lib/maps/navigation';
import type { PaymentMethod } from './types';
import { isRestaurantMenuAvailable } from '@/lib/catalog/restaurant';
import { isSupermarketItemExpired } from '@/lib/catalog/supermarket';

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(0);

  useEffect(() => {
    if (!user) return;
    void Promise.all([
      getCart(user.id),
      getMyProfilePhone(),
      supabase.from('referral_wallets').select('available_iqd').eq('user_id', user.id).maybeSingle(),
    ])
      .then(([cart, profilePhone, walletResult]) => {
        if (walletResult.error) throw walletResult.error;
        setItems(cart.items);
        setPhone(profilePhone);
        setWalletAvailable(Number(walletResult.data?.available_iqd ?? 0));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'نەتوانرا زانیاری checkout بخوێندرێتەوە.'))
      .finally(() => {
        setLoading(false);
        setLoadingProfile(false);
      });
  }, [user]);

  const currentUnitPrice = (item: CartItem) => {
    if (item.product?.restaurantMenu) {
      return (item.variant?.price_iqd ?? item.product.base_price_iqd)
        + item.selectedOptions.reduce((sum, option) => sum + Number(option.price_iqd), 0);
    }
    return item.variant?.price_iqd ?? item.product?.base_price_iqd ?? item.added_price_iqd;
  };
  const isExpired = (item: CartItem) => isSupermarketItemExpired(item.product?.expiry_date) || isSupermarketItemExpired(item.variant?.expiry_date);
  const isRestaurantAvailable = (item: CartItem) => {
    const menu = item.product?.restaurantMenu;
    return !menu || isRestaurantMenuAvailable(menu.is_available, menu.available_from, menu.available_until);
  };
  const isUnavailable = (item: CartItem) => {
    if (!item.product) return true;
    if (item.product.restaurantMenu) return !isRestaurantAvailable(item) || item.hasUnavailableOptions || Boolean(item.variant && !item.variant.is_active);
    const stock = item.variant?.stock_quantity ?? item.product.stock_quantity;
    return isExpired(item) || stock <= 0 || item.quantity > stock || Boolean(item.variant && !item.variant.is_active);
  };
  const unavailableItems = items.filter(isUnavailable);
  const hasUnavailableItems = unavailableItems.length > 0;
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + currentUnitPrice(item) * item.quantity, 0), [items]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!address.trim()) {
      setError('ناونیشانی گەیاندن پێویستە.');
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    if (hasUnavailableItems) {
      setError('هەندێک خواردن بەردەست نییە یان زیادکراوەیەک گۆڕاوە. تکایە سەبەتە نوێ بکەرەوە و پێش checkout هەڵبژاردەکان چاک بکە.');
      return;
    }
    setSubmitting(true);
    try {
      await updateMyPhone(phone);
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
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm font-black">ژمارەی مۆبایل <span className="text-red-500">*</span></span>
                  <input
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--shakh-blue)]"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+9647501234567"
                    dir="ltr"
                    disabled={loadingProfile}
                  />
                </label>
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

              {hasUnavailableItems ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">هەندێک بەرهەم لەم سەبەتەدا ئێستا بەردەست نییە یان زیادکراوەیەک ناچالاک کراوە. <Link className="underline underline-offset-4" to="/cart">بگەڕێوە بۆ سەبەتە</Link> و هەڵبژاردەکان چاک بکە.</div> : null}
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
                  <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${paymentMethod === 'wallet' ? 'border-emerald-600/20 bg-emerald-500/[0.04]' : 'border-black/10'}`}>
                    <input type="radio" name="payment" value="wallet" checked={paymentMethod === 'wallet'} disabled={walletAvailable <= 0} onChange={() => setPaymentMethod('wallet')} />
                    <WalletCards size={20} className="text-emerald-700" /><span className="min-w-0 flex-1"><span className="block text-sm font-black">باڵانسی خەڵاتی شاخ</span><span className="mt-1 block text-xs text-black/45">بەردەست: {walletAvailable.toLocaleString('en-US')} د.ع</span></span>
                  </label>
                  {paymentMethod === 'wallet' ? <p className="text-xs leading-5 text-black/45">کۆی پارە لە server لەگەڵ کرێی گەیاندن و پلاتفۆرم هەژمار دەکرێت؛ ئەگەر باڵانس کەم بێت، داواکاری بە پارەدان تۆمار نابێت.</p> : null}
                </div>
              </div>

              {error ? <div role="alert" className="rounded-2xl bg-red-500/[0.08] px-4 py-3 text-sm font-bold leading-6 text-red-700">{error}</div> : null}
            </div>

            <aside className="h-fit rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] lg:sticky lg:top-24">
              <h2 className="text-lg font-black">کورتەی داواکاری</h2>
              <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="rounded-2xl bg-[var(--shakh-bg)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-black">{item.product?.name_ku ?? 'بەرهەم'}</div>{item.variant ? <div className="mt-1 text-xs font-bold text-black/45">{item.variant.name_ku}</div> : null}<div className="mt-1 text-xs text-black/45">{item.quantity} × {currentUnitPrice(item).toLocaleString('en-US')} د.ع</div></div><div className="shrink-0 text-sm font-black">{(currentUnitPrice(item) * item.quantity).toLocaleString('en-US')} د.ع</div></div>{item.selectedOptions.length ? <div className="mt-2 space-y-1 border-t border-black/[0.06] pt-2">{item.selectedOptions.map((option) => <div key={option.id} className="flex flex-wrap justify-between gap-2 text-[11px] text-black/50"><span>{option.group_name_ku}: {option.name_ku}</span><span>{Number(option.price_iqd) > 0 ? '+' + Number(option.price_iqd).toLocaleString('en-US') + ' د.ع' : 'بەخۆڕایی'}</span></div>)}</div> : null}{item.product?.restaurantMenu ? <div className={`mt-2 text-[11px] font-bold ${isRestaurantAvailable(item) && !item.hasUnavailableOptions ? 'text-emerald-700' : 'text-red-600'}`}>{!isRestaurantAvailable(item) ? 'لە ئێستادا بەردەست نییە' : item.hasUnavailableOptions ? 'زیادکراوەیەک ناچالاکە' : 'بەردەستە بۆ داواکردن'}</div> : null}</div>)}</div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-black/45">ژمارەی دانە</span><span className="font-black">{items.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
                <div className="flex justify-between"><span className="text-black/45">کۆی بەرهەمەکان</span><span className="font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>
                <div className="flex justify-between"><span className="text-black/45">گەیاندن</span><span className="font-bold text-black/45">لە ئێستادا هەژمار نەکراوە</span></div>
                <div className="border-t border-black/[0.06] pt-4 flex justify-between"><span className="font-black">کۆی کاتی</span><span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>
              </div>
              <button disabled={submitting || loadingProfile || hasUnavailableItems} className="mt-5 w-full rounded-2xl bg-[var(--shakh-navy)] px-5 py-4 text-sm font-black text-white disabled:opacity-50">{submitting ? 'جێبەجێکردن...' : 'داواکاری تۆمار بکە'}</button>
              <p className="mt-3 text-xs leading-5 text-black/35">نرخ و stock لە server پشتڕاست کراوەتەوە. دووبارە ناردن بە idempotency پارێزراوە.</p>
            </aside>
          </form>
        )}
      </div>
    </section>
  );
}
