import { MapPin, Minus, Plus, ShoppingBag, Smartphone, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyProfilePhone, updateMyPhone, validatePhone } from '@/lib/auth/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Post } from '../types';
import { createElectronicsPostOrder } from '../apparelOrders';
import { getPostShareToken } from '../shareRewards';
import { DeliveryPointPicker } from './DeliveryPointPicker';
import { isWithinDeliveryZone, readableDeliveryError, saveMyDeliveryPoint, type DeliveryPoint } from '../deliveryZones';

type Props = { post: Post; selectedColor: string };

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

const electronicsColorLabels: Record<string, string> = {
  black: 'ڕەش', white: 'سپی', blue: 'شین', silver: 'زیوی', gray: 'خاکستەری',
  gold: 'زێڕی', green: 'سەوز', red: 'سوور', purple: 'مۆر', pink: 'پەمەیی', other: 'ڕەنگی تر',
};

export function ElectronicsPurchasePanel({ post, selectedColor }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);
  const [address, setAddress] = useState('');
  const [deliveryPoint, setDeliveryPoint] = useState<DeliveryPoint | null>(null);
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'mobile_cash'>('cash_on_delivery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const stock = Math.max(0, Math.floor(Number(post.category_details?.stock_quantity ?? 0)));
  const price = Math.round(Math.max(0, Number(post.price_iqd ?? 0)) * (100 - Math.max(0, Math.min(99, post.discount_percent ?? 0))) / 100);
  const subtotal = price * quantity;
  const ownPost = Boolean(user?.id && user.id === post.author_id);

  useEffect(() => {
    if (!user) return;
    void getMyProfilePhone().then(setPhone).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    setQuantity((current) => Math.max(1, Math.min(current, Math.max(1, stock))));
  }, [stock]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!user) {
      navigate('/login', { state: { from: '/posts/' + post.id } });
      return;
    }
    if (ownPost) { setError('ناتوانیت لە پۆستی خۆت بکڕیت.'); return; }
    if (!selectedColor.trim()) { setError('تکایە ڕەنگی ئەلیکترۆنیات هەڵبژێرە.'); return; }
    if (stock < 1) { setError('ئەم ئامێرە لە کۆگا بەردەست نییە.'); return; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > stock) { setError('ژمارەی داواکراو لە کۆگای بەردەست زیاترە.'); return; }
    if (address.trim().length < 5) { setError('ناونیشانی گەیاندن پێویستە.'); return; }
    if (city.trim().length < 2) { setError('شاری گەیاندن پێویستە.'); return; }
    if (!deliveryPoint) { setError('تکایە شوێنی GPS ـی گەیاندنت دیاری بکە.'); return; }
    if (!isWithinDeliveryZone(post.delivery_latitude, post.delivery_longitude, post.delivery_radius_km, deliveryPoint)) { setError('بۆ ئێرە بەردەست نییە؛ شوێنی تۆ لە دەرەوەی زۆنی گەیاندنی ئەم پۆستەیە.'); return; }
    const phoneError = validatePhone(phone);
    if (phoneError) { setError(phoneError); return; }

    setBusy(true);
    try {
      await updateMyPhone(phone);
      await saveMyDeliveryPoint(deliveryPoint);
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await createElectronicsPostOrder({
        requestId: requestId.current,
        postId: post.id,
        selectedColor,
        quantity,
        deliveryAddress: address.trim(),
        deliveryCity: city.trim(),
        buyerPhone: phone,
        customerNote: note.trim(),
        paymentMethod,
        shareLinkId: getPostShareToken(post.id),
      });
      requestId.current = null;
      navigate('/post-orders', { replace: true, state: { orderCreated: true } });
    } catch (nextError) {
      setError(readableDeliveryError(getErrorMessage(nextError, 'تۆمارکردنی داواکاریی ئەلیکترۆنیات سەرکەوتوو نەبوو. تکایە دووبارە هەوڵ بدەوە.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 space-y-4 rounded-[24px] border border-[var(--shakh-blue)]/20 bg-[var(--shakh-bg)] p-4 sm:p-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">کڕینی ئەلیکترۆنیات</h2>
          <p className="mt-1 text-xs leading-5 text-black/45">براند: {post.brand || '—'} · بەردەست: {stock} دانە</p>
          <p className="mt-1 text-xs font-black text-[var(--shakh-blue)]">ڕەنگی هەڵبژێردراو: {electronicsColorLabels[selectedColor] ?? selectedColor}</p>
        </div>
        <div className="text-end">
          <div className="text-xs font-bold text-black/40">نرخی یەک دانە</div>
          <div className="text-xl font-black">{price.toLocaleString('en-US')} د.ع</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3">
        <span className="text-sm font-black">ژمارەی دانە</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="کەمکردنەوەی ژمارە" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid size-10 place-items-center rounded-xl border border-black/10 disabled:opacity-30"><Minus size={16} /></button>
          <span className="min-w-8 text-center font-black" aria-live="polite">{quantity}</span>
          <button type="button" aria-label="زیادکردنی ژمارە" disabled={quantity >= stock} onClick={() => setQuantity((value) => Math.min(stock, value + 1))} className="grid size-10 place-items-center rounded-xl border border-black/10 disabled:opacity-30"><Plus size={16} /></button>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-black/10 pt-3"><span className="font-bold text-black/45">کۆی بەرهەم</span><span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>
      <p className="text-xs leading-6 text-black/45">کرێی گەیاندن و کرێی پلاتفۆرم لە وەسڵی داواکارییەکەدا بە جیاوازی پیشان دەدرێن. خەڵاتی شێرکردن تەنها دوای تەواوبوونی گەیاندن و پشتڕاستکردنەوەی پارەدان زیاد دەکرێت.</p>
      {!showCheckout ? (
        <button type="button" onClick={() => user ? setShowCheckout(true) : navigate('/login', { state: { from: '/posts/' + post.id } })} disabled={ownPost || stock < 1 || price <= 0} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
          <ShoppingBag size={17} /> {ownPost ? 'ناتوانیت لە پۆستی خۆت بکڕیت' : stock < 1 ? 'لە کۆگا بەردەست نییە' : 'داواکردنی ئەم ئامێرە'}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 border-t border-black/10 pt-4">
          <label className="block"><span className="mb-2 block text-sm font-black"><MapPin size={15} className="me-1 inline" />ناونیشانی گەیاندن *</span><textarea required minLength={5} maxLength={1000} value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-24 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="شار، گەڕەک، شەقام و ژمارەی خانوو" /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">شاری گەیاندن *</span><input required minLength={2} maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="هەولێر" /></label>
          <DeliveryPointPicker value={deliveryPoint} onChange={setDeliveryPoint} title="شوێنی GPS ـی گەیاندن" description={`مەودای گەیاندنی ئەم پۆستە ${post.delivery_radius_km} کم ـە. لە دەرەوەی ئەم زۆنە ئۆردەر وەرناگیرێت.`} />
          <label className="block"><span className="mb-2 block text-sm font-black">ژمارەی مۆبایل *</span><input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="+9647501234567" dir="ltr" /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">تێبینی (ئارەزوومەندانە)</span><textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-16 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm" placeholder="تێبینی بۆ فرۆشیار" /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs font-bold"><input type="radio" name="electronics-payment" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} /><Truck size={17} className="text-[var(--shakh-orange)]" />پارە لە کاتی گەیاندن</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs font-bold"><input type="radio" name="electronics-payment" checked={paymentMethod === 'mobile_cash'} onChange={() => setPaymentMethod('mobile_cash')} /><Smartphone size={17} className="text-[var(--shakh-blue)]" />Mobile Cash</label>
          </div>
          {error ? <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</div> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCheckout(false)} disabled={busy} className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-black">پاشگەزبوونەوە</button>
            <button type="submit" disabled={busy || stock < quantity} className="min-h-12 flex-1 rounded-2xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'تۆمارکردن...' : 'پشتڕاستکردنەوەی داواکاری'}</button>
          </div>
        </form>
      )}
      {error && !showCheckout ? <div role="alert" className="text-sm font-bold text-red-700">{error}</div> : null}
    </section>
  );
}
