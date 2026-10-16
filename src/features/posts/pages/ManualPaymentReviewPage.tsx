import { Check, ExternalLink, FileCheck2, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { getPaymentReceiptUrl, listManualPaymentSubmissions, reviewManualPaymentSubmission, type ManualPaymentMethod, type ManualPaymentSubmission } from '../manualPayments';
import { postCategoryLabels } from '../labels';
import type { Post, PostCategory } from '../types';
import { supabase } from '@/lib/supabase/client';

type PostSummary = Pick<Post, 'id' | 'title' | 'category' | 'price_iqd' | 'author_id' | 'status' | 'category_details'>;
type BookingSummary = {
  id: string;
  package_post_id: string;
  customer_name: string;
  customer_phone: string;
  traveler_count: number;
  total_amount_iqd: number;
  status: string;
  preferred_departure_date: string | null;
  customer_note: string | null;
};
type MethodSummary = Pick<ManualPaymentMethod, 'id' | 'provider' | 'label_ku'>;

const providerLabels: Record<string, string> = {
  fastpay: 'FastPay',
  fib: 'FIB',
  asia_hawala: 'ئاسیا حوالە',
};

export function ManualPaymentReviewPage() {
  const [submissions, setSubmissions] = useState<ManualPaymentSubmission[]>([]);
  const [postsById, setPostsById] = useState<Record<string, PostSummary>>({});
  const [bookingsById, setBookingsById] = useState<Record<string, BookingSummary>>({});
  const [methodsById, setMethodsById] = useState<Record<string, MethodSummary>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listManualPaymentSubmissions();
      setSubmissions(rows);
      const postIds = [...new Set(rows.flatMap((row) => row.post_id ? [row.post_id] : []))];
      const bookingIds = [...new Set(rows.flatMap((row) => row.booking_request_id ? [row.booking_request_id] : []))];
      const methodIds = [...new Set(rows.map((row) => row.payment_method_id))];
      const [postResult, bookingResult, methodResult] = await Promise.all([
        postIds.length
          ? supabase.from('posts').select('id,title,category,price_iqd,author_id,status,category_details').in('id', postIds)
          : Promise.resolve({ data: [], error: null }),
        bookingIds.length
          ? supabase.from('umrah_booking_requests').select('id,package_post_id,customer_name,customer_phone,traveler_count,total_amount_iqd,status,preferred_departure_date,customer_note').in('id', bookingIds)
          : Promise.resolve({ data: [], error: null }),
        methodIds.length
          ? supabase.from('manual_payment_methods').select('id,provider,label_ku').in('id', methodIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (postResult.error) throw postResult.error;
      if (bookingResult.error) throw bookingResult.error;
      if (methodResult.error) throw methodResult.error;
      setPostsById(Object.fromEntries((postResult.data ?? []).map((row: PostSummary) => [row.id, row])));
      setBookingsById(Object.fromEntries((bookingResult.data ?? []).map((row: BookingSummary) => [row.id, row])));
      setMethodsById(Object.fromEntries((methodResult.data ?? []).map((row: MethodSummary) => [row.id, row])));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا داواکارییەکانی پارەدان بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => filter === 'pending' ? submissions.filter((item) => item.status === 'pending_review') : submissions,
    [filter, submissions],
  );

  const showReceipt = async (submission: ManualPaymentSubmission) => {
    const cached = receiptUrls[submission.id];
    if (cached) {
      window.open(cached, '_blank', 'noopener,noreferrer');
      return;
    }
    setLoadingReceiptId(submission.id);
    setError(null);
    try {
      const url = await getPaymentReceiptUrl(submission.receipt_storage_path);
      setReceiptUrls((current) => ({ ...current, [submission.id]: url }));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا وەسڵەکە بکرێتەوە.');
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const review = async (submission: ManualPaymentSubmission, decision: 'approved' | 'rejected') => {
    setReviewingId(submission.id);
    setError(null);
    setMessage(null);
    try {
      await reviewManualPaymentSubmission({
        submissionId: submission.id,
        decision,
        adminNote: notes[submission.id] ?? '',
      });
      setMessage(decision === 'approved'
        ? 'پارەدان پەسەند کرا؛ پۆست بڵاوکرایەوە یان داواکاریی عومرە پشتڕاست کرایەوە.'
        : 'پارەدان ڕەتکرایەوە؛ تێبینییەکە بۆ بەکارهێنەر پاشەکەوت کرا.');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پشکنینی پارەدان سەرکەوتوو نەبوو.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <header className="rounded-2xl bg-white p-5 shadow-sm sm:rounded-[28px] sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex items-start gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><ShieldCheck size={22}/></div>
            <div>
              <p className="text-xs font-black text-[var(--shakh-blue)]">SUPER ADMIN · RECEIPT REVIEW</p>
              <h1 className="mt-1 text-2xl font-black">پشکنینی وەسڵەکانی پارەدان</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-black/55">پێش پەسەندکردن، وەسڵ، بڕی پارە، شێوازی پارەدان و زانیاریی داواکارییەکە بپشکنە. لە پەسەندکردندا پۆستی موڵک چالاک دەکرێت؛ داواکاریی عومرە دەگوازرێتەوە بۆ پشتڕاستکراو.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-black disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> نوێکردنەوە</button>
        </div>
      </header>

      <AuthFeedback error={error}/>
      {message ? <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-800">{message}</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3 sm:p-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setFilter('pending')} className={`min-h-10 rounded-xl px-4 text-sm font-black ${filter === 'pending' ? 'bg-[var(--shakh-navy)] text-white' : 'bg-[var(--shakh-bg)] text-black/55'}`}>چاوەڕوانی پشکنین ({submissions.filter((item) => item.status === 'pending_review').length})</button>
          <button type="button" onClick={() => setFilter('all')} className={`min-h-10 rounded-xl px-4 text-sm font-black ${filter === 'all' ? 'bg-[var(--shakh-navy)] text-white' : 'bg-[var(--shakh-bg)] text-black/55'}`}>هەموو ({submissions.length})</button>
        </div>
        <span className="text-xs font-bold text-black/40">تەنها بە permission ـی posts.manage</span>
      </div>

      {loading ? <div className="rounded-2xl bg-white p-10 text-center text-sm font-bold text-black/45"><LoaderCircle size={18} className="me-2 inline animate-spin"/>بارکردنی داواکارییەکان...</div> : null}
      {!loading && !visible.length ? <div className="rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center text-sm font-bold text-black/45">{filter === 'pending' ? 'هیچ وەسڵێکی چاوەڕوانی پشکنین نییە.' : 'هیچ داواکارییەکی پارەدان تۆمار نەکراوە.'}</div> : null}

      <div className="space-y-4">
        {visible.map((submission) => {
          const method = methodsById[submission.payment_method_id];
          const post = submission.post_id ? postsById[submission.post_id] : undefined;
          const booking = submission.booking_request_id ? bookingsById[submission.booking_request_id] : undefined;
          const pending = submission.status === 'pending_review';
          const title = submission.purpose === 'home_living_post_fee'
            ? post?.title ?? 'پۆستی ماڵ و ژیان'
            : 'داواکاریی حیجزی عومرە';
          return (
            <article key={submission.id} className="min-w-0 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:rounded-[26px] sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                    <span className="rounded-full bg-[var(--shakh-blue)]/10 px-3 py-1.5 text-[var(--shakh-blue)]">{submission.purpose === 'home_living_post_fee' ? 'کرێی پۆست' : 'حیجزی عومرە'}</span>
                    <span className={`rounded-full px-3 py-1.5 ${pending ? 'bg-amber-500/10 text-amber-800' : submission.status === 'approved' ? 'bg-emerald-500/10 text-emerald-800' : 'bg-red-500/10 text-red-700'}`}>{pending ? 'چاوەڕوانی پشکنین' : submission.status === 'approved' ? 'پەسەندکراو' : 'ڕەتکراوەتەوە'}</span>
                  </div>
                  <h2 className="mt-3 break-words text-lg font-black">{title}</h2>
                  <p className="mt-1 break-all text-xs text-black/40" dir="ltr">ID: {submission.id}</p>
                </div>
                <div className="shrink-0 rounded-xl bg-[var(--shakh-bg)] px-4 py-3 sm:text-end">
                  <div className="text-xs font-bold text-black/45">بڕی نێردراو</div>
                  <div className="mt-1 text-xl font-black">{Number(submission.amount_iqd).toLocaleString('en-US')} د.ع</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-[var(--shakh-bg)] p-3"><div className="text-[11px] font-bold text-black/45">شێوازی پارەدان</div><div className="mt-1 text-sm font-black">{method?.label_ku ?? providerLabels[submission.provider_snapshot] ?? submission.provider_snapshot}</div></div>
                <div className="rounded-xl bg-[var(--shakh-bg)] p-3"><div className="text-[11px] font-bold text-black/45">کاتی ناردن</div><div className="mt-1 text-sm font-black">{new Date(submission.created_at).toLocaleString('ku-IQ')}</div></div>
                <div className="rounded-xl bg-[var(--shakh-bg)] p-3"><div className="text-[11px] font-bold text-black/45">ژمارەی هەژماری نێردراو بۆی</div><div className="mt-1 break-all text-sm font-black" dir="ltr">{submission.account_identifier_snapshot}</div>{submission.account_holder_snapshot ? <div className="mt-1 text-xs text-black/45">خاوەنی هەژمار: {submission.account_holder_snapshot}</div> : null}</div>
                <div className="rounded-xl bg-[var(--shakh-bg)] p-3"><div className="text-[11px] font-bold text-black/45">بەکارهێنەر ID</div><div className="mt-1 break-all text-xs font-bold" dir="ltr">{submission.payer_id}</div></div>
              </div>

              {post ? <div className="mt-3 rounded-xl border border-black/[0.06] p-3 text-sm leading-6">
                <div className="text-xs font-bold text-black/45">زانیاریی پۆست</div>
                <div className="mt-1 font-black">{postCategoryLabels[post.category as PostCategory] ?? post.category} · {Number(post.price_iqd ?? 0).toLocaleString('en-US')} د.ع</div>
                <div className="text-xs text-black/45">بارودۆخ: {post.status === 'active' ? 'چالاک' : post.status === 'archived' ? 'چاوەڕوان/ئەرشیف' : post.status}</div>
              </div> : null}

              {booking ? <div className="mt-3 rounded-xl border border-black/[0.06] p-3 text-sm leading-6">
                <div className="text-xs font-bold text-black/45">زانیاریی حیجزی عومرە</div>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <div><span className="text-black/45">ناو:</span> <strong>{booking.customer_name}</strong></div>
                  <div><span className="text-black/45">تەلەفۆن:</span> <strong dir="ltr">{booking.customer_phone}</strong></div>
                  <div><span className="text-black/45">ژمارەی گەشتیاران:</span> <strong>{booking.traveler_count}</strong></div>
                  <div><span className="text-black/45">بەرواری مەبەست:</span> <strong>{booking.preferred_departure_date || 'دیاری نەکراوە'}</strong></div>
                  {booking.customer_note ? <div className="sm:col-span-2"><span className="text-black/45">تێبینی:</span> {booking.customer_note}</div> : null}
                </div>
              </div> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void showReceipt(submission)} disabled={loadingReceiptId === submission.id} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-black disabled:opacity-50">
                  {loadingReceiptId === submission.id ? <LoaderCircle size={16} className="animate-spin"/> : <FileCheck2 size={16}/>} بینینی وەسڵ
                </button>
                {receiptUrls[submission.id] ? <a href={receiptUrls[submission.id]} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-blue)]/10 px-4 py-2.5 text-sm font-black text-[var(--shakh-blue)]"><ExternalLink size={15}/> کردنەوەی وەسڵ</a> : null}
              </div>

              {submission.admin_note ? <div className={`mt-3 rounded-xl p-3 text-sm leading-6 ${submission.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-[var(--shakh-bg)] text-black/60'}`}>تێبینیی سوپەر ئەدمین: {submission.admin_note}</div> : null}

              {pending ? (
                <div className="mt-4 border-t border-black/[0.06] pt-4">
                  <label className="block text-xs font-black text-black/60">تێبینی بۆ بەکارهێنەر / هۆکاری ڕەتکردنەوە
                    <textarea value={notes[submission.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [submission.id]: event.target.value }))} maxLength={2000} rows={2} placeholder="ئەگەر وەسڵەکە کێشەی هەیە، ڕوونی بکەرەوە." className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm leading-6 outline-none focus:border-[var(--shakh-blue)]"/>
                  </label>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => void review(submission,'approved')} disabled={reviewingId !== null} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{reviewingId === submission.id ? <LoaderCircle size={16} className="animate-spin"/> : <Check size={17}/>} پەسەندکردن</button>
                    <button type="button" onClick={() => void review(submission,'rejected')} disabled={reviewingId !== null} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-50"><X size={17}/> ڕەتکردنەوە</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
