import { useEffect, useMemo, useState } from 'react';
import { Banknote, CircleAlert, Clock3, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { supabase } from '@/lib/supabase/client';
import { AdvancePaymentAdminPanel } from './AdvancePaymentAdminPanel';

type LedgerEntry = {
  id: string;
  owner_id: string | null;
  entry_kind: 'captain_earning' | 'seller_sale' | 'platform_delivery_fee' | 'platform_sale_fee' | 'listing_fee' | 'payout' | 'refund' | 'adjustment';
  amount_iqd: number;
  status: 'pending' | 'paid' | 'reversed';
  source_table: string;
  source_id: string;
  note: string | null;
  created_at: string;
  owner?: { full_name: string | null } | null;
};

const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} د.ع`;
const kindLabels: Record<LedgerEntry['entry_kind'], string> = {
  captain_earning: 'داهاتی کاپتن', seller_sale: 'فرۆشی فرۆشیار',
  platform_delivery_fee: 'کرێی گەیاندنی پلاتفۆرم', platform_sale_fee: 'کۆمیسیۆنی فرۆشتن',
  listing_fee: 'کرێی پۆستکردن', payout: 'پارەی دەرچوو', refund: 'گەڕاندنەوەی پارە', adjustment: 'ڕێکخستن',
};

export function PaymentsPage() {
  const { user } = useAuth();
  const { roles } = useAuthorization();
  const isPlatformAdmin = roles.includes('super_admin');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('financial_ledger_entries')
        .select('id,owner_id,entry_kind,amount_iqd,status,source_table,source_id,note,created_at,owner:profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setEntries((data ?? []) as unknown as LedgerEntry[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user?.id]);

  const totals = useMemo(() => {
    const total = (kinds: LedgerEntry['entry_kind'][], status: LedgerEntry['status']) => entries
      .filter((entry) => kinds.includes(entry.entry_kind) && entry.status === status)
      .reduce((sum, entry) => sum + Number(entry.amount_iqd), 0);
    return {
      captain: total(['captain_earning'], 'pending'),
      seller: total(['seller_sale'], 'pending'),
      platform: total(['platform_delivery_fee', 'platform_sale_fee', 'listing_fee'], 'paid'),
      pendingPlatform: total(['platform_delivery_fee', 'platform_sale_fee', 'listing_fee'], 'pending'),
      gross: entries.filter((entry) => entry.status !== 'reversed' && ['captain_earning', 'seller_sale', 'platform_delivery_fee', 'platform_sale_fee', 'listing_fee'].includes(entry.entry_kind)).reduce((sum, entry) => sum + Number(entry.amount_iqd), 0),
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-[var(--shakh-orange)]">حیسابی پارە</p>
        <h1 className="mt-1 text-2xl font-black">بالانس و مامەڵەکان</h1>
        <p className="mt-2 text-sm leading-7 text-black/55">هەموو بڕەکان تەنها بە دیناری عێراقییە. پارەی کاپتن و فرۆشیار لە داهاتی خاوەنی پلاتفۆرم جیاکراوەتەوە.</p>
      </header>

      {isPlatformAdmin ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <BalanceCard title="کۆی پارەی تۆمارکراو" amount={totals.gross} icon={<Banknote size={19} />} />
            <BalanceCard title="داهاتی پلاتفۆرم کە وەرگیراوە" amount={totals.platform} icon={<Banknote size={19} />} />
            <BalanceCard title="داهاتی پلاتفۆرمی چاوەڕوان" amount={totals.pendingPlatform} icon={<Clock3 size={19} />} />
            <BalanceCard title="پارەی کاپتن کە ماوەتەوە" amount={totals.captain} icon={<Wallet size={19} />} />
            <BalanceCard title="پارەی فرۆشیار کە ماوەتەوە" amount={totals.seller} icon={<Wallet size={19} />} />
          </section>
          <section className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
            <div className="flex items-start gap-2"><CircleAlert className="mt-1 shrink-0" size={18} /><p><strong>کۆی پارەی کۆکراوە قازانجی پلاتفۆرم نییە.</strong> تەنها کرێ و کۆمیسیۆنی پلاتفۆرم لێرە وەک داهات ژمێردراوە؛ پارەی فرۆشیار و کاپتن وەک قەرزیان پیشان دەدرێت. هەژماری قازانجی پاک پێویستی بە تۆمارکردنی خەرجییەکانیش هەیە.</p></div>
          </section>
          <AdvancePaymentAdminPanel />
        </>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          <BalanceCard title="پارەی ماوە بۆ تۆ" amount={totals.captain + totals.seller} icon={<Wallet size={19} />} />
          <BalanceCard title="پارەی گەیشتوو" amount={entries.filter((row) => row.status === 'paid' && row.owner_id === user?.id).reduce((sum, row) => sum + Number(row.amount_iqd), 0)} icon={<Banknote size={19} />} />
        </section>
      )}

      <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-black">مێژووی مامەڵەکان</h2><span className="text-xs font-bold text-black/40">تا ٢٠٠ مامەڵەی نوێ</span></div>
        {loading ? <p className="py-8 text-center text-sm text-black/50">داتا بار دەکرێت...</p>
          : error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
            : entries.length === 0 ? <p className="rounded-2xl bg-[var(--shakh-bg)] p-6 text-center text-sm leading-7 text-black/50">هێشتا مامەڵەیەکی دارایی لە ledger ـدا تۆمار نەکراوە.</p>
              : <div className="divide-y divide-black/[0.06]">{entries.map((entry) => <article key={entry.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold">{kindLabels[entry.entry_kind]}{isPlatformAdmin && entry.owner?.full_name ? ` · ${entry.owner.full_name}` : ''}</div><div className="mt-1 text-xs text-black/45">{entry.note || entry.source_table} · {new Date(entry.created_at).toLocaleString()}</div></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${entry.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'reversed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{entry.status === 'paid' ? 'پارەدراوە' : entry.status === 'reversed' ? 'گەڕێندراوەتەوە' : 'چاوەڕوان'}</span><strong dir="ltr">{money(Number(entry.amount_iqd))}</strong></div></article>)}</div>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <ProviderCard name="FIB" />
        <ProviderCard name="FastPay" />
      </section>
    </div>
  );
}

function BalanceCard({ title, amount, icon }: { title: string; amount: number; icon: React.ReactNode }) {
  return <article className="rounded-[24px] bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-black/40"><span className="text-sm font-bold">{title}</span>{icon}</div><div className="mt-3 text-2xl font-black" dir="ltr">{money(amount)}</div></article>;
}

function ProviderCard({ name }: { name: string }) {
  return <article className="flex items-center justify-between rounded-[22px] border border-black/[0.06] bg-white p-5"><div><h3 className="font-black">پارەدانی پێشوەختە بە {name}</h3><p className="mt-1 text-xs text-black/45">تا ڕێگەپێدانی خاوەن پڕۆژە ناچالاکە.</p></div><span className="rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-black text-black/45">ناچالاک</span></article>;
}

