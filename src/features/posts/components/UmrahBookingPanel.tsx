import { CalendarDays, CheckCircle2, Clock3, LoaderCircle, Send, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getActiveManualPaymentMethods, createUmrahBookingRequest, getLatestManualPaymentForBooking, getLatestUmrahBookingForPost, submitManualPayment, type ManualPaymentMethod, type ManualPaymentSubmission, type UmrahBookingRequest } from '../manualPayments';
import type { Post } from '../types';

type Props = {
  post: Post;
  currentUserId: string | null;
  ownsPost: boolean;
};

const receiptMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function UmrahBookingPanel({ post, currentUserId, ownsPost }: Props) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [travelerCount, setTravelerCount] = useState('1');
  const [departureDate, setDepartureDate] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [booking, setBooking] = useState<UmrahBookingRequest | null>(null);
  const [latestPayment, setLatestPayment] = useState<ManualPaymentSubmission | null>(null);
  const [startNewBooking, setStartNewBooking] = useState(false);
  const [stage, setStage] = useState<'details' | 'payment' | 'submitted'>('details');
  const [methods, setMethods] = useState<ManualPaymentMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packagePrice = Number(post.price_iqd ?? 0);
  const parsedTravelerCount = Math.max(1, Math.min(30, Math.floor(Number(travelerCount) || 1)));
  const estimatedTotal = useMemo(() => Math.round(packagePrice * parsedTravelerCount), [packagePrice, parsedTravelerCount]);

  useEffect(() => {
    if (!currentUserId || ownsPost || startNewBooking) return;
    let cancelled = false;
    async function resumeLatestBooking() {
      try {
        const existing = await getLatestUmrahBookingForPost(post.id);
        if (!existing || cancelled) return;
        const payment = await getLatestManualPaymentForBooking(existing.id);
        if (cancelled) return;
        setBooking(existing);
        setLatestPayment(payment);
        setCustomerName(existing.customer_name);
        setCustomerPhone(existing.customer_phone);
        setTravelerCount(String(existing.traveler_count));
        setDepartureDate(existing.preferred_departure_date ?? '');
        if (existing.status === 'pending_payment_review' || existing.status === 'confirmed') {
          setStage('submitted');
        } else if (existing.status === 'awaiting_payment' || existing.status === 'payment_rejected') {
          setStage('payment');
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'نەتوانرا دۆخی حیجز بخوێندرێتەوە.');
      }
    }
    void resumeLatestBooking();
    return () => { cancelled = true; };
  }, [post.id, currentUserId, ownsPost, startNewBooking]);

  useEffect(() => {
    if (stage !== 'payment') return;
    let cancelled = false;
    setMethodsLoading(true);
    setMethodsError(null);
    void getActiveManualPaymentMethods()
      .then((rows) => {
        if (cancelled) return;
        setMethods(rows);
        setSelectedMethodId((current) => current || rows[0]?.id || '');
      })
      .catch((nextError) => {
        if (!cancelled) setMethodsError(nextError instanceof Error ? nextError.message : 'نەتوانرا ژمارەکانی پارەدان بخوێندرێنەوە.');
      })
      .finally(() => { if (!cancelled) setMethodsLoading(false); });
    return () => { cancelled = true; };
  }, [stage]);

  const startBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!currentUserId) return;
    if (packagePrice <= 0 || !Number.isFinite(packagePrice)) {
      setError('نرخی ئەم پەکێجە دیاری نەکراوە؛ تکایە پێش حیجزکردن لە ئەژانسەکە پشتڕاستی بکەرەوە.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createUmrahBookingRequest({
        packagePostId: post.id,
        customerName,
        customerPhone,
        travelerCount: parsedTravelerCount,
        preferredDepartureDate: departureDate || null,
        customerNote,
      });
      setBooking(result);
      setStartNewBooking(true);
      setLatestPayment(null);
      setCustomerNote('');
      setStage('payment');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'تۆمارکردنی داواکاریی حیجز سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  const submitProof = async () => {
    if (!booking || busy) return;
    if (!methods.some((method) => method.id === selectedMethodId)) {
      setError(methods.length ? 'شێوازی پارەدان هەڵبژێرە.' : 'ژمارەکانی پارەدان لەلایەن سوپەر ئەدمینەوە ڕێک نەخراون.');
      return;
    }
    if (!receipt) {
      setError('تکایە وەسڵ یان سکرین‌شۆتی پارەدان هەڵبژێرە.');
      return;
    }
    if (!receiptMimeTypes.includes(receipt.type) || receipt.size <= 0 || receipt.size > 5 * 1024 * 1024) {
      setError('وەسڵ دەبێت JPG، PNG، WebP یان PDF بێت و لە ٥ مێگابایت زیاتر نەبێت.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const paymentSubmission = await submitManualPayment({
        purpose: 'umrah_booking',
        targetId: booking.id,
        paymentMethodId: selectedMethodId,
        amountIqd: Number(booking.total_amount_iqd),
        receiptFile: receipt,
      });
      setLatestPayment(paymentSubmission);
      setBooking({ ...booking, status: 'pending_payment_review' });
      setStage('submitted');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ناردنی وەسڵ سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  if (ownsPost) {
    return <div className="mt-6 rounded-2xl bg-[var(--shakh-bg)] p-4 text-sm font-bold leading-6 text-black/50">ناتوانیت پەکێجی خۆت حیجز بکەیت.</div>;
  }
  if (stage === 'submitted') {
    const confirmed = booking?.status === 'confirmed';
    const rejected = booking?.status === 'payment_rejected' || latestPayment?.status === 'rejected';
    return (
      <section className={`mt-6 rounded-2xl border p-4 sm:p-5 ${confirmed ? 'border-emerald-500/20 bg-emerald-50' : rejected ? 'border-red-500/20 bg-red-50' : 'border-amber-500/20 bg-amber-50'}`}>
        {confirmed ? <CheckCircle2 size={26} className="text-emerald-700"/> : rejected ? <XCircle size={26} className="text-red-700"/> : <Clock3 size={26} className="text-amber-800"/>}
        <h2 className={`mt-2 text-lg font-black ${confirmed ? 'text-emerald-900' : rejected ? 'text-red-900' : 'text-amber-900'}`}>
          {confirmed ? 'حیجزی عومرە پشتڕاست کرایەوە' : rejected ? 'وەسڵی پارەدان ڕەتکرایەوە' : 'داواکاریی حیجز نێردرا'}
        </h2>
        <p className={`mt-2 text-sm leading-7 ${confirmed ? 'text-emerald-900/75' : rejected ? 'text-red-900/75' : 'text-amber-900/75'}`}>
          {confirmed
            ? 'سوپەر ئەدمین پارەدان و داواکاریی حیجزەکەی پشتڕاست کردووەتەوە. بۆ وردەکاریی گەشت لەگەڵ ئەژانسەکە پەیوەندی بکە.'
            : rejected
              ? 'تکایە تێبینیی ڕەتکردنەوە بخوێنەوە و دوای ڕاستکردنەوەی کێشەکە وەسڵی نوێ بنێرەوە.'
              : 'وەسڵەکە بۆ سوپەر ئەدمین نێردرا. حیجزەکە تا پشکنینی وەسڵ و پەسەندکردن پشتڕاست ناکرێتەوە.'}
        </p>
        {latestPayment?.admin_note ? <div className={`mt-3 rounded-xl p-3 text-sm leading-6 ${rejected ? 'bg-white text-red-900' : 'bg-white/70 text-black/65'}`}>تێبینیی سوپەر ئەدمین: {latestPayment.admin_note}</div> : null}
        <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm">
          <span className="text-black/45">کۆی پارە:</span>
          <strong className="ms-1">{Number(booking?.total_amount_iqd ?? estimatedTotal).toLocaleString('en-US')} د.ع</strong>
          {booking ? <div className="mt-1 text-xs text-black/45">{booking.traveler_count} گەشتیار · {booking.customer_name}</div> : null}
        </div>
        {confirmed ? <button type="button" onClick={() => {
          setStartNewBooking(true);
          setBooking(null);
          setLatestPayment(null);
          setReceipt(null);
          setCustomerName('');
          setCustomerPhone('');
          setTravelerCount('1');
          setDepartureDate('');
          setCustomerNote('');
          setStage('details');
          setSelectedMethodId('');
          setError(null);
        }} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-black text-black/70">داوای حیجزێکی نوێ</button> : null}
        {rejected ? (
          <button type="button" onClick={() => { setStage('payment'); setReceipt(null); setError(null); }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2.5 text-sm font-black text-white">
            <Upload size={16}/> ناردنی وەسڵی نوێ
          </button>
        ) : null}
      </section>
    );
  }

  if (!currentUserId) {
    return (
      <section className="mt-6 rounded-2xl border border-[var(--shakh-blue)]/15 bg-[var(--shakh-bg)] p-4 sm:p-5">
        <h2 className="text-lg font-black">داوای حیجزی عومرە</h2>
        <p className="mt-2 text-sm leading-6 text-black/55">بۆ ناردنی داواکاریی حیجز و وەسڵی پارەدان، سەرەتا بچۆ ژوورەوە.</p>
        <Link to="/login" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white">چوونە ژوورەوە</Link>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-[var(--shakh-blue)]/15 bg-[var(--shakh-bg)] p-3 sm:rounded-[24px] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--shakh-blue)]"><CalendarDays size={21}/></div>
        <div>
          <h2 className="text-lg font-black">{stage === 'details' ? 'داوای حیجزی عومرە' : 'پارەدان و ناردنی وەسڵ'}</h2>
          <p className="mt-1 text-sm leading-6 text-black/55">{stage === 'details' ? 'زانیاریی گەشتیاران پڕبکەرەوە؛ پاشان ژمارەکانی پارەدان و بڕی کۆتایی پیشان دەدرێن.' : 'پارە بە مۆبایل بنێرە و وەسڵ باربکە؛ سوپەر ئەدمین پاش پشکنین داواکارییەکە پەسەند یان ڕەت دەکاتەوە.'}</p>
        </div>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">{error}</div> : null}

      {stage === 'details' ? (
        <form className="mt-4 space-y-3" onSubmit={(event) => void startBooking(event)}>
          <label className="block text-xs font-black text-black/60">ناوی تەواو *
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required minLength={2} maxLength={160} className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="ناوی گەشتیار"/>
          </label>
          <label className="block text-xs font-black text-black/60">ژمارەی مۆبایل *
            <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required minLength={6} maxLength={40} type="tel" dir="ltr" className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]" placeholder="07xx xxx xxxx"/>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black text-black/60">ژمارەی گەشتیاران *
              <input value={travelerCount} onChange={(event) => setTravelerCount(event.target.value)} required type="number" min={1} max={30} step={1} inputMode="numeric" className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]"/>
            </label>
            <label className="block text-xs font-black text-black/60">بەرواری مەبەست
              <input value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} type="date" className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]"/>
            </label>
          </div>
          <label className="block text-xs font-black text-black/60">تێبینی (ئارەزوومەندانە)
            <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} maxLength={2000} rows={2} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-[var(--shakh-blue)]" placeholder="زانیاریی زیادە بۆ ئەژانس"/>
          </label>
          <div className="rounded-xl bg-white p-4">
            <div className="text-xs font-bold text-black/45">نرخی یەک کەس</div>
            <div className="mt-1 text-lg font-black">{packagePrice > 0 ? packagePrice.toLocaleString('en-US') + ' د.ع' : 'نرخ دیاری نەکراوە'}</div>
            <div className="mt-3 text-xs font-bold text-black/45">کۆی پێشبینیکراو</div>
            <div className="mt-1 text-xl font-black text-[var(--shakh-navy)]">{packagePrice > 0 ? estimatedTotal.toLocaleString('en-US') + ' د.ع' : '—'}</div>
            <p className="mt-2 text-xs leading-5 text-black/45">کۆی پارە بەپێی نرخی پۆست و ژمارەی گەشتیاران لە داتابەیس پشتڕاست دەکرێتەوە.</p>
          </div>
          <button type="submit" disabled={busy || packagePrice <= 0} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={17} className="animate-spin"/> : <Send size={17}/>} {busy ? 'تۆمارکردنی حیجز...' : 'بەردەوامبوون بۆ پارەدان'}
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-[var(--shakh-orange)]/20 bg-white p-4">
            <div className="text-xs font-bold text-black/45">بڕی پێویستی ناردن بۆ حیجزی عومرە</div>
            <div className="mt-1 text-2xl font-black text-[var(--shakh-orange)]">{Number(booking?.total_amount_iqd ?? estimatedTotal).toLocaleString('en-US')} د.ع</div>
            <div className="mt-1 text-xs leading-5 text-black/45">{booking?.traveler_count ?? parsedTravelerCount} گەشتیار × {Number(booking?.package_price_iqd ?? packagePrice).toLocaleString('en-US')} د.ع</div>
          </div>
          {latestPayment?.status === 'rejected' && latestPayment.admin_note ? <div role="alert" className="rounded-xl border border-red-500/20 bg-red-50 p-3 text-sm leading-6 text-red-800"><strong>تێبینیی سوپەر ئەدمین:</strong> {latestPayment.admin_note}</div> : null}
          {methodsLoading ? <div className="rounded-xl bg-white p-4 text-sm font-bold text-black/45">بارکردنی ژمارەکانی پارەدان...</div> : null}
          {methodsError ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{methodsError}</div> : null}
          {!methodsLoading && !methods.length && !methodsError ? <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-50 p-4 text-sm leading-6 text-amber-900">ژمارەکانی فاستپەی، FIB و ئاسیا حوالە لەلایەن سوپەر ئەدمینەوە ڕێک نەخراون.</div> : null}
          {methods.length ? (
            <div className="space-y-3">
              <div className="text-sm font-black">شێوازی پارەدان هەڵبژێرە</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {methods.map((method) => (
                  <button key={method.id} type="button" aria-pressed={selectedMethodId === method.id} onClick={() => setSelectedMethodId(method.id)} className={`min-w-0 rounded-xl border p-3 text-start transition ${selectedMethodId === method.id ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/[0.06] ring-1 ring-[var(--shakh-orange)]/20' : 'border-black/10 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-black">{method.label_ku}</span><span className={`grid size-5 place-items-center rounded-full border text-xs ${selectedMethodId === method.id ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)] text-white' : 'border-black/20'}`}>{selectedMethodId === method.id ? '✓' : ''}</span></div>
                    <div className="mt-2 break-all rounded-lg bg-[var(--shakh-bg)] px-3 py-2.5 text-base font-black" dir="ltr">{method.account_identifier}</div>
                    {method.account_holder ? <div className="mt-2 text-xs leading-5 text-black/55">خاوەنی هەژمار: <strong>{method.account_holder}</strong></div> : null}
                    {method.instructions_ku ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-black/50">{method.instructions_ku}</p> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <label className="block text-xs font-black text-black/60">وەسڵی پارەدان *
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; if (file && (!receiptMimeTypes.includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024)) { setError('وەسڵ دەبێت JPG، PNG، WebP یان PDF بێت و لە ٥ مێگابایت زیاتر نەبێت.'); setReceipt(null); event.currentTarget.value = ''; return; } setReceipt(file); setError(null); }} className="mt-2 block min-h-12 w-full rounded-xl border border-dashed border-black/20 bg-white px-3 py-3 text-sm"/>
            {receipt ? <span className="mt-2 block break-all text-xs text-black/45">{receipt.name} · {(receipt.size / 1024).toFixed(0)} KB</span> : null}
          </label>
          <div className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs leading-6 text-black/50"><ShieldCheck size={16} className="mt-1 shrink-0 text-[var(--shakh-blue)]"/> وەسڵەکە تەنها بۆ سوپەر ئەدمین و خاوەنی داواکاری بەردەستە، و حیجزەکە پاش پشکنین پشتڕاست دەکرێتەوە.</div>
          <button type="button" onClick={() => void submitProof()} disabled={busy || methodsLoading || !methods.length} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={17} className="animate-spin"/> : <Upload size={17}/>} {busy ? 'ناردنی داواکاری...' : 'ناردن بۆ پشکنینی سوپەر ئەدمین'}
          </button>
<p className="text-xs leading-6 text-black/45">ئەگەر زانیارییەکانت پێویستیان بە گۆڕانکاری هەیە، پێش ناردنی وەسڵ لەگەڵ ئەژانس پەیوەندی بکە؛ داواکاریی حیجزەکە تۆمار کراوە.</p>
        </div>
      )}
    </section>
  );
}
