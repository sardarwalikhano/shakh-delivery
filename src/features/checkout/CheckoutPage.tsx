import { ArrowLeft, Banknote, LocateFixed, MapPin, Navigation, Smartphone, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCart } from '@/features/marketplace/api';
import type { CartItem } from '@/features/marketplace/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { getMyProfilePhone, updateMyPhone, validatePhone } from '@/lib/auth/auth';
import { createCheckout } from './api';
import { buildGoogleMapsLocationUrl } from '@/lib/maps/navigation';
import type { PaymentMethod } from './types';
import { isRestaurantMenuAvailable } from '@/lib/catalog/restaurant';
import { isSupermarketItemExpired } from '@/lib/catalog/supermarket';
import { calculatePlatformFee, getDeliveryFeeQuote, type DeliveryFeeQuote } from './deliveryPricing';

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [feeConfig, setFeeConfig] = useState<DeliveryFeeQuote | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void Promise.all([getCart(user.id), getMyProfilePhone()])
      .then(([cart, profilePhone]) => {
        setItems(cart.items);
        setPhone(profilePhone);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'نەتوانرا زانیاری checkout بخوێندرێتەوە.'))
      .finally(() => {
        setLoading(false);
        setLoadingProfile(false);
      });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const city = deliveryCity.trim();
    if (city.length < 2) {
      setFeeConfig(null);
      setFeeError(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      void getDeliveryFeeQuote(city)
        .then((quote) => { if (!cancelled) { setFeeConfig(quote); setFeeError(null); } })
        .catch((nextError) => { if (!cancelled) { setFeeConfig(null); setFeeError(nextError instanceof Error ? nextError.message : 'نرخی گەیاندن نەدۆزرایەوە.'); } });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [deliveryCity]);

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

  const feeGroups = useMemo(() => {
    const groups = new Map<string, { subtotal: number; deliveryEligible: boolean }>();
    for (const item of items) {
      if (!item.product) continue;
      const storeId = item.product.store_id;
      const categorySlug = (item.product.category?.slug ?? '').toLocaleLowerCase();
      const deliveryEligible = categorySlug !== 'cars' && categorySlug !== 'umrah';
      const group = groups.get(storeId) ?? { subtotal: 0, deliveryEligible: false };
      group.subtotal += currentUnitPrice(item) * item.quantity;
      group.deliveryEligible = group.deliveryEligible || deliveryEligible;
      groups.set(storeId, group);
    }
    return [...groups.values()];
  }, [items]);

  const deliveryFeeTotal = feeConfig
    ? feeGroups.reduce((sum, group) => sum + (group.deliveryEligible ? feeConfig.delivery_fee_iqd : 0), 0)
    : 0;
  const platformFeeTotal = feeConfig
    ? feeGroups.reduce((sum, group) => sum + calculatePlatformFee(group.subtotal, feeConfig.platform_fee_percent), 0)
    : 0;
  const quotedTotal = subtotal + deliveryFeeTotal + platformFeeTotal;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!deliveryCity.trim()) {
      setError('شارەکەت دیاری بکە بۆ هەژمارکردنی نرخی گەیاندن.');
      return;
    }
    if (!address.trim()) {
      setError('ناونیشانی گەیاندن پێویستە.');
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    if (!feeConfig) {
      setError(feeError ?? 'تکایە چاوەڕێی هەژمارکردنی نرخی گەیاندن بکە.');
      return;
    }
    if (hasUnavailableItems) {
      setError('هەندێک خواردن بەردەست نییە یان زیادکراوەیەک گۆڕاوە. تکایە سەبەتە نوێ بکەرەوە و پێش checkout هەڵبژاردەکان چاک بکە.');
      return;
    }
    setSubmitting(true);
    try {
      await updateMyPhone(phone);
      const result = await createCheckout({ deliveryAddress: address, deliveryCity: deliveryCity.trim(), deliveryLat: coordinates?.latitude ?? null, deliveryLng: coordinates?.longitude ?? null, customerNote: note, paymentMethod });
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
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm font-black">شار / ناوچە *</span>
                  <input list="shakh-delivery-cities" value={deliveryCity} onChange={(event) => { setDeliveryCity(event.target.value); setFeeError(null); }} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="بەردەڕەش، هەولێر، دهۆک..." maxLength={100} autoComplete="address-level2" required />
                  <datalist id="shakh-delivery-cities">
                    <option value="بەردەڕەش" /><option value="هەولێر" /><option value="دهۆک" /><option value="سلێمانی" /><option value="کەرکووک" /><option value="زاخۆ" /><option value="مووسڵ" /><option value="بەغدا" />
                  </datalist>
                  <span className="mt-1 block text-xs font-medium text-black/40">نرخ بەپێی شار هەژمار دەکرێت؛ بۆ شارێکی نوێ نرخی بنەڕەتی بەکار دێت.</span>
                  {feeError ? <span role="alert" className="mt-1 block text-xs font-bold text-red-600">{feeError}</span> : null}
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
                <div className="flex justify-between"><span className="text-black/45">گەیاندن ({feeGroups.filter((group) => group.deliveryEligible).length} وەسلە)</span><span className="font-bold">{feeConfig ? deliveryFeeTotal.toLocaleString('en-US') + ' د.ع' : 'شار دیاری بکە'}</span></div>
                <div className="flex justify-between"><span className="text-black/45">کرێی پلاتفۆرمی شاخ ({feeConfig?.platform_fee_percent ?? 0}٪)</span><span className="font-bold">{feeConfig ? platformFeeTotal.toLocaleString('en-US') + ' د.ع' : '—'}</span></div>
                <div className="border-t border-black/[0.06] pt-4 flex justify-between"><span className="font-black">کۆی گشتی</span><span className="text-xl font-black">{quotedTotal.toLocaleString('en-US')} د.ع</span></div>
                <p className="text-xs leading-5 text-black/40">گەیاندن بەپێی ژمارەی فرۆشگا/وەسلەکان هەژمار دەکرێت؛ ئۆتۆمبێل و حەج/عومرە کرێی گەیاندنیان نییە. نرخە کۆتاییەکان لە Supabase پشتڕاست دەکرێنەوە.</p>
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
