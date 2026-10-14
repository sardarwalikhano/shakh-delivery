import { ArrowLeft, Banknote, MapPin, PackageCheck, Smartphone, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getMyProfilePhone, updateMyPhone, validatePhone } from '@/lib/auth/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { getFoodPostCart, checkoutFoodPostCart, type FoodPostCartItem, type FoodPostOrderResult } from '../foodPostCart';

function itemPrice(item: FoodPostCartItem): number {
  const base = Number(item.post?.price_iqd ?? 0);
  const discount = Math.max(0, Math.min(99, item.post?.discount_percent ?? 0));
  return Math.round(base * (100 - discount) / 100);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

export function FoodPostCheckoutPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FoodPostCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'mobile_cash' | 'wallet'>('cash_on_delivery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<FoodPostOrderResult[]>([]);
  const [walletAvailable, setWalletAvailable] = useState(0);

  useEffect(() => {
    if (!user) return;
    void Promise.all([
      getFoodPostCart(user.id),
      getMyProfilePhone(),
      supabase.from('referral_wallets').select('available_iqd').eq('user_id', user.id).maybeSingle(),
    ])
      .then(([nextItems, nextPhone, walletResult]) => {
        if (walletResult.error) throw walletResult.error;
        setItems(nextItems);
        setPhone(nextPhone);
        setWalletAvailable(Number(walletResult.data?.available_iqd ?? 0));
      })
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'نەتوانرا زانیاری داواکاری بخوێندرێتەوە.'))
      .finally(() => setLoading(false));
  }, [user]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + itemPrice(item) * item.quantity, 0), [items]);
  const unavailable = items.some((item) => !item.post || item.post.status !== 'active' || itemPrice(item) <= 0 || item.post.author_id === user?.id);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!address.trim() || !city.trim()) { setError('ناونیشان و شار پێویستن.'); return; }
    const phoneError = validatePhone(phone);
    if (phoneError) { setError(phoneError); return; }
    if (unavailable) { setError('خواردنێک لە سەلەدا چیتر بۆ داواکردن بەردەست نییە. تکایە لایببە.'); return; }
    setBusy(true);
    try {
      await updateMyPhone(phone);
      setOrders(await checkoutFoodPostCart({
        deliveryAddress: address,
        buyerPhone: phone,
        deliveryCity: city,
        customerNote: note,
        paymentMethod,
      }));
      setItems([]);
    } catch (nextError) {
      setError(errorMessage(nextError, 'تۆمارکردنی داواکاری سەرکەوتوو نەبوو. تکایە دووبارە هەوڵ بدەوە.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Link to="/cart" className="inline-flex items-center gap-2 text-sm font-black text-black/45"><ArrowLeft size={17}/> گەڕانەوە بۆ سەلە</Link>
        <div className="mt-5 flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><MapPin size={20}/></div><div><div className="text-xs font-black text-[var(--shakh-blue)]">داواکاریی چێشتخانە</div><h1 className="text-3xl font-black">تەواوکردنی داواکاری</h1></div></div>
        {loading ? <div className="mt-6 rounded-[28px] bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : null}
        {orders.length > 0 ? (
          <div className="mt-6 rounded-[28px] bg-white p-6 text-center shadow-sm">
            <PackageCheck size={42} className="mx-auto text-emerald-600"/>
            <h2 className="mt-3 text-2xl font-black">داواکارییەکەت تۆمارکرا</h2>
            <p className="mt-2 text-sm leading-6 text-black/50">وەسڵی داواکاری بۆ چێشتخانە نێردرا. کۆی پارەی داواکاری بۆ تۆ و کاپتن لەم وەسڵەدا دیارە:</p>
            <div className="mt-5 space-y-3 text-start">
              {orders.map((order) => <article key={order.id} className="rounded-2xl border border-black/5 bg-[var(--shakh-bg)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black">{order.post_title} × {order.quantity}</div><div className="mt-1 text-xs font-bold text-black/45" dir="ltr">{order.order_number}</div></div><span className="text-sm font-black">{Number(order.line_total_iqd).toLocaleString('en-US')} د.ع</span></div>
                <div className="mt-3 space-y-2 border-t border-black/5 pt-3 text-sm">
                  <ReceiptLine label="کۆی خواردن" value={order.line_total_iqd} />
                  <ReceiptLine label="کرێی گەیاندن" value={order.delivery_fee_iqd} />
                  <ReceiptLine label="کرێی پلاتفۆرم" value={order.platform_fee_iqd} />
                  <div className="flex justify-between border-t border-black/10 pt-2 text-base"><span className="font-black">{order.payment_method === 'wallet' ? 'پارەی کەوتووەتە باڵانس · کاپتن پارە وەرناگرێت' : 'کۆی پارەی وەسڵ · بۆ کاپتن'}</span><strong>{order.payment_method === 'wallet' ? '٠ د.ع' : Number(order.total_iqd).toLocaleString('en-US') + ' د.ع'}</strong></div>
                </div>
              </article>)}
            </div>
            <Link to="/post-orders" className="mt-5 inline-flex rounded-xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">بینینی داواکارییەکان</Link>
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="mt-6 rounded-[28px] bg-white p-10 text-center"><h2 className="text-xl font-black">سەلەی چێشتخانە بەتاڵە</h2><Link to="/posts" className="mt-4 inline-flex rounded-xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕان لە خواردنەکان</Link></div>
        ) : !loading ? (
          <form onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <section className="rounded-[28px] bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-black"><MapPin size={18}/> زانیاریی گەیاندن</h2>
                <label className="mt-4 block"><span className="mb-2 block text-sm font-black">ژمارەی مۆبایل *</span><input required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-xl border border-black/10 p-3" placeholder="+9647501234567" dir="ltr"/></label>
                <label className="mt-4 block"><span className="mb-2 block text-sm font-black">شار *</span><input required minLength={2} maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-xl border border-black/10 p-3" placeholder="هەولێر"/></label>
                <label className="mt-4 block"><span className="mb-2 block text-sm font-black">ناونیشانی تەواو *</span><textarea required minLength={5} maxLength={1000} value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-24 w-full rounded-xl border border-black/10 p-3" placeholder="گەڕەک، شەقام و نیشانەی نزیک"/></label>
                <label className="mt-4 block"><span className="mb-2 block text-sm font-black">تێبینی بۆ چێشتخانە</span><textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-xl border border-black/10 p-3" placeholder="ئارەزوومەندانە"/></label>
              </section>
              <section className="rounded-[28px] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">شێوازی پارەدان</h2>
                <div className="mt-3 grid gap-3">
                  <label className="flex items-center gap-3 rounded-2xl border border-black/10 p-4"><input type="radio" name="food-payment" checked={paymentMethod==='cash_on_delivery'} onChange={()=>setPaymentMethod('cash_on_delivery')}/><Banknote size={18}/><span className="text-sm font-black">پارە لە کاتی گەیاندن</span></label>
                  <label className="flex items-center gap-3 rounded-2xl border border-black/10 p-4"><input type="radio" name="food-payment" checked={paymentMethod==='mobile_cash'} onChange={()=>setPaymentMethod('mobile_cash')}/><Smartphone size={18}/><span className="text-sm font-black">Mobile Cash</span></label>
                  <label className={'flex items-center gap-3 rounded-2xl border p-4 ' + (walletAvailable >= subtotal ? 'border-emerald-600/20 bg-emerald-500/[0.035]' : 'border-black/10 opacity-60')}>
                    <input type="radio" name="food-payment" checked={paymentMethod==='wallet'} disabled={walletAvailable <= 0} onChange={()=>setPaymentMethod('wallet')}/>
                    <WalletCards size={19} className="text-emerald-700"/>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-black">باڵانسی خەڵاتی شاخ</span><span className="mt-1 block text-xs text-black/45">بەردەست: {walletAvailable.toLocaleString('en-US')} د.ع · کۆی خواردن: {subtotal.toLocaleString('en-US')} د.ع</span></span>
                  </label>
                  {paymentMethod==='wallet' && walletAvailable < subtotal ? <p role="alert" className="text-xs font-bold text-red-700">باڵانسی بەردەست کەمە؛ کرێی گەیاندن و پلاتفۆرمیش لە کۆتایی هەژمار دەکرێن.</p> : null}
                </div>
              </section>
              {error ? <div role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null}
              {unavailable ? <div role="alert" className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">پۆستێک لە سەلەدا بەردەست نییە. بگەڕێوە بۆ سەلە و لایببە.</div> : null}
            </div>
            <aside className="h-fit rounded-[28px] bg-white p-5 shadow-sm lg:sticky lg:top-24">
              <h2 className="text-lg font-black">کورتەی داواکاری</h2>
              <div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span className="font-bold">{item.post?.title ?? 'خواردن'} × {item.quantity}</span><span className="shrink-0 font-black">{(itemPrice(item)*item.quantity).toLocaleString('en-US')} د.ع</span></div>)}</div>
              <div className="mt-4 flex justify-between border-t border-black/5 pt-4"><span className="font-black">کۆی خواردن</span><span className="font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>
              <p className="mt-2 text-xs leading-5 text-black/40">کرێی گەیاندن و کرێی پلاتفۆرم بە پێی شار لە server هەژمار دەکرێت.</p>
              <button disabled={busy || unavailable} className="mt-5 w-full rounded-2xl bg-[var(--shakh-navy)] px-5 py-4 text-sm font-black text-white disabled:opacity-50">{busy ? 'تۆمارکردن...' : 'داواکاریی خواردن تۆمار بکە'}</button>
            </aside>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function ReceiptLine({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-3 text-black/60"><span>{label}</span><span className="font-bold">{Number(value).toLocaleString('en-US')} د.ع</span></div>;
}

