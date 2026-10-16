import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Upload, WalletCards, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getActiveManualPaymentMethods, getLatestManualPaymentForPost, submitManualPayment, type ManualPaymentMethod, type ManualPaymentSubmission } from '../manualPayments';
import type { Post } from '../types';

type Props = {
  post: Post;
};

const receiptMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function postingFee(post: Post): number {
  const kind = String(post.category_details?.listing_kind ?? '');
  return kind === 'property' ? 5000 : kind === 'furniture' ? 2000 : 0;
}

export function HomeLivingPaymentStatusPanel({ post }: Props) {
  const [submission, setSubmission] = useState<ManualPaymentSubmission | null>(null);
  const [methods, setMethods] = useState<ManualPaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fee = postingFee(post);
  const canResubmit = post.status === 'archived' && (!submission || submission.status === 'rejected');

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      setLoading(true);
      setError(null);
      try {
        const latest = await getLatestManualPaymentForPost(post.id);
        if (cancelled) return;
        setSubmission(latest);
        if (post.status === 'archived' && (!latest || latest.status === 'rejected')) {
          const availableMethods = await getActiveManualPaymentMethods();
          if (cancelled) return;
          setMethods(availableMethods);
          setSelectedMethodId((current) => current || availableMethods[0]?.id || '');
        }
      } catch (nextError) {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'نەتوانرا دۆخی پارەدان بخوێندرێتەوە.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadStatus();
    return () => { cancelled = true; };
  }, [post.id, post.status]);

  const resubmit = async () => {
    if (busy) return;
    if (!fee) return setError('کرێی پۆست لە داتادا دروست نییە.');
    if (!methods.some((method) => method.id === selectedMethodId)) {
      return setError(methods.length ? 'شێوازی پارەدان هەڵبژێرە.' : 'سوپەر ئەدمین هێشتا ژمارەکانی پارەدان چالاک نەکردووە.');
    }
    if (!receipt || !receiptMimeTypes.includes(receipt.type) || receipt.size <= 0 || receipt.size > 5 * 1024 * 1024) {
      return setError('وەسڵێکی دروست هەڵبژێرە: JPG، PNG، WebP یان PDF تا ٥ مێگابایت.');
    }
    setBusy(true);
    setError(null);
    try {
      const nextSubmission = await submitManualPayment({
        purpose: 'home_living_post_fee',
        targetId: post.id,
        paymentMethodId: selectedMethodId,
        amountIqd: fee,
        receiptFile: receipt,
      });
      setSubmission(nextSubmission);
      setReceipt(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'دووبارە ناردنی وەسڵ سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="mt-4 rounded-xl bg-[var(--shakh-bg)] p-4 text-sm font-bold text-black/45"><LoaderCircle size={16} className="me-2 inline animate-spin"/>پشکنینی دۆخی پارەدان...</div>;
  }

  if (!submission && post.status === 'active') return null;
  if (!submission && !canResubmit) return null;

  return (
    <section className="mt-5 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:rounded-[24px] sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${submission?.status === 'approved' ? 'bg-emerald-500/10 text-emerald-700' : submission?.status === 'rejected' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-800'}`}>
          {submission?.status === 'approved' ? <CheckCircle2 size={20}/> : submission?.status === 'rejected' ? <XCircle size={20}/> : <Clock3 size={20}/>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black">دۆخی پارەدانی پۆست</h2>
          {submission?.status === 'pending_review' ? <p className="mt-1 text-sm leading-6 text-amber-800">وەسڵ نێردراوە و چاوەڕوانی پشکنینی سوپەر ئەدمینە. پۆستەکە تا پەسەندکردنی پارەدان بڵاو ناکرێتەوە.</p> : null}
          {submission?.status === 'approved' ? <p className="mt-1 text-sm leading-6 text-emerald-800">پارەدان پەسەند کراوە. پۆستەکەت بڵاوکراوەتەوە.</p> : null}
          {submission?.status === 'rejected' ? <p className="mt-1 text-sm leading-6 text-red-800">وەسڵەکە ڕەتکرایەوە. تێبینیی سوپەر ئەدمین بخوێنەوە و پاش ڕاستکردنەوەی کێشەکە وەسڵی نوێ بنێرەوە.</p> : null}
          {!submission ? <p className="mt-1 text-sm leading-6 text-black/55">پۆستەکە هێشتا وەسڵی پارەدانی پەسەندکراوی نییە؛ ژمارەی پارەدان هەڵبژێرە و وەسڵ بنێرە.</p> : null}
        </div>
      </div>

      {submission ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-[var(--shakh-bg)] p-3"><div className="text-[11px] text-black/45">بڕی پارە</div><div className="mt-1 font-black">{Number(submission.amount_iqd).toLocaleString('en-US')} د.ع</div></div>
          <div className="rounded-xl bg-[var(--shakh-bg)] p-3"><div className="text-[11px] text-black/45">ژمارەی هەژماری نێردراو بۆی</div><div className="mt-1 break-all font-black" dir="ltr">{submission.account_identifier_snapshot}</div></div>
        </div>
      ) : null}
      {submission?.account_holder_snapshot ? <p className="mt-2 text-xs leading-5 text-black/45">خاوەنی هەژمار: {submission.account_holder_snapshot}</p> : null}
      {submission?.admin_note ? <div className={`mt-3 rounded-xl p-3 text-sm leading-6 ${submission.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-[var(--shakh-bg)] text-black/60'}`}>تێبینیی سوپەر ئەدمین: {submission.admin_note}</div> : null}

      {canResubmit ? (
        <div className="mt-4 space-y-3 border-t border-black/[0.06] pt-4">
          <div className="rounded-xl bg-[var(--shakh-orange)]/[0.07] p-3">
            <div className="text-xs font-bold text-black/45">کرێی پۆستکردن</div>
            <div className="mt-1 text-xl font-black text-[var(--shakh-orange)]">{fee.toLocaleString('en-US')} د.ع</div>
          </div>
          {methods.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((method) => (
                <button key={method.id} type="button" aria-pressed={selectedMethodId === method.id} onClick={() => setSelectedMethodId(method.id)} className={`min-w-0 rounded-xl border p-3 text-start ${selectedMethodId === method.id ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/[0.06]' : 'border-black/10 bg-white'}`}>
                  <div className="text-sm font-black">{method.label_ku}</div>
                  <div className="mt-2 break-all text-sm font-black" dir="ltr">{method.account_identifier}</div>
                  {method.account_holder ? <div className="mt-1 text-xs text-black/45">{method.account_holder}</div> : null}
                </button>
              ))}
            </div>
          ) : <p className="text-sm leading-6 text-amber-800">سوپەر ئەدمین هێشتا ژمارەی پارەدان چالاک نەکردووە.</p>}
          <label className="block text-xs font-black text-black/60">وەسڵی نوێ / سکرین‌شۆتی پارەدان
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; if (file && (!receiptMimeTypes.includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024)) { setError('وەسڵ دەبێت JPG، PNG، WebP یان PDF بێت و لە ٥ مێگابایت زیاتر نەبێت.'); setReceipt(null); event.currentTarget.value = ''; return; } setReceipt(file); setError(null); }} className="mt-2 block min-h-12 w-full rounded-xl border border-dashed border-black/20 bg-white px-3 py-3 text-sm"/>
            {receipt ? <span className="mt-1 block break-all text-[11px] text-black/45">{receipt.name}</span> : null}
          </label>
          {error ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
          <button type="button" onClick={() => void resubmit()} disabled={busy || !methods.length} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? <LoaderCircle size={16} className="animate-spin"/> : submission ? <RefreshCw size={16}/> : <Upload size={16}/>} {busy ? 'ناردنی وەسڵ...' : 'ناردن بۆ پشکنینی سوپەر ئەدمین'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
