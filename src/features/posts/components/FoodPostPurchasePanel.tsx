import { MapPin, Minus, Plus, ShoppingBag, Smartphone, Truck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyProfilePhone, updateMyPhone, validatePhone } from '@/lib/auth/auth';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Post } from '../types';
import { createFoodPostOrder } from '../foodPostOrders';

type Props = { post: Post };

export function FoodPostPurchasePanel({ post }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'mobile_cash'>('cash_on_delivery');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void getMyProfilePhone().then(setPhone).catch(() => undefined);
  }, [user]);

  useEffect(() => { setQuantity(1); }, [post.id]);

  const discount = Math.max(0, Math.min(99, post.discount_percent ?? 0));
  const price = Math.round(Number(post.price_iqd ?? 0) * (100 - discount) / 100);
  const subtotal = price * quantity;
  const ownPost = Boolean(user?.id && user.id === post.author_id);
  const canOrder = post.status === 'active' && Number.isFinite(price) && price > 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!user) {
      navigate('/login', { state: { from: '/posts/' + post.id } });
      return;
    }
    if (ownPost) { setError('ناتوانیت لە پۆستی خۆت داواکاری بکەیت.'); return; }
    if (!canOrder) { setError('ئەم پۆستە نرخی دروستی نییە یان لە ئێستادا بەردەست نییە.'); return; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      setError('ژمارەی داواکاری دەبێت لە ١ تا ١٠٠ دانە بێت.');
      return;
    }
    if (address.trim().length < 5) { setError('ناونیشانی گەیاندن بە وردی بنووسە.'); return; }
    const phoneError = validatePhone(phone);
    if (phoneError) { setError(phoneError); return; }

    setBusy(true);
    try {
      await updateMyPhone(phone);
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await createFoodPostOrder({
        requestId: requestId.current,
        postId: post.id,
        quantity,
        deliveryAddress: address.trim(),
        buyerPhone: phone,
        customerNote: note,
        paymentMethod,
      });
      requestId.current = null;
      navigate('/post-orders', { replace: true, state: { orderCreated: true, orderType: 'food' } });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'تۆمارکردنی داواکاریی خواردن سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 space-y-4 rounded-[24px] border border-[var(--shakh-orange)]/20 bg-[var(--shakh-bg)] p-4 sm:p-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">داواکردنی خواردن</h2>
          <p className="mt-1 text-xs leading-5 text-black/45">داواکاری بۆ خاوەنی پۆست دەنێردرێت؛ خاوەنەکە دەتوانێت پەسەندی بکات یان ڕەتی بکاتەوە.</p>
        </div>
        <div className="text-end">
          <div className="text-xs font-bold text-black/40">نرخی یەک دانە</div>
          <div className="text-xl font-black">{price > 0 ? price.toLocaleString('en-US') + ' د.ع' : 'نرخ دیاری نییە'}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3">
        <span className="text-sm font-black">ژمارەی داواکراو</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="کەمکردنەوەی ژمارە" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid size-10 place-items-center rounded-xl border border-black/10 disabled:opacity-30"><Minus size={16}/></button>
          <span className="min-w-8 text-center font-black" aria-live="polite">{quantity}</span>
          <button type="button" aria-label="زیادکردنی ژمارە" disabled={quantity >= 100} onClick={() => setQuantity((value) => Math.min(100, value + 1))} className="grid size-10 place-items-center rounded-xl border border-black/10 disabled:opacity-30"><Plus size={16}/></button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/10 pt-3">
        <span className="font-bold text-black/45">کۆی نرخی خواردن</span>
        <span className="text-xl font-black">{subtotal.toLocaleString('en-US')} د.ع</span>
      </div>

      {!showCheckout ? (
        <button
          type="button"
          onClick={() => user ? setShowCheckout(true) : navigate('/login', { state: { from: '/posts/' + post.id } })}
          disabled={ownPost || !canOrder}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ShoppingBag size={17}/>
          {ownPost ? 'ناتوانیت لە پۆستی خۆت داواکاری بکەیت' : !canOrder ? 'داواکاری بەردەست نییە' : 'داواکردنی ئەم خواردنە'}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 border-t border-black/10 pt-4">
          <label className="block">
            <span className="mb-2 block text-sm font-black"><MapPin size={15} className="me-1 inline"/>ناونیشانی گەیاندن *</span>
            <textarea required minLength={5} maxLength={1000} value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-24 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="شار، گەڕەک، شەقام و ژمارەی خانوو"/>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black">ژمارەی مۆبایل *</span>
            <input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="+9647501234567" dir="ltr"/>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-black">تێبینی بۆ ئامادەکردن (ئارەزوومەندانە)</span>
            <textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-16 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm" placeholder="ژمارەی مێز، بێ فلفل، یان تێبینییەکی تر"/>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs font-bold"><input type="radio" name="food-payment" checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')}/><Truck size={17} className="text-[var(--shakh-orange)]"/>پارەدان لە کاتی گەیاندن</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-xs font-bold"><input type="radio" name="food-payment" checked={paymentMethod === 'mobile_cash'} onChange={() => setPaymentMethod('mobile_cash')}/><Smartphone size={17} className="text-[var(--shakh-blue)]"/>Mobile Cash (چاوەڕوانی چالاککردن)</label>
          </div>
          {error ? <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</div> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCheckout(false)} disabled={busy} className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-black">پاشگەزبوونەوە</button>
            <button type="submit" disabled={busy || !canOrder} className="min-h-12 flex-1 rounded-2xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'تۆمارکردن...' : 'داواکاری پشتڕاست بکەرەوە'}</button>
          </div>
        </form>
      )}
      {error && !showCheckout ? <div role="alert" className="text-sm font-bold text-red-700">{error}</div> : null}
      <p className="text-[11px] leading-5 text-black/35">نرخ لە Supabase دووبارە پشتڕاست دەکرێتەوە. داواکاری دوای تۆمارکردن لە بەشی «داواکارییەکانی پۆست» بەڕێوەدەبرێت.</p>
    </section>
  );
}
