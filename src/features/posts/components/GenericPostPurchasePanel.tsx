import { MapPin, Minus, Plus, ShoppingBag, Smartphone, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyProfilePhone, updateMyPhone, validatePhone } from '@/lib/auth/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import { postCategoryLabels } from '../labels';
import type { Post } from '../types';
import { createProductPostOrder } from '../apparelOrders';
import { getPostShareToken } from '../shareRewards';
import { DeliveryPointPicker } from './DeliveryPointPicker';
import { isWithinDeliveryZone, readableDeliveryError, saveMyDeliveryPoint, type DeliveryPoint } from '../deliveryZones';

type Props = { post: Post };

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

export function GenericPostPurchasePanel({ post }: Props) {
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

  const rawStock = post.category_details?.stock_quantity;
  const stockText = rawStock == null ? '' : String(rawStock).trim();
  const hasTrackedStock = stockText.length > 0;
  const validStock = /^\d+$/.test(stockText);
  const stock = validStock ? Number(stockText) : 0;
  const basePrice = Number(post.price_iqd ?? 0);
  const discount = Math.max(0, Math.min(99, Number(post.discount_percent ?? 0)));
  const price = Math.round(basePrice * (100 - discount) / 100);
  const subtotal = price * quantity;
  const ownPost = Boolean(user?.id && user.id === post.author_id);
  const hasDeliveryZone = post.delivery_latitude != null && post.delivery_longitude != null && post.delivery_radius_km >= 1;

  useEffect(() => {
    if (!user) return;
    void getMyProfilePhone().then(setPhone).catch(() => undefined);
  }, [user]);

  useEffect(() => {
    setQuantity((current) => Math.min(current, hasTrackedStock && validStock ? Math.max(1, stock) : 100));
  }, [hasTrackedStock, validStock, stock]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!user) {
      navigate('/login', { state: { from: '/posts/' + post.id } });
      return;
    }
    if (ownPost) { setError('ناتوانیت لە پۆستی خۆت بکڕیت.'); return; }
    if (!Number.isFinite(basePrice) || basePrice <= 0 || price <= 0) { setError('نرخی ئەم پۆستە بۆ داواکاری دیاری نەکراوە.'); return; }
    if (hasTrackedStock && !validStock) { setError('ژمارەی کۆگای ئەم پۆستە دروست نییە؛ پێویستە فرۆشیار چاکی بکاتەوە.'); return; }
    if (hasTrackedStock && stock < quantity) { setError('ژمارەی داواکراو لە کۆگای بەردەست زیاترە.'); return; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) { setError('ژمارەی داواکاری دەبێت لە ١ تا ١٠٠ بێت.'); return; }
    if (address.trim().length < 5) { setError('ناونیشانی گەیاندن پێویستە.'); return; }
    if (city.trim().length < 2) { setError('شاری گەیاندن پێویستە.'); return; }
    if (!hasDeliveryZone) { setError('فرۆشیار زۆنی گەیاندنی ئەم پۆستەی دیاری نەکردووە؛ تکایە پەیوەندی بە فرۆشیار بکە.'); return; }
    if (!deliveryPoint) { setError('تکایە شوێنی GPS ـی گەیاندنت دیاری بکە.'); return; }
    if (deliveryPoint && !isWithinDeliveryZone(post.delivery_latitude, post.delivery_longitude, post.delivery_radius_km, deliveryPoint)) {
      setError('بۆ ئێرە بەردەست نییە؛ شوێنی تۆ لە دەرەوەی زۆنی گەیاندنی ئەم پۆستەیە.');
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) { setError(phoneError); return; }

    setBusy(true);
    try {
      await updateMyPhone(phone);
      await saveMyDeliveryPoint(deliveryPoint!);
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await createProductPostOrder({
        requestId: requestId.current,
        postId: post.id,
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
      setError(readableDeliveryError(getErrorMessage(nextError, 'تۆمارکردنی داواکاری سەرکەوتوو نەبوو. تکایە دووبارە هەوڵ بدەوە.')));
    } finally {
      setBusy(false);
    }
  };

  const unavailable = (hasTrackedStock && (!validStock || stock < 1)) || price <= 0;

  return (
    <section className="mt-6 space-y-4 rounded-[24px] border border-[var(--shakh-orange)]/20 bg-[var(--shakh-bg)] p-4 sm:p-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">داواکردنی {postCategoryLabels[post.category]}</h2>
          <p className="mt-1 text-xs leading-5 text-black/45">
            {hasTrackedStock && validStock ? 'بەردەست: ' + stock.toLocaleString('en-US') + ' دانە' : 'کۆگا لەلایەن فرۆشیارەوە پشتڕاست دەکرێتەوە'}
          </p>
          {unavailable ? <p className="mt-1 text-xs font-black text-red-600">{price <= 0 ? 'نرخی پۆست دیاری نەکراوە' : 'ئەم کاڵایە لە کۆگا بەردەست نییە'}</p> : null}
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
          <button type="button" aria-label="زیادکردنی ژمارە" disabled={quantity >= (hasTrackedStock && validStock ? stock : 100)} onClick={() => setQuantity((value) => Math.min(hasTrackedStock && validStock ? stock : 100, value + 1))} className="grid size-10 place-items-center rounded-xl border border-black/10 disabled:opacity-30"><Plus size={16} /></button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/10 pt-3"><span className="font-bold text-black/45">کۆی بەرهەم</span><span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span></div>

      {!showCheckout ? (
        <button type="button" onClick={() => user ? setShowCheckout(true) : navigate('/login', { state: { from: '/posts/' + post.id } })} disabled={ownPost || unavailable} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
          <ShoppingBag size={17} /> {ownPost ? 'ناتوانیت لە پۆستی خۆت بکڕیت' : unavailable ? 'ئێستا بۆ داواکاری بەردەست نییە' : 'بەردەوامبوون بۆ داواکاری'}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 border-t border-black/10 pt-4">
          <label className="block"><span className="mb-2 block text-sm font-black"><MapPin size={15} className="me-1 inline" />ناونیشانی گەیاندن *</span><textarea required minLength={5} maxLength={1000} value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-24 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="شار، گەڕەک، شەقام و ژمارەی خانوو" /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">شاری گەیاندن *</span><input required minLength={2} maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="هەولێر" /></label>
          <DeliveryPointPicker value={deliveryPoint} onChange={setDeliveryPoint} title="شوێنی GPS ـی گەیاندن" description={hasDeliveryZone ? 'مەودای گەیاندنی ئەم پۆستە ' + post.delivery_radius_km + ' کم ـە. شوێنی GPS پێویستە.' : 'فرۆشیار هێشتا زۆنی گەیاندنی ئەم پۆستەی دیاری نەکردووە؛ پێش داواکاری دەبێت دیاری بکرێت.'} />
          <label className="block"><span className="mb-2 block text-sm font-black">ژمارەی مۆبایل *</span><input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="+9647501234567" dir="ltr" /></label>
          <label className="block"><span className="mb-2 block text-sm font-black">تێبینی (ئارەزوومەندانە)</span><textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-16 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm" placeholder="تێبینی بۆ فرۆشیار" /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs font-bold"><input type="radio" name="product-post-payment" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} /><Truck size={17} className="text-[var(--shakh-orange)]" />پارە لە کاتی گەیاندن</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs font-bold"><input type="radio" name="product-post-payment" checked={paymentMethod === 'mobile_cash'} onChange={() => setPaymentMethod('mobile_cash')} /><Smartphone size={17} className="text-[var(--shakh-blue)]" />Mobile Cash</label>
          </div>
          {error ? <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</div> : null}
          <div className="flex gap-2"><button type="button" onClick={() => setShowCheckout(false)} disabled={busy} className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-black">پاشگەزبوونەوە</button><button type="submit" disabled={busy || unavailable || (hasTrackedStock && !validStock) || (hasTrackedStock && quantity > stock)} className="min-h-12 flex-1 rounded-2xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'تۆمارکردن...' : 'داواکاری پشتڕاست بکەرەوە'}</button></div>
        </form>
      )}
      <p className="text-[11px] leading-5 text-black/35">نرخ، ستۆکی بەردەست (ئەگەر تۆمار کرابێت)، کرێی گەیاندن و کرێی پلاتفۆرم لە Supabase پشتڕاست دەکرێنەوە.</p>
    </section>
  );
}
