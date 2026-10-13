import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ReceiptText } from 'lucide-react';
import { AuthCard, AuthPageShell, Field, inputClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthContext';

type Purpose = 'car_listing' | 'umrah_booking';
type Provider = 'fib' | 'fastpay';
type RequestPost = { id: string; title: string; category: string; author_id: string; status: string };
type FeeSetting = { purpose: Purpose; amount_iqd: number; is_enabled: boolean };
type Submission = { id: string; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; provider: Provider; amount_iqd: number };

const formatIQD = (amount: number) => `${Math.round(amount).toLocaleString('en-US')} د.ع`;

export function AdvancePaymentPage() {
  const { postId = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const purpose = (search.get('purpose') === 'umrah_booking' ? 'umrah_booking' : 'car_listing') as Purpose;
  const [post, setPost] = useState<RequestPost | null>(null);
  const [fee, setFee] = useState<FeeSetting | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [provider, setProvider] = useState<Provider | ''>('');
  const [transactionReference, setTransactionReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [phone, setPhone] = useState('');
  const [travelerCount, setTravelerCount] = useState('1');
  const [travelNote, setTravelNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const [postResult, feeResult, providerResult, submissionResult] = await Promise.all([
        supabase.from('posts').select('id,title,category,author_id,status').eq('id', postId).maybeSingle(),
        supabase.from('post_advance_fee_settings').select('purpose,amount_iqd,is_enabled').eq('purpose', purpose).maybeSingle(),
        supabase.rpc('get_enabled_advance_payment_providers'),
        supabase.from('advance_payment_submissions').select('id,status,review_note,provider,amount_iqd').eq('post_id', postId).eq('purpose', purpose).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      if (postResult.error) setError(postResult.error.message);
      else setPost(postResult.data as RequestPost | null);
      if (feeResult.error) setError(feeResult.error.message);
      else setFee(feeResult.data as FeeSetting | null);
      if (providerResult.error) setError(providerResult.error.message);
      else setProviders((providerResult.data ?? []).map((row: { provider: Provider }) => row.provider));
      if (submissionResult.error) setError(submissionResult.error.message);
      else setSubmission(submissionResult.data as Submission | null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [postId, purpose]);

  const validContext = post && (purpose === 'car_listing'
    ? post.category === 'cars' && post.author_id === user?.id && (post.status === 'archived' || submission?.status === 'approved')
    : post.category === 'umrah' && post.author_id !== user?.id && post.status === 'active');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !post || !fee || !provider || !receipt || busy) return;
    setError(null);
    if (!fee.is_enabled || Number(fee.amount_iqd) <= 0) return setError('کرێی پێشوەختە هێشتا لەلایەن سوپەر ئەدمینەوە ڕێکنەخراوە.');
    if (receipt.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(receipt.type)) {
      return setError('وەسڵ دەبێت JPG، PNG، WebP یان PDF بێت و لە ٥MB کەمتر بێت.');
    }
    if (purpose === 'umrah_booking' && (!phone.trim() || !/^\+?[0-9\s()-]{7,24}$/.test(phone.trim()) || !Number.isInteger(Number(travelerCount)) || Number(travelerCount) < 1 || Number(travelerCount) > 20)) {
      return setError('ژمارەی مۆبایل و ژمارەی گەشتیاران بە دروستی بنووسە.');
    }
    setBusy(true);
    let path = '';
    try {
      const ext = receipt.type === 'application/pdf' ? 'pdf' : receipt.type.split('/')[1];
      path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('advance-payment-receipts').upload(path, receipt, { contentType: receipt.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('advance_payment_submissions').insert({
        payer_id: user.id,
        purpose,
        post_id: post.id,
        amount_iqd: Number(fee.amount_iqd),
        provider,
        transaction_reference: transactionReference.trim(),
        receipt_path: path,
        booking_details: purpose === 'umrah_booking' ? { phone: phone.trim(), traveler_count: Number(travelerCount), note: travelNote.trim() } : {},
      });
      if (insertError) throw insertError;
      setSaved(true);
      setSubmission({ id: crypto.randomUUID(), status: 'pending', review_note: null, provider, amount_iqd: Number(fee.amount_iqd) });
    } catch (nextError) {
      if (path) await supabase.storage.from('advance-payment-receipts').remove([path]);
      setError(nextError instanceof Error ? nextError.message : 'ناردنی وەسڵ سەرکەوتوو نەبوو.');
    } finally { setBusy(false); }
  };

  const statusLabel = submission?.status === 'approved' ? 'پەسەند کراوە' : submission?.status === 'rejected' ? 'ڕەت کراوەتەوە' : 'لە چاوەڕوانی پشکنینە';

  if (loading) return <AuthPageShell><AuthCard title="پارەی پێشوەختە" description="زانیارییەکان بار دەکرێن..."><div className="h-10" /></AuthCard></AuthPageShell>;
  if (!validContext) return <AuthPageShell><AuthCard title="داواکاری بەردەست نییە" description="پۆستەکە یان داواکارییەکە نەدۆزرایەوە یان دەسەڵاتی بینینت نییە."><button type="button" onClick={() => navigate('/posts')} className="mt-4 flex items-center gap-2 font-bold"><ArrowRight size={16}/> گەڕانەوە بۆ پۆستەکان</button></AuthCard></AuthPageShell>;

  return <AuthPageShell><AuthCard title={purpose === 'car_listing' ? 'پارەی پێشوەختەی پۆستی ئۆتۆمبێل' : 'داواکاریی حەجزکردنی گەشتی عومرە'} description={post.title}>
    <AuthFeedback error={error}/>
    {submission && submission.status !== 'rejected' ? <div className={`mb-4 rounded-2xl p-4 text-sm leading-7 ${submission.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><strong>{statusLabel}</strong>{submission.review_note ? <div>{submission.review_note}</div> : null}{submission.status === 'pending' ? <div>سوپەر ئەدمین وەسڵ و داواکارییەکەت دەپشکنێت.</div> : null}</div>
      : <form onSubmit={submit} className="space-y-4">
        {submission?.status === 'rejected' ? <div className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-800">وەسڵی پێشووتر ڕەت کرایەوە{submission.review_note ? `: ${submission.review_note}` : ''}. دەتوانیت وەسڵی دروست دووبارە بنێریت.</div> : null}
        <div className="flex items-center justify-between rounded-2xl bg-[var(--shakh-bg)] p-4"><span className="text-sm font-bold">بڕی پێشوەختە</span><strong dir="ltr">{fee?.amount_iqd ? formatIQD(Number(fee.amount_iqd)) : 'ڕێکنەخراوە'}</strong></div>
        {purpose === 'umrah_booking' ? <div className="grid gap-4 sm:grid-cols-2"><Field label="ژمارەی مۆبایل"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" /></Field><Field label="ژمارەی گەشتیاران"><input className={inputClass} type="number" min="1" max="20" value={travelerCount} onChange={(e) => setTravelerCount(e.target.value)} required /></Field><Field label="تێبینی"><input className={inputClass} value={travelNote} onChange={(e) => setTravelNote(e.target.value)} maxLength={300} placeholder="کاتی گەشت یان داواکارییەک" /></Field></div> : null}
        <Field label="شێوازی پارەدان"><select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value as Provider)} required disabled={!providers.length}><option value="">هەڵبژێرە</option>{providers.map((p) => <option key={p} value={p}>{p === 'fib' ? 'FIB' : 'FastPay'}</option>)}</select></Field>
        <Field label="ژمارەی مامەڵە"><input className={inputClass} value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} required minLength={3} maxLength={120} /></Field>
        <Field label="وەسڵی پارەدان"><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} required/><span className="mt-1 block text-xs text-black/45">JPG، PNG، WebP یان PDF؛ زۆرترین ٥MB.</span></Field>
        {!providers.length ? <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">FIB و FastPay ناچالاکن. لە کاتی چالاککردنی شێوازی پارەدان، دەتوانیت وەسڵ بنێریت.</p> : null}
        {!fee?.is_enabled || Number(fee.amount_iqd) <= 0 ? <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">بڕی پارەی پێشوەختە لەلایەن سوپەر ئەدمینەوە دانەنراوە؛ ناردنی پارە تا ئەو کاتە ناچالاکە.</p> : null}
        <button type="submit" disabled={busy || !providers.length || !fee?.is_enabled || Number(fee?.amount_iqd) <= 0} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><ReceiptText size={17}/>{busy ? 'ناردن...' : purpose === 'car_listing' ? 'ناردنی وەسڵ بۆ پەسەندکردن' : 'ناردنی حەجز و وەسڵ'}</button>
      </form>}
    {saved ? <div role="status" className="mt-3 text-sm font-bold text-emerald-700">وەسڵەکەت نێردرا؛ دوای پشکنینی سوپەر ئەدمین ئەنجامەکە لێرە دەبینیت.</div> : null}
  </AuthCard></AuthPageShell>;
}

