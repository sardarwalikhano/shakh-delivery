import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { BadgeCheck, Banknote, CheckCircle2, Clock3, FileText, RefreshCw, ShieldCheck, Upload, WalletCards, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { supabase } from '@/lib/supabase/client';

type WalletTx = {
  id: string;
  transaction_type: string;
  amount_iqd: number | string;
  balance_after_iqd: number | string;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  created_at: string;
};

type TopupRequest = {
  id: string;
  request_id?: string;
  user_id: string;
  amount_iqd: number | string;
  payment_method: string;
  receipt_path: string;
  user_note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

type CashTransaction = {
  id: string;
  transaction_type: string;
  amount_iqd: number | string;
  outstanding_after_iqd: number | string;
  reference_type: string | null;
  reference_id: string | null;
  proof_path: string | null;
  note: string | null;
  created_at: string;
};

type Summary = {
  prepaid_wallet: { balance_iqd: number | string; lifetime_credited_iqd: number | string; lifetime_debited_iqd: number | string };
  captain_cash: { outstanding_iqd: number | string; lifetime_collected_iqd: number | string; lifetime_settled_iqd: number | string };
  today: { orders_count: number | string; gross_delivery_fee_iqd: number | string; captain_fee_iqd: number | string; net_captain_earning_iqd: number | string };
  transactions: WalletTx[];
  topups: TopupRequest[];
  cash_transactions: CashTransaction[];
};

type FeeRule = {
  post_category: string;
  customer_platform_fee_iqd: number | string;
  seller_fee_per_item_iqd: number | string;
  captain_delivery_percent: number | string;
  is_active: boolean;
};

type CashAccount = { user_id: string; outstanding_iqd: number | string; lifetime_collected_iqd: number | string; lifetime_settled_iqd: number | string; name?: string | null; phone?: string | null };
type WalletAccount = { user_id: string; balance_iqd: number | string; lifetime_credited_iqd: number | string; lifetime_debited_iqd: number | string };

const emptySummary: Summary = {
  prepaid_wallet: { balance_iqd: 0, lifetime_credited_iqd: 0, lifetime_debited_iqd: 0 },
  captain_cash: { outstanding_iqd: 0, lifetime_collected_iqd: 0, lifetime_settled_iqd: 0 },
  today: { orders_count: 0, gross_delivery_fee_iqd: 0, captain_fee_iqd: 0, net_captain_earning_iqd: 0 },
  transactions: [], topups: [], cash_transactions: [],
};

const categoryLabels: Record<string, string> = {
  food: 'چێشتخانە', fashion: 'جل‌وبەرگ', electronics: 'ئەلیکترۆنیات', general: 'بازاڕی گشتی',
  supermarket: 'سوپەرمارکێت', beauty: 'جوانکاری', kids: 'منداڵان', online_stores: 'فرۆشگای ئۆنلاین', delivery: 'گەیاندن',
};
const methodLabels: Record<string, string> = { fastpay: 'FastPay', fib: 'FIB', mobile_cash: 'Mobile Cash', zain_cash: 'ZainCash', bank_transfer: 'گواستنەوەی بانکی' };
const statusLabels: Record<string, string> = { pending: 'چاوەڕوانی پشکنین', approved: 'پەسەندکرا', rejected: 'ڕەتکرایەوە' };
const transactionLabels: Record<string, string> = {
  topup_credit: 'پڕکردنەوەی جزدان', seller_item_fee: 'کۆمسیۆنی فرۆشتنی بەرهەم',
  share_reward_debit: 'خەڵاتی Share کەمکرایەوە', captain_delivery_fee: 'کۆمسیۆنی گەیاندن',
  adjustment_credit: 'زیادکردنی ڕاستکردنەوە', adjustment_debit: 'کەمکردنەوەی ڕاستکردنەوە',
};

function n(value: number | string | null | undefined): number { return Number(value ?? 0); }
function iqd(value: number | string | null | undefined): string { return Math.round(n(value)).toLocaleString('en-US') + ' د.ع'; }
function date(value: string | null | undefined): string { return value ? new Date(value).toLocaleString('ku-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
function fileExtension(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'application/pdf') return 'pdf';
  return 'jpg';
}
function validateProof(file: File): void {
  if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw new Error('بەڵگە دەبێت JPG، PNG، WebP یان PDF بێت.');
  if (file.size > 10 * 1024 * 1024) throw new Error('قەبارەی بەڵگە نابێت لە ١٠MB زیاتر بێت.');
}

export function WalletFinancePage() {
  const { user } = useAuth();
  const { roles, permissions } = useAuthorization();
  const isFinanceAdmin = permissions.has('wallets.manage');
  const canTopUp = permissions.has('wallets.topup_request');
  const isCaptain = roles.includes('captain');
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [topupQueue, setTopupQueue] = useState<TopupRequest[]>([]);
  const [feeRules, setFeeRules] = useState<FeeRule[]>([]);
  const [feeDrafts, setFeeDrafts] = useState<Record<string, { customer: string; seller: string; captain: string }>>({});
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [walletAccounts, setWalletAccounts] = useState<WalletAccount[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; phone: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('fastpay');
  const [topupNote, setTopupNote] = useState('');
  const [topupProof, setTopupProof] = useState<File | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [selectedCaptain, setSelectedCaptain] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [settlementProof, setSettlementProof] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_wallet_finance_summary');
      if (summaryError) throw summaryError;
      setSummary({ ...emptySummary, ...(summaryData as Partial<Summary> ?? {}) });

      if (isFinanceAdmin) {
        const [topups, fees, cash, accountRows, topupUsers] = await Promise.all([
          supabase.from('prepaid_wallet_topup_requests').select('id,request_id,user_id,amount_iqd,payment_method,receipt_path,user_note,status,admin_note,requested_at,reviewed_at').order('requested_at', { ascending: false }).limit(100),
          supabase.from('post_finance_fee_rules').select('post_category,customer_platform_fee_iqd,seller_fee_per_item_iqd,captain_delivery_percent,is_active').order('post_category'),
          supabase.from('captain_cash_accounts').select('user_id,outstanding_iqd,lifetime_collected_iqd,lifetime_settled_iqd').gt('outstanding_iqd', 0).order('outstanding_iqd', { ascending: false }).limit(100),
          supabase.from('prepaid_wallet_accounts').select('user_id,balance_iqd,lifetime_credited_iqd,lifetime_debited_iqd').order('balance_iqd', { ascending: false }).limit(100),
          supabase.from('prepaid_wallet_topup_requests').select('user_id').order('requested_at', { ascending: false }).limit(100),
        ]);
        if (topups.error) throw topups.error;
        if (fees.error) throw fees.error;
        if (cash.error) throw cash.error;
        if (accountRows.error) throw accountRows.error;
        if (topupUsers.error) throw topupUsers.error;
        const nextFees = (fees.data ?? []) as FeeRule[];
        setFeeRules(nextFees);
        setFeeDrafts((current) => {
          const next = { ...current };
          for (const rule of nextFees) if (!next[rule.post_category]) next[rule.post_category] = {
            customer: String(rule.customer_platform_fee_iqd), seller: String(rule.seller_fee_per_item_iqd), captain: String(rule.captain_delivery_percent),
          };
          return next;
        });
        setTopupQueue((topups.data ?? []) as TopupRequest[]);
        setCashAccounts((cash.data ?? []) as CashAccount[]);
        setWalletAccounts((accountRows.data ?? []) as WalletAccount[]);
        const ids = [...new Set([...(accountRows.data ?? []).map((row) => row.user_id as string), ...(topupUsers.data ?? []).map((row) => row.user_id as string), ...(cash.data ?? []).map((row) => row.user_id as string)])];
        if (ids.length) {
          const { data: people, error: peopleError } = await supabase.from('profiles').select('id,full_name,phone').in('id', ids);
          if (peopleError) throw peopleError;
          setProfiles(Object.fromEntries((people ?? []).map((row) => [row.id as string, { full_name: row.full_name as string | null, phone: row.phone as string | null }])));
        } else setProfiles({});
      } else {
        setTopupQueue([]);
        setFeeRules([]);
        setCashAccounts([]);
        setWalletAccounts([]);
        setProfiles({});
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا زانیاریی جزدان بخوێندرێتەوە.');
    } finally {
      setLoading(false);
    }
  }, [isFinanceAdmin, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const pendingTopups = useMemo(() => topupQueue.filter((item) => item.status === 'pending'), [topupQueue]);

  const upload = async (file: File, path: string): Promise<string> => {
    validateProof(file);
    const { error: uploadError } = await supabase.storage.from('wallet-proofs').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;
    return path;
  };

  const submitTopup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null); setMessage(null);
    const requestedAmount = Number(amount.replace(/,/g, ''));
    if (!Number.isInteger(requestedAmount) || requestedAmount <= 0) { setError('بڕی پڕکردنەوە دەبێت ژمارەیەکی تەواوی لە سفر زیاتر بێت.'); return; }
    if (!topupProof || !user) { setError('بەڵگەنامەی پارەدان بار بکە.'); return; }
    setBusy(true);
    try {
      const requestId = crypto.randomUUID();
      const path = await upload(topupProof, 'topups/' + user.id + '/' + requestId + '.' + fileExtension(topupProof));
      const { error: requestError } = await supabase.rpc('request_prepaid_wallet_topup', {
        p_request_id: requestId, p_amount_iqd: requestedAmount, p_payment_method: paymentMethod,
        p_receipt_path: path, p_user_note: topupNote.trim() || null,
      });
      if (requestError) throw requestError;
      setAmount(''); setTopupNote(''); setTopupProof(null);
      setMessage('داواکاریی پڕکردنەوە نێردرا؛ دوای پشکنینی سوپەر ئەدمین باڵانس زیاد دەکرێت.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ناردنی داواکاریی پڕکردنەوە سەرکەوتوو نەبوو.');
    } finally { setBusy(false); }
  };

  const reviewTopup = async (request: TopupRequest, action: 'approve' | 'reject') => {
    setBusyRow(request.id); setError(null); setMessage(null);
    try {
      const { error: reviewError } = await supabase.rpc('review_prepaid_wallet_topup', {
        p_request_id: request.id, p_action: action, p_admin_note: adminNotes[request.id]?.trim() || null,
      });
      if (reviewError) throw reviewError;
      setMessage(action === 'approve' ? 'جزدانەکە پڕکرایەوە و مامەڵەکە تۆمار کرا.' : 'داواکاریی پڕکردنەوە ڕەتکرایەوە.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پشکنینی داواکاری سەرنەکەوت.');
    } finally { setBusyRow(null); }
  };

  const openProof = async (path: string) => {
    setError(null);
    try {
      const { data, error: linkError } = await supabase.storage.from('wallet-proofs').createSignedUrl(path, 900);
      if (linkError) throw linkError;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'نەتوانرا بەڵگەنامە بکڕێتەوە.'); }
  };

  const saveFeeRule = async (rule: FeeRule) => {
    const draft = feeDrafts[rule.post_category];
    if (!draft) return;
    const customer = Number(draft.customer);
    const seller = Number(draft.seller);
    const captain = Number(draft.captain);
    if (![customer,seller,captain].every(Number.isFinite) || !Number.isInteger(customer) || customer < 0 || !Number.isInteger(seller) || seller < 0 || captain < 0 || captain > 100) {
      setError('نرخی کڕیار و فرۆشیار دەبێت ژمارەی تەواو و ڕێژەی کاپتن لە ٠ تا ١٠٠٪ بێت.'); return;
    }
    setBusyRow('fee:' + rule.post_category); setError(null); setMessage(null);
    try {
      const { error: saveError } = await supabase.rpc('update_post_finance_fee_rule', {
        p_post_category: rule.post_category, p_customer_platform_fee_iqd: customer,
        p_seller_fee_per_item_iqd: seller, p_captain_delivery_percent: captain,
      });
      if (saveError) throw saveError;
      setMessage('یاسای داراییی ئەم category ـە نوێکرایەوە. بۆ ئۆردەری نوێ جێبەجێ دەبێت.');
      await refresh();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'نوێکردنەوەی یاسای دارایی سەرکەوتوو نەبوو.'); }
    finally { setBusyRow(null); }
  };

  const submitSettlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null); setMessage(null);
    const amountToSettle = Number(settlementAmount.replace(/,/g, ''));
    const account = cashAccounts.find((item) => item.user_id === selectedCaptain);
    if (!selectedCaptain || !account) { setError('کاپتنی دروست هەڵبژێرە.'); return; }
    if (!Number.isInteger(amountToSettle) || amountToSettle <= 0 || amountToSettle > n(account.outstanding_iqd)) { setError('بڕی گەڕاندنەوە دەبێت لە ١ دینار زیاتر و لە پارەی ماوە زیاتر نەبێت.'); return; }
    if (!settlementProof) { setError('بەڵگەی وەرگرتنی پارەی کاش بار بکە.'); return; }
    setBusy(true);
    try {
      const requestId = crypto.randomUUID();
      const path = await upload(settlementProof, 'cash-settlements/' + selectedCaptain + '/' + requestId + '/' + requestId + '.' + fileExtension(settlementProof));
      const { error: settleError } = await supabase.rpc('settle_captain_cash', {
        p_request_id: requestId, p_captain_id: selectedCaptain, p_amount_iqd: amountToSettle,
        p_proof_path: path, p_note: settlementNote.trim() || null,
      });
      if (settleError) throw settleError;
      setSettlementAmount(''); setSettlementNote(''); setSettlementProof(null);
      setMessage('وەرگرتنی پارەی کاش تۆمار کرا؛ تەنها بڕی گەڕێندراوە کەمکرایەوە.');
      await refresh();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'تۆمارکردنی پارەی کاش سەرنەکەوت.'); }
    finally { setBusy(false); }
  };

  const formatAccountName = (id: string) => profiles[id]?.full_name || profiles[id]?.phone || id;
  const inputClass = 'w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--shakh-orange)]';
  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2.5 text-xs font-black text-white disabled:opacity-50';

  return (
    <section className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] px-4 py-7 sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[28px] bg-[var(--shakh-navy)] p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="text-xs font-black text-white/55">SHAKH · FINANCE</div><h1 className="mt-2 text-3xl font-black sm:text-4xl">جزدان و حیسابی دارایی</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-white/65">جزدانی پریپەید، خەڵاتی Share و پارەی کاشی کاپتن بە تۆماری ڕاستەقینە و بەڵگەنامەی پارەدان بەڕێوە دەبرێن.</p></div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-black hover:bg-white/15 disabled:opacity-50"><RefreshCw size={15}/> نوێکردنەوە</button>
          </div>
        </header>

        {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat title="باڵانسی پریپەید" value={iqd(summary.prepaid_wallet.balance_iqd)} icon={<WalletCards size={19}/>} />
          <Stat title="کۆی پڕکردنەوەکان" value={iqd(summary.prepaid_wallet.lifetime_credited_iqd)} icon={<CheckCircle2 size={19}/>} />
          {isCaptain ? <Stat title="پارەی کاشی ماوە" value={iqd(summary.captain_cash.outstanding_iqd)} icon={<Banknote size={19}/>} warn={n(summary.captain_cash.outstanding_iqd)>0}/> : <Stat title="کۆی کۆمسیۆنەکان" value={iqd(summary.prepaid_wallet.lifetime_debited_iqd)} icon={<ShieldCheck size={19}/>} />}
          {isCaptain ? <Stat title="قازانجی خالصی ئەمڕۆ" value={iqd(summary.today.net_captain_earning_iqd)} icon={<BadgeCheck size={19}/>} /> : <Stat title="کۆی دەرهێنان" value={iqd(summary.prepaid_wallet.lifetime_debited_iqd)} icon={<Clock3 size={19}/>} />}
        </div>

        {isCaptain ? <section className="grid gap-3 md:grid-cols-3">
          <Stat title="ژمارەی گەیاندنی ئەمڕۆ" value={n(summary.today.orders_count).toLocaleString('en-US')} icon={<CheckCircle2 size={19}/>} />
          <Stat title="کۆی کرێی گەیاندنی ئەمڕۆ" value={iqd(summary.today.gross_delivery_fee_iqd)} icon={<Banknote size={19}/>} />
          <Stat title="کۆمسیۆنی شاخ لە ئەمڕۆ" value={iqd(summary.today.captain_fee_iqd)} icon={<ShieldCheck size={19}/>} />
        </section> : null}

        {canTopUp ? <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><Upload size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">پڕکردنەوەی جزدانی پریپەید</h2></div>
          <p className="mt-1 text-sm leading-6 text-black/50">بڕ و ڕێگای پارەدان دیاری بکە و بەڵگەنامە بار بکە. باڵانس تەنها دوای پەسەندکردنی سوپەر ئەدمین زیاد دەکرێت.</p>
          <form onSubmit={(event) => void submitTopup(event)} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs font-black">بڕی دینار</span><input className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" step="1" required placeholder="100000"/></label>
            <label className="block"><span className="mb-1.5 block text-xs font-black">ڕێگای پارەدان</span><select className={inputClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{Object.entries(methodLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-black">بەڵگەنامەی پارەدان</span><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setTopupProof(event.target.files?.[0] ?? null)} required/></label>
            <label className="block"><span className="mb-1.5 block text-xs font-black">تێبینی</span><input className={inputClass} value={topupNote} onChange={(event) => setTopupNote(event.target.value)} maxLength={1000} placeholder="ژمارەی مامەڵە یان زانیاریی زیادە"/></label>
            <div className="md:col-span-2"><button type="submit" disabled={busy || loading} className={buttonClass}>{busy ? 'ناردن...' : 'ناردنی داواکاریی پڕکردنەوە'}</button></div>
          </form>
        </section> : null}

        <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><WalletCards size={20} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">مێژووی جزدانی پریپەید</h2></div>
          <div className="mt-4 space-y-2">
            {summary.transactions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3">
              <div className="min-w-0 flex-1"><div className="text-sm font-black">{transactionLabels[item.transaction_type] ?? item.transaction_type}</div><div className="mt-1 text-[11px] leading-5 text-black/45">{item.description} · {date(item.created_at)}</div></div>
              <div className="text-end"><strong className={n(item.amount_iqd)<0?'text-red-600':'text-emerald-700'}>{n(item.amount_iqd)>0?'+':''}{iqd(item.amount_iqd)}</strong><div className="mt-1 text-[10px] text-black/40">باڵانس: {iqd(item.balance_after_iqd)}</div></div>
            </div>)}
            {!loading && summary.transactions.length===0 ? <Empty>هێشتا مامەڵەی جزدان تۆمار نەکراوە.</Empty> : null}
          </div>
        </section>

        <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><FileText size={20} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">مێژووی داواکاریی پڕکردنەوە</h2></div>
          <div className="mt-4 space-y-2">
            {summary.topups.map((item) => <article key={item.id} className="rounded-xl bg-[var(--shakh-bg)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{iqd(item.amount_iqd)}</strong><div className="mt-1 text-xs text-black/45">{methodLabels[item.payment_method] ?? item.payment_method} · {date(item.requested_at)}</div></div><span className={'rounded-full px-2.5 py-1 text-[10px] font-black '+(item.status==='approved'?'bg-emerald-500/10 text-emerald-700':item.status==='rejected'?'bg-red-500/10 text-red-700':'bg-amber-500/10 text-amber-700')}>{statusLabels[item.status]}</span></div>
              {item.admin_note ? <div className="mt-2 text-xs text-black/55">تێبینی: {item.admin_note}</div> : null}
              <button type="button" onClick={() => void openProof(item.receipt_path)} className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[var(--shakh-blue)]"><FileText size={14}/> بینینی بەڵگەنامە</button>
            </article>)}
            {!loading && summary.topups.length===0 ? <Empty>هێشتا داواکاریی پڕکردنەوە نییە.</Empty> : null}
          </div>
        </section>

        {isCaptain ? <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><Banknote size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">پارەی کاش و گەڕاندنەوە</h2></div>
          <p className="mt-1 text-sm leading-6 text-black/50">کۆی پارەی کاشی وەرگیراو لە کڕیار لێرە تۆمار دەکرێت. کاتێک پارەکە دەگەڕێنیتەوە، بڕی گەڕێندراوە تەنها لە هاوسەنگی کەم دەکرێتەوە؛ بەڵگەنامەکە بە پێی سیاستی دارایی پاشەکەوت دەکرێت.</p>
          <div className="mt-4 space-y-2">{summary.cash_transactions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3"><div><div className="text-sm font-black">{item.transaction_type==='cash_collected'?'پارەی کاش وەرگیرا':item.transaction_type==='cash_settlement'?'پارە گەڕێندرایەوە':'ڕاستکردنەوە'}</div><div className="mt-1 text-xs text-black/45">{item.note ?? item.reference_type ?? ''} · {date(item.created_at)}</div></div><div className="text-end"><strong className={n(item.amount_iqd)<0?'text-emerald-700':'text-black'}>{n(item.amount_iqd)>0?'+':''}{iqd(item.amount_iqd)}</strong><div className="mt-1 text-[10px] text-black/40">ماوە: {iqd(item.outstanding_after_iqd)}</div></div></div>)}
            {!loading && summary.cash_transactions.length===0 ? <Empty>هێشتا تۆماری کاش نییە.</Empty> : null}</div>
        </section> : null}

        {isFinanceAdmin ? <>
          <section className="rounded-[26px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">پشکنینی داواکارییەکانی پڕکردنەوە</h2></div>
            <p className="mt-1 text-sm leading-6 text-black/50">تەنها دوای پشکنینی بەڵگەنامە و وەرگرتنی پارە، داواکاری پەسەند بکە. هەر داواکارییەک تەنها یەکجار مامەڵەی دارایی دروست دەکات.</p>
            <div className="mt-4 space-y-3">{pendingTopups.map((request) => <article key={request.id} className="rounded-2xl border border-black/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-mono text-black/40" dir="ltr">{request.user_id}</div><div className="mt-1 text-lg font-black">{iqd(request.amount_iqd)}</div><div className="mt-1 text-xs text-black/45">{methodLabels[request.payment_method] ?? request.payment_method} · {date(request.requested_at)}</div><div className="mt-1 text-sm font-bold">{formatAccountName(request.user_id)} {profiles[request.user_id]?.phone ? '· '+profiles[request.user_id].phone : ''}</div></div><button type="button" onClick={() => void openProof(request.receipt_path)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-black/10 px-3 text-xs font-black"><FileText size={14}/> بەڵگەنامە</button></div>
              {request.user_note ? <p className="mt-3 text-xs leading-5 text-black/55">{request.user_note}</p> : null}
              <textarea className="mt-3 min-h-16 w-full rounded-xl border border-black/10 p-3 text-sm" value={adminNotes[request.id]??''} onChange={(event)=>setAdminNotes((current)=>({...current,[request.id]:event.target.value}))} maxLength={1000} placeholder="تێبینی بۆ داواکاری (ئارەزوومەندانە)"/>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busyRow===request.id} onClick={()=>void reviewTopup(request,'approve')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 size={15}/> پەسەندکردن و زیادکردنی باڵانس</button><button type="button" disabled={busyRow===request.id} onClick={()=>void reviewTopup(request,'reject')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 text-xs font-black text-red-600 disabled:opacity-50"><XCircle size={15}/> ڕەتکردنەوە</button></div>
            </article>)}
            {!loading && pendingTopups.length===0 ? <Empty>هیچ داواکارییەکی چاوەڕوانی نییە.</Empty> : null}</div>
          </section>

          <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><WalletCards size={20} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">باڵانسی پریپەیدی فرۆشیار و کاپتن</h2></div>
            <div className="mt-4 space-y-2">{walletAccounts.map((account)=><div key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3"><div className="min-w-0"><div className="font-black">{formatAccountName(account.user_id)}</div><div className="mt-1 text-[11px] text-black/45" dir="ltr">{account.user_id}</div></div><div className="text-end"><div className="font-black">{iqd(account.balance_iqd)}</div><div className="mt-1 text-[10px] text-black/45">پڕکراوە: {iqd(account.lifetime_credited_iqd)} · کەمکراوە: {iqd(account.lifetime_debited_iqd)}</div></div></div>)}
              {!loading && walletAccounts.length===0 ? <Empty>هێشتا باڵانسی پریپەیدی دروست نەکراوە.</Empty> : null}</div>
          </section>

          <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><Banknote size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">تسویەی پارەی کاشی کاپتن</h2></div>
            <p className="mt-1 text-sm leading-6 text-black/50">کۆی outstanding بە وردی کەم دەکرێتەوە. ئەگەر ٢٠٠٬٠٠٠ دینار ماوە بێت و ١٥٠٬٠٠٠ بگەڕێندرێتەوە، ٥٠٬٠٠٠ دینار هەر دەمێنێتەوە.</p>
            <form onSubmit={(event)=>void submitSettlement(event)} className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block"><span className="mb-1.5 block text-xs font-black">کاپتن</span><select className={inputClass} value={selectedCaptain} onChange={(event)=>setSelectedCaptain(event.target.value)} required><option value="">هەڵبژاردنی کاپتن</option>{cashAccounts.map((account)=><option key={account.user_id} value={account.user_id}>{formatAccountName(account.user_id)} — {iqd(account.outstanding_iqd)}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-black">بڕی گەڕاندنەوە</span><input className={inputClass} type="number" min="1" step="1" value={settlementAmount} onChange={(event)=>setSettlementAmount(event.target.value)} required placeholder="150000"/></label>
              <label className="block"><span className="mb-1.5 block text-xs font-black">بەڵگەی وەرگرتنی پارە</span><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event)=>setSettlementProof(event.target.files?.[0]??null)} required/></label>
              <label className="block"><span className="mb-1.5 block text-xs font-black">تێبینی</span><input className={inputClass} value={settlementNote} onChange={(event)=>setSettlementNote(event.target.value)} maxLength={1000} placeholder="ژمارەی وەسل یان زانیاری"/></label>
              <div className="md:col-span-2"><button type="submit" disabled={busy} className={buttonClass}>{busy?'تۆمارکردن...':'تۆمارکردنی گەڕاندنەوەی کاش'}</button></div>
            </form>
            <div className="mt-4 space-y-2">{cashAccounts.map((account)=><div key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3"><div className="min-w-0"><div className="font-black">{formatAccountName(account.user_id)}</div><div className="mt-1 text-[11px] text-black/45" dir="ltr">{account.user_id}</div></div><div className="text-end"><div className="font-black text-[var(--shakh-orange)]">{iqd(account.outstanding_iqd)}</div><div className="mt-1 text-[10px] text-black/45">کۆی وەرگیراو: {iqd(account.lifetime_collected_iqd)} · گەڕاوە: {iqd(account.lifetime_settled_iqd)}</div></div></div>)}
              {!loading && cashAccounts.length===0 ? <Empty>کاپتنێک قەدەغەی کاشی لەسەر نییە.</Empty> : null}</div>
          </section>

          <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">ڕێکخستنی کۆمسیۆنەکان</h2></div>
            <p className="mt-1 text-sm leading-6 text-black/50">ئەم نرخانە بۆ ئۆردەرە نوێکان snapshot دەکرێن. گۆڕانکاری لە مێژووی ئۆردەرەکانی پێشوو ناکات.</p>
            <div className="mt-4 space-y-3">{feeRules.map((rule)=><article key={rule.post_category} className="grid gap-3 rounded-2xl border border-black/[0.06] p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
              <div className="font-black">{categoryLabels[rule.post_category]??rule.post_category}</div>
              <label className="block"><span className="mb-1 block text-[11px] font-bold text-black/45">پارەی کڕیار بۆ هەر گەیاندن (د.ع)</span><input className={inputClass} type="number" min="0" step="1" value={feeDrafts[rule.post_category]?.customer??''} onChange={(event)=>setFeeDrafts((current)=>({...current,[rule.post_category]:{...current[rule.post_category],customer:event.target.value}}))}/></label>
              <label className="block"><span className="mb-1 block text-[11px] font-bold text-black/45">کۆمسیۆنی هەر دانە (د.ع)</span><input className={inputClass} type="number" min="0" step="1" value={feeDrafts[rule.post_category]?.seller??''} onChange={(event)=>setFeeDrafts((current)=>({...current,[rule.post_category]:{...current[rule.post_category],seller:event.target.value}}))}/></label>
              <label className="block"><span className="mb-1 block text-[11px] font-bold text-black/45">ڕێژەی کاپتن (%)</span><input className={inputClass} type="number" min="0" max="100" step="0.01" value={feeDrafts[rule.post_category]?.captain??''} onChange={(event)=>setFeeDrafts((current)=>({...current,[rule.post_category]:{...current[rule.post_category],captain:event.target.value}}))}/></label>
              <button type="button" disabled={busyRow==='fee:'+rule.post_category} onClick={()=>void saveFeeRule(rule)} className={buttonClass}>پاشەکەوت</button>
            </article>)}
            {!loading && feeRules.length===0 ? <Empty>هیچ یاسایەکی کۆمسیۆن نەدۆزرایەوە.</Empty> : null}</div>
          </section>
        </> : null}
      </div>
    </section>
  );
}

function Stat({ title, value, icon, warn = false }: { title: string; value: string; icon: ReactNode; warn?: boolean }) {
  return <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-black text-black/45">{icon}{title}</div><div className={'mt-2 text-xl font-black tabular-nums '+(warn?'text-amber-700':'text-[var(--shakh-navy)]')}>{value}</div></div>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-dashed border-black/10 p-5 text-center text-sm font-bold text-black/40">{children}</div>; }
