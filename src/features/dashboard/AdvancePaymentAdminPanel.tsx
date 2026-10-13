import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Save, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type FeeRow = { purpose: 'car_listing' | 'umrah_booking'; amount_iqd: number; is_enabled: boolean };
type Submission = {
  id: string; payer_id: string; purpose: 'car_listing' | 'umrah_booking'; post_id: string;
  amount_iqd: number; provider: string; transaction_reference: string; receipt_path: string;
  booking_details: { phone?: string; traveler_count?: number; note?: string };
  status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string;
  payer?: { full_name: string | null } | null;
  post?: { title: string } | null;
};

const labels = { car_listing: 'پۆستی ئۆتۆمبێل', umrah_booking: 'حەجزکردنی گەشتی عومرە' };

export function AdvancePaymentAdminPanel() {
  const [percent, setPercent] = useState('5');
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [rateResult, feeResult, paymentResult] = await Promise.all([
      supabase.from('platform_fee_settings').select('id,fee_percent').eq('id', 1).maybeSingle(),
      supabase.from('post_advance_fee_settings').select('purpose,amount_iqd,is_enabled').order('purpose'),
      supabase.from('advance_payment_submissions').select('id,payer_id,purpose,post_id,amount_iqd,provider,transaction_reference,receipt_path,booking_details,status,review_note,created_at,payer:profiles!advance_payment_submissions_payer_id_fkey(full_name),post:posts!advance_payment_submissions_post_id_fkey(title)').order('created_at', { ascending: false }).limit(100),
    ]);
    if (rateResult.error) setError(rateResult.error.message); else if (rateResult.data) setPercent(String(rateResult.data.fee_percent));
    if (feeResult.error) setError(feeResult.error.message); else setFees((feeResult.data ?? []) as FeeRow[]);
    if (paymentResult.error) setError(paymentResult.error.message); else setSubmissions((paymentResult.data ?? []) as unknown as Submission[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveSettings = async () => {
    setError(null); setMessage(null);
    const parsedPercent = Number(percent);
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) return setError('ڕێژە دەبێت لە ٠ تا ١٠٠ بێت.');
    for (const fee of fees) if (!Number.isFinite(Number(fee.amount_iqd)) || Number(fee.amount_iqd) < 0 || (fee.is_enabled && Number(fee.amount_iqd) <= 0)) return setError('بڕی پێشوەختە دەبێت لە صفر کەمتر نەبێت؛ بۆ چالاککردن بڕی لە سفر زیاتر دابنێ.');
    setBusyId('settings');
    const { error: rateError } = await supabase.from('platform_fee_settings').update({ fee_percent: parsedPercent }).eq('id', 1);
    if (rateError) { setError(rateError.message); setBusyId(null); return; }
    for (const fee of fees) {
      const { error: feeError } = await supabase.from('post_advance_fee_settings').update({ amount_iqd: Number(fee.amount_iqd), is_enabled: fee.is_enabled, updated_at: new Date().toISOString() }).eq('purpose', fee.purpose);
      if (feeError) { setError(feeError.message); setBusyId(null); return; }
    }
    setMessage('ڕێژە و کرێکان پاشەکەوت کران.');
    setBusyId(null);
    await refresh();
  };

  const review = async (item: Submission, approve: boolean) => {
    setBusyId(item.id); setError(null); setMessage(null);
    const { error: reviewError } = await supabase.rpc('review_advance_payment', { p_submission_id: item.id, p_approve: approve, p_review_note: approve ? null : 'وەسڵی پارەدان پشتڕاست نەکرایەوە.' });
    if (reviewError) setError(reviewError.message);
    else { setMessage(approve ? 'وەسڵ پەسەند کرا و پۆست/حەجز پشتڕاست کرایەوە.' : 'داواکارییەکە ڕەت کرایەوە.'); await refresh(); }
    setBusyId(null);
  };

  const openReceipt = async (path: string) => {
    const { data, error: receiptError } = await supabase.storage.from('advance-payment-receipts').createSignedUrl(path, 60);
    if (receiptError) setError(receiptError.message); else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return <section className="space-y-5 rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
    <div><div className="text-sm font-bold text-[var(--shakh-orange)]">تەنها سوپەر ئەدمین</div><h2 className="mt-1 text-xl font-black">ڕێژەی فرۆش و پارەی پێشوەختە</h2><p className="mt-2 text-sm leading-7 text-black/50">ڕێژەی فرۆش تەنها لە فرۆشتنی بازاڕدا بەکاردێت. ئۆتۆمبێل و حەجزکردنی عومرە کۆمیسیۆنی فرۆشیان نییە؛ تەنها پارەی پێشوەختەیان هەیە.</p></div>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
    {message ? <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</div> : null}
    {loading ? <p className="text-sm text-black/45">بارکردن...</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold">ڕێژەی کۆمیسیۆنی فرۆش (%)<input className="mt-2 h-12 w-full rounded-xl border border-black/10 px-3" type="number" min="0" max="100" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} /></label>
        {fees.map((fee) => <div key={fee.purpose} className="rounded-2xl bg-[var(--shakh-bg)] p-4"><label className="block text-sm font-bold">{fee.purpose === 'car_listing' ? 'کرێی پۆستکردنی ئۆتۆمبێل' : 'بڕی پێشوەختەی حەجزکردنی عومرە'} (د.ع)<input className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3" type="number" min="0" step="1" value={fee.amount_iqd} onChange={(e) => setFees((rows) => rows.map((row) => row.purpose === fee.purpose ? { ...row, amount_iqd: Number(e.target.value) } : row))} /></label><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={fee.is_enabled} onChange={(e) => setFees((rows) => rows.map((row) => row.purpose === fee.purpose ? { ...row, is_enabled: e.target.checked } : row))} />دابنێ وەک کرێی چالاک</label></div>)}
      </div>
      <button type="button" onClick={() => void saveSettings()} disabled={busyId === 'settings'} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{busyId === 'settings' ? 'پاشەکەوتکردن...' : 'پاشەکەوتکردنی ڕێژەکان'}</button>
      <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">FIB و FastPay هێشتا ناچالاکن؛ چالاککردنیان هیچ کاتێک خۆکار نییە و بە داواکاریی تۆ پێویستە.</p>
    </>}
    <div className="border-t border-black/[0.06] pt-5"><h3 className="font-black">پشکنینی وەسڵەکان</h3>{loading ? null : submissions.length === 0 ? <p className="mt-3 text-sm text-black/45">هێشتا وەسڵێک بۆ پشکنین نییە.</p> : <div className="mt-3 space-y-3">{submissions.map((item) => <article key={item.id} className="rounded-2xl border border-black/[0.07] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{labels[item.purpose]}</strong><div className="mt-1 text-sm text-black/55">{item.post?.title ?? 'پۆستی سڕاوە'} · {item.payer?.full_name ?? item.payer_id}</div><div className="mt-1 text-xs text-black/45">{item.provider.toUpperCase()} · کۆدی مامەڵە: {item.transaction_reference} · {new Date(item.created_at).toLocaleString()}</div>{item.purpose === 'umrah_booking' ? <div className="mt-1 text-xs text-black/55">مۆبایل: {item.booking_details.phone ?? '—'} · ژمارەی گەشتیاران: {item.booking_details.traveler_count ?? '—'} {item.booking_details.note ? `· ${item.booking_details.note}` : ''}</div> : null}<strong className="mt-2 block">{Number(item.amount_iqd).toLocaleString('en-US')} د.ع</strong></div><button type="button" onClick={() => void openReceipt(item.receipt_path)} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-black"><ExternalLink size={15}/> بینینی وەسڵ</button></div>{item.status === 'pending' ? <div className="mt-4 flex gap-2"><button type="button" onClick={() => void review(item,true)} disabled={busyId === item.id} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Check size={16}/> پەسەندکردن</button><button type="button" onClick={() => void review(item,false)} disabled={busyId === item.id} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><X size={16}/> ڕەتکردنەوە</button></div> : <div className="mt-3 text-sm font-bold text-black/55">{item.status === 'approved' ? 'پەسەندکراوە' : `ڕەتکراوەتەوە${item.review_note ? `: ${item.review_note}` : ''}`}</div>}</article>)}</div>}</div>
  </section>;
}

