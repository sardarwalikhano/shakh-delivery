import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, BadgeCheck, Banknote, CalendarClock, CircleAlert, Gift, RefreshCw, Wallet, WalletCards } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { supabase } from '@/lib/supabase/client';

type WalletSnapshot = {
  wallet: {
    user_id: string;
    pending_iqd: number | string;
    available_iqd: number | string;
    total_earned_iqd: number | string;
    total_withdrawn_iqd: number | string;
    total_spent_iqd: number | string;
  };
  transactions: WalletTransaction[];
  withdrawals: WithdrawalRequest[];
  rewards: ReferralReward[];
};

type WalletTransaction = {
  id?: string;
  transaction_type: string;
  amount_iqd: number | string;
  balance_bucket: string;
  reference_type: string;
  reference_id: string;
  description_ku: string;
  created_at: string;
};

type WithdrawalRequest = {
  id: string;
  user_id: string;
  month_key: string;
  amount_iqd: number | string;
  payout_method: string;
  account_holder_name: string;
  payout_account: string;
  note: string | null;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  admin_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
  paid_at: string | null;
};

type ReferralReward = {
  id: string;
  order_type: string;
  order_id: string;
  post_id: string;
  reward_iqd: number | string;
  status: 'pending' | 'available' | 'reversed';
  created_at: string;
  settled_at: string | null;
};

const emptyWallet: WalletSnapshot = {
  wallet: { user_id: '', pending_iqd: 0, available_iqd: 0, total_earned_iqd: 0, total_withdrawn_iqd: 0, total_spent_iqd: 0 },
  transactions: [],
  withdrawals: [],
  rewards: [],
};

const payoutLabels: Record<string, string> = {
  zaincash: 'ZainCash',
  zain_cash: 'ZainCash',
  mobile_cash: 'Mobile Cash',
  fastpay: 'FastPay',
  bank_transfer: 'گواستنەوەی بانکی',
  qi_card: 'Qi Card',
  other: 'ڕێگای تر',
};

const transactionLabels: Record<string, string> = {
  earning: 'خەڵاتی شێرکردن زیادکرا',
  platform_spend_refund: 'گەڕاندنەوەی باڵانس',
  withdrawal_reserved: 'باڵانس بۆ ڕاکێشان گرترا',
  withdrawal_refund: 'گەڕاندنەوەی پارەی ڕاکێشان',
  reward_pending: 'خەڵات لە چاوەڕوانی گەیاندن',
  reward_available: 'خەڵات چووەتە باڵانس',
  reward_reversed: 'خەڵاتی هەڵوەشاوە',
  withdrawal_requested: 'داوای ڕاکێشان',
  withdrawal_refunded: 'گەڕاندنەوەی باڵانس',
  platform_spend: 'کڕین بە باڵانسی شاخ',
};

const withdrawalStatusLabels: Record<WithdrawalRequest['status'], string> = {
  pending: 'چاوەڕوانی پشکنین',
  approved: 'پەسەندکرا · چاوەڕوانی پارەدان',
  paid: 'پارە دراوە',
  rejected: 'ڕەتکرایەوە',
};

function amount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function formatIQD(value: number | string | null | undefined): string {
  return Math.round(amount(value)).toLocaleString('en-US') + ' د.ع';
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('ku-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function statusTone(status: string): string {
  if (status === 'paid' || status === 'available' || status === 'reward_available') return 'bg-emerald-500/10 text-emerald-800';
  if (status === 'rejected' || status === 'reversed' || status === 'reward_reversed') return 'bg-red-500/10 text-red-700';
  return 'bg-amber-500/10 text-amber-800';
}

export function ReferralWalletPage() {
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const canManageWithdrawals = permissions.has('share_rewards.manage');
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(emptyWallet);
  const [adminRequests, setAdminRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [holderName, setHolderName] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('zain_cash');
  const [payoutAccount, setPayoutAccount] = useState('');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: summaryError } = await supabase.rpc('get_share_rewards_summary');
      if (summaryError) throw summaryError;

      type LegacyWithdrawal = {
        id: string;
        user_id: string;
        amount_iqd: number | string;
        payment_method: string;
        recipient_name: string;
        recipient_account: string | null;
        recipient_phone: string | null;
        user_note: string | null;
        status: string;
        admin_note: string | null;
        payout_reference?: string | null;
        requested_at: string;
        reviewed_at: string | null;
      };
      type LegacySummary = {
        balance_iqd?: number | string;
        lifetime_earned_iqd?: number | string;
        lifetime_withdrawn_iqd?: number | string;
        lifetime_spent_iqd?: number | string;
        earnings?: Array<{
          id: string; post_id: string | null; post_title: string; order_type: string;
          order_id: string; order_number: string; amount_iqd: number | string; created_at: string;
        }>;
        transactions?: Array<{
          id: string; transaction_type: string; amount_iqd: number | string;
          balance_after_iqd: number | string; reference_type: string | null;
          reference_id: string | null; description: string; created_at: string;
        }>;
        withdrawals?: LegacyWithdrawal[];
      };
      const summary = data as LegacySummary | null;
      const toWithdrawal = (item: LegacyWithdrawal): WithdrawalRequest => ({
        id: item.id,
        user_id: item.user_id,
        month_key: (item.requested_at ?? '').slice(0, 7) + '-01',
        amount_iqd: item.amount_iqd,
        payout_method: item.payment_method,
        account_holder_name: item.recipient_name,
        payout_account: item.recipient_phone || item.recipient_account || '',
        note: item.user_note,
        status: item.status === 'paid' ? 'paid' : item.status === 'rejected' ? 'rejected' : 'pending',
        admin_note: item.admin_note,
        requested_at: item.requested_at,
        reviewed_at: item.reviewed_at,
        paid_at: item.status === 'paid' ? item.reviewed_at : null,
      });

      if (!summary) {
        setSnapshot(emptyWallet);
      } else {
        setSnapshot({
          wallet: {
            user_id: user.id,
            // The deployed schema credits earnings only after completed orders.
            pending_iqd: 0,
            available_iqd: summary.balance_iqd ?? 0,
            total_earned_iqd: summary.lifetime_earned_iqd ?? 0,
            total_withdrawn_iqd: summary.lifetime_withdrawn_iqd ?? 0,
            total_spent_iqd: summary.lifetime_spent_iqd ?? 0,
          },
          transactions: (summary.transactions ?? []).map((item) => ({
            id: item.id,
            transaction_type: item.transaction_type,
            amount_iqd: item.amount_iqd,
            balance_bucket: 'available',
            reference_type: item.reference_type ?? '',
            reference_id: item.reference_id ?? '',
            description_ku: item.description,
            created_at: item.created_at,
          })),
          withdrawals: (summary.withdrawals ?? []).map(toWithdrawal),
          rewards: (summary.earnings ?? []).map((item) => ({
            id: item.id,
            order_type: item.order_type === 'food_post' ? 'food' : item.order_type === 'electronics_post' ? 'electronics' : 'apparel',
            order_id: item.order_id,
            post_id: item.post_id ?? '',
            reward_iqd: item.amount_iqd,
            status: 'available' as const,
            created_at: item.created_at,
            settled_at: item.created_at,
          })),
        });
      }

      if (canManageWithdrawals) {
        const { data: requests, error: requestsError } = await supabase
          .from('share_withdrawal_requests')
          .select('id,user_id,amount_iqd,payment_method,recipient_name,recipient_account,recipient_phone,user_note,status,admin_note,payout_reference,requested_at,reviewed_at')
          .order('requested_at', { ascending: false })
          .limit(100);
        if (requestsError) throw requestsError;
        setAdminRequests(((requests ?? []) as LegacyWithdrawal[]).map(toWithdrawal));
      } else {
        setAdminRequests([]);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا زانیاریی باڵانسی خەڵات بخوێندرێتەوە.');
    } finally {
      setLoading(false);
    }
  }, [canManageWithdrawals, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const available = amount(snapshot.wallet.available_iqd);
  const recentTransactions = useMemo(() => snapshot.transactions ?? [], [snapshot.transactions]);
  const myWithdrawals = snapshot.withdrawals ?? [];

  const requestWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (available <= 0) {
      setError('هیچ باڵانسێکی بەردەست نییە بۆ ڕاکێشان.');
      return;
    }
    if (holderName.trim().length < 2 || payoutAccount.trim().length < 5) {
      setError('ناوی خاوەنی هەژمار و زانیاریی هەژماری پارەدان بە دروستی پڕبکەرەوە.');
      return;
    }

    setBusy(true);
    try {
      const phoneMethods = ['mobile_cash', 'zain_cash', 'fastpay', 'qi_card'];
      const amountToWithdraw = Math.floor(available);
      const { data, error: requestError } = await supabase.rpc('request_share_withdrawal', {
        p_amount_iqd: amountToWithdraw,
        p_payment_method: payoutMethod,
        p_recipient_name: holderName.trim(),
        p_recipient_account: phoneMethods.includes(payoutMethod) ? null : payoutAccount.trim(),
        p_recipient_phone: phoneMethods.includes(payoutMethod) ? payoutAccount.trim() : null,
        p_user_note: withdrawalNote.trim() || null,
      });
      if (requestError) throw requestError;
      const result = data as { amount_iqd?: number | string; balance_iqd?: number | string } | null;
      setMessage('داوای ڕاکێشان تۆمارکرا بۆ ' + formatIQD(result?.amount_iqd ?? amountToWithdraw) + '. باڵانسی ماوە: ' + formatIQD(result?.balance_iqd ?? Math.max(0, available - amountToWithdraw)) + '.');
      setHolderName('');
      setPayoutAccount('');
      setWithdrawalNote('');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'داوای ڕاکێشان سەرنەکەوت.');
    } finally {
      setBusy(false);
    }
  };

  const processRequest = async (request: WithdrawalRequest, action: 'reject' | 'mark_paid') => {
    setBusyRequestId(request.id);
    setError(null);
    setMessage(null);
    try {
      const { error: actionError } = await supabase.rpc('review_share_withdrawal', {
        p_request_id: request.id,
        p_action: action === 'mark_paid' ? 'paid' : 'rejected',
        p_admin_note: adminNote[request.id]?.trim() || null,
        p_payout_reference: null,
      });
      if (actionError) throw actionError;
      setMessage(action === 'reject' ? 'داواکاری ڕەتکرایەوە و باڵانسەکە گەڕێندرایەوە.' : 'پارەدان بە دەستی تیمی دارایی تۆمارکرا.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'جێبەجێکردنی داواکاری سەرنەکەوت.');
    } finally {
      setBusyRequestId(null);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] space-y-6 bg-[var(--shakh-bg)] py-6" dir="rtl">
      <header className="rounded-[28px] bg-[var(--shakh-navy)] p-5 text-white shadow-[0_18px_50px_rgba(11,18,32,.12)] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black text-[var(--shakh-orange)]">SHAKH · Share and earn</div>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">باڵانسی خەڵاتی شێرکردن</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">لینکی تایبەتی پۆستەکانت شێر بکە. خەڵات دوای گەیاندن و پشتڕاستبوونەوەی پارەدان بەردەست دەبێت؛ دواتر دەتوانیت لە کڕینی پۆستەکان بەکاریبهێنیت یان داوای ڕاکێشانی بکەیت.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-black text-white disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> نوێکردنەوە</button>
        </div>
      </header>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-2xl bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-700"><CircleAlert size={17} className="mt-1 shrink-0"/>{error}</div> : null}
      {message ? <div role="status" className="rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold leading-6 text-emerald-800">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WalletStat label="باڵانسی بەردەست" value={formatIQD(snapshot.wallet.available_iqd)} icon={<Wallet size={18}/>} emphasized />
        <WalletStat label="لە چاوەڕوانی تەواوبوون" value={formatIQD(snapshot.wallet.pending_iqd)} icon={<CalendarClock size={18}/>} />
        <WalletStat label="کۆی خەڵاتی بەدەستهاتوو" value={formatIQD(snapshot.wallet.total_earned_iqd)} icon={<Gift size={18}/>} />
        <WalletStat label="کڕین و ڕاکێشان" value={formatIQD(amount(snapshot.wallet.total_spent_iqd) + amount(snapshot.wallet.total_withdrawn_iqd))} icon={<WalletCards size={18}/>} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(330px,.8fr)]">
        <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><ArrowDownToLine size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">داوای ڕاکێشانی باڵانس</h2></div>
          <p className="mt-2 text-sm leading-6 text-black/50">داواکردن هەموو باڵانسی بەردەستت قفڵ دەکات تا ئەدمین پشکنینی بکات. ئەگەر داواکاری ڕەت بکرێتەوە، باڵانسەکە دەگەڕێتەوە؛ ئەگەر پارە بدرێت، باڵانسی بەردەست بۆ ئەو بڕە سفر دەبێت. بڕی داواکراو لە باڵانس دەردەچێت تا تیمی دارایی پشکنینی بکات؛ ئەگەر ڕەت بکرێتەوە، پارەکە دەگەڕێتەوە.</p>
          <div className="mt-4 rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="text-xs font-bold text-black/45">بڕی ئێستا بۆ داواکردن</div><div className="mt-1 text-2xl font-black tabular-nums">{formatIQD(available)}</div></div>

          <form className="mt-5 space-y-4" onSubmit={requestWithdrawal}>
            <label className="block text-sm font-black">ناوی خاوەنی هەژمار
              <input required minLength={2} maxLength={120} value={holderName} onChange={(event) => setHolderName(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal outline-none focus:border-[var(--shakh-blue)]" placeholder="ناوی تەواو"/>
            </label>
            <label className="block text-sm font-black">ڕێگای وەرگرتنی پارە
              <select value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal">
                <option value="mobile_cash">Mobile Cash</option><option value="zain_cash">ZainCash</option><option value="fastpay">FastPay</option><option value="bank_transfer">گواستنەوەی بانکی</option><option value="qi_card">Qi Card</option><option value="other">ڕێگای تر</option>
              </select>
            </label>
            <label className="block text-sm font-black">ژمارە یان زانیاریی هەژماری پارەدان
              <input required minLength={5} maxLength={240} value={payoutAccount} onChange={(event) => setPayoutAccount(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal outline-none focus:border-[var(--shakh-blue)]" placeholder="ژمارەی هەژمار / مۆبایل"/>
            </label>
            <label className="block text-sm font-black">تێبینی (ئارەزوومەندانە)
              <textarea maxLength={1000} value={withdrawalNote} onChange={(event) => setWithdrawalNote(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-black/10 p-3 text-sm font-normal" placeholder="وردەکاریی زیاتر"/>
            </label>
            <button type="submit" disabled={busy || loading || available <= 0} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-40"><ArrowDownToLine size={17}/>{busy ? 'ناردن...' : 'داوای ڕاکێشانی هەموو باڵانس'}</button>
            <p className="text-xs leading-5 text-black/40">پارەدان لەم قۆناغەدا بە دەستی تیمی دارایی تۆمار دەکرێت؛ هیچ گەیت‌وەی بانکی یان مۆبایلی خۆکار نەبەستراوە.</p>
          </form>
        </section>

        <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><Banknote size={20} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">مێژووی داوای ڕاکێشان</h2></div>
          <div className="mt-4 space-y-3">
            {myWithdrawals.map((item) => <article key={item.id} className="rounded-2xl border border-black/[0.06] bg-[var(--shakh-bg)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-black">{formatIQD(item.amount_iqd)}</div><div className="mt-1 text-xs text-black/45">{payoutLabels[item.payout_method] ?? item.payout_method} · {formatDate(item.requested_at)}</div></div><span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + statusTone(item.status)}>{withdrawalStatusLabels[item.status]}</span></div>
              <div className="mt-2 break-words text-xs leading-5 text-black/50">{item.account_holder_name} · {item.payout_account}</div>
              {item.admin_note ? <div className="mt-2 text-xs leading-5 text-black/60">تێبینی دارایی: {item.admin_note}</div> : null}
              {item.paid_at ? <div className="mt-2 text-[11px] text-emerald-800">پارەدراوە: {formatDate(item.paid_at)}</div> : null}
            </article>)}
            {!loading && myWithdrawals.length === 0 ? <Empty text="هێشتا داوای ڕاکێشان تۆمار نەکراوە."/> : null}
          </div>
        </section>
      </div>

      <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2"><Gift size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">مێژووی خەڵاتەکان</h2></div>
        <p className="mt-1 text-xs leading-5 text-black/45">هەر خەڵاتێک بە داواکارییەک دەبەسترێتەوە. خەڵاتی هەڵوەشاوە یان داواکاریی هێشتا تەواونەبوو ناچێتە باڵانسی بەردەست.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead><tr className="border-b border-black/10 text-start text-xs text-black/45"><th className="p-3 text-start">بەروار</th><th className="p-3 text-start">جۆری داواکاری</th><th className="p-3 text-start">خەڵات</th><th className="p-3 text-start">دۆخ</th><th className="p-3 text-start">ID داواکاری</th></tr></thead>
            <tbody>{(snapshot.rewards ?? []).map((reward) => <tr key={reward.id} className="border-b border-black/[0.05]"><td className="p-3 text-xs text-black/55">{formatDate(reward.created_at)}</td><td className="p-3 font-bold">{reward.order_type === 'food' ? 'خواردن' : 'جل‌وبەرگ'}</td><td className="p-3 font-black">{formatIQD(reward.reward_iqd)}</td><td className="p-3"><span className={'rounded-full px-2 py-1 text-[10px] font-black ' + statusTone(reward.status)}>{reward.status === 'pending' ? 'چاوەڕوانی' : reward.status === 'available' ? 'بەردەست' : 'هەڵوەشاوە'}</span></td><td className="p-3 font-mono text-[10px] text-black/45" dir="ltr">{reward.order_id}</td></tr>)}</tbody>
          </table>
        </div>
        {!loading && snapshot.rewards.length === 0 ? <Empty text="هێشتا هیچ خەڵاتێک بەدەست نەهاتووە."/> : null}
      </section>

      <section className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2"><WalletCards size={20} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">جووڵەکانی باڵانس</h2></div>
        <div className="mt-4 space-y-2">
          {recentTransactions.map((item, index) => <div key={item.id ?? item.reference_id + item.transaction_type + index} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3">
            <div className="min-w-0 flex-1"><div className="font-bold">{transactionLabels[item.transaction_type] ?? item.description_ku}</div><div className="mt-1 text-[11px] text-black/40">{item.description_ku} · {formatDate(item.created_at)}</div></div>
            <strong className={'text-sm tabular-nums ' + (amount(item.amount_iqd) < 0 ? 'text-red-600' : 'text-emerald-700')}>{amount(item.amount_iqd)>0?'+':''}{formatIQD(item.amount_iqd)}</strong>
          </div>)}
          {!loading && recentTransactions.length === 0 ? <Empty text="هێشتا جووڵەیەکی باڵانس نییە."/> : null}
        </div>
      </section>

      {canManageWithdrawals ? (
        <section className="rounded-[26px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><BadgeCheck size={20} className="text-[var(--shakh-orange)]"/><h2 className="text-lg font-black">بەڕێوەبردنی داواکارییەکانی ڕاکێشان · دارایی</h2></div>
          <p className="mt-1 text-xs leading-5 text-black/45">پێش نیشانکردنی «پارەدرا»، پارەکە بەڕاستی لە ڕێگای دەرەکی بۆ بەکارهێنەر بنێرە. دوگمەکە تەنها دۆخی سیستەم تۆمار دەکات.</p>
          <div className="mt-4 space-y-3">
            {adminRequests.map((request) => <article key={request.id} className="rounded-2xl border border-black/[0.07] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-bold text-black/45" dir="ltr">{request.user_id}</div><div className="mt-1 text-lg font-black">{formatIQD(request.amount_iqd)}</div><div className="mt-1 text-xs text-black/45">{payoutLabels[request.payout_method] ?? request.payout_method} · {formatDate(request.requested_at)}</div></div><span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + statusTone(request.status)}>{withdrawalStatusLabels[request.status]}</span></div>
              <div className="mt-3 rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div><strong>خاوەنی هەژمار: </strong>{request.account_holder_name}</div><div className="mt-1 break-words"><strong>هەژمار: </strong>{request.payout_account}</div>{request.note ? <div className="mt-1"><strong>تێبینی: </strong>{request.note}</div> : null}</div>
              <textarea value={adminNote[request.id] ?? ''} onChange={(event) => setAdminNote((current) => ({ ...current, [request.id]: event.target.value }))} maxLength={2000} className="mt-3 min-h-16 w-full rounded-xl border border-black/10 p-3 text-sm" placeholder="تێبینی بۆ بەکارهێنەر (ئارەزوومەندانە)"/>
              <div className="mt-3 flex flex-wrap gap-2">
                {request.status === 'pending' ? <button type="button" disabled={busyRequestId===request.id} onClick={() => void processRequest(request,'mark_paid')} className="min-h-10 rounded-xl bg-[var(--shakh-navy)] px-4 text-xs font-black text-white disabled:opacity-40">پارە درا · تۆمارکردن</button> : null}
                {request.status === 'pending' ? <button type="button" disabled={busyRequestId===request.id} onClick={() => void processRequest(request,'reject')} className="min-h-10 rounded-xl border border-red-500/20 px-4 text-xs font-black text-red-700 disabled:opacity-40">ڕەتکردنەوە و گەڕاندنەوەی باڵانس</button> : null}
              </div>
            </article>)}
            {!loading && adminRequests.length === 0 ? <Empty text="هیچ داوای ڕاکێشانێک نییە."/> : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function WalletStat({ label, value, icon, emphasized = false }: { label: string; value: string; icon: React.ReactNode; emphasized?: boolean }) {
  return <div className={'rounded-2xl border p-4 ' + (emphasized ? 'border-[var(--shakh-orange)]/20 bg-white shadow-sm' : 'border-black/[0.06] bg-white')}>
    <div className="flex items-center gap-2 text-xs font-black text-black/45">{icon}{label}</div>
    <div className={'mt-2 text-xl font-black tabular-nums ' + (emphasized ? 'text-[var(--shakh-orange)]' : 'text-[var(--shakh-navy)]')}>{value}</div>
  </div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-black/10 p-5 text-center text-sm font-bold text-black/40">{text}</div>;
}
