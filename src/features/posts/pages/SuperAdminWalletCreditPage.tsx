import { useState, type FormEvent } from 'react';
import { BadgeCheck, CircleAlert, WalletCards } from 'lucide-react';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { supabase } from '@/lib/supabase/client';

const fmt = (value: number | string) => Math.round(Number(value ?? 0)).toLocaleString('en-US') + ' د.ع';

export function SuperAdminWalletCreditPage() {
  const { permissions } = useAuthorization();
  const [amount, setAmount] = useState('50000');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  if (!permissions.has('wallets.manage')) {
    return <section className="shakh-surface p-6" dir="rtl"><h1 className="text-xl font-black">دەسەڵاتت نییە</h1><p className="mt-2 text-sm text-black/55">تەنها سوپەر ئەدمینی ڕێگەپێدراو دەتوانێت ئەم کردارە ئەنجام بدات.</p></section>;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null); setBalance(null);
    const value = Number(amount);
    const requestId = crypto.randomUUID();
    try {
      if (!Number.isSafeInteger(value) || value < 1 || value > 100000000) {
        throw new Error('بڕی زیادکردن دەبێت لە ١ تا ١٠٠٬٠٠٠٬٠٠٠ دیناری عێراقی بێت.');
      }
      if (reason.trim().length < 5 || reason.trim().length > 1000) {
        throw new Error('هۆکاری زیادکردنی باڵانس بنووسە (٥ تا ١٠٠٠ پیت).');
      }
      const { data, error: rpcError } = await supabase.rpc('super_admin_credit_own_prepaid_wallet', {
        p_amount_iqd: value,
        p_request_id: requestId,
        p_note: reason.trim(),
      });
      if (rpcError) throw rpcError;
      const result = data as { status?: string; balance_iqd?: number | string } | null;
      if (!result || !['credited', 'already_recorded'].includes(String(result.status))) {
        throw new Error('وەڵامی زیادکردنی باڵانس پشتڕاست نەکرایەوە.');
      }
      setBalance(Number(result.balance_iqd ?? 0));
      setMessage(result.status === 'already_recorded'
        ? 'ئەم مامەڵەیە پێشتر تۆمار کراوە؛ باڵانس دووبارە زیاد نەکرا.'
        : 'باڵانس زیادکرا و مامەڵەکە لە ledger و Audit Logs تۆمار کرا.');
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'زیادکردنی باڵانس سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="shakh-page space-y-5 py-6" dir="rtl">
    <header className="rounded-[28px] bg-[var(--shakh-navy)] p-5 text-white sm:p-7">
      <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-orange)] text-[var(--shakh-navy)]"><WalletCards size={24}/></div><div><div className="text-xs font-black text-[var(--shakh-orange)]">SHAKH · INTERNAL WALLET CREDIT</div><h1 className="mt-1 text-2xl font-black sm:text-3xl">زیادکردنی باڵانسی سوپەر ئەدمین</h1></div></div>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70">بەبێ وەسڵی پریپەید، دەتوانیت بڕێک بۆ جزدانی پریپەیدی خۆت زیاد بکەیت بۆ کڕینی پۆست و بەرهەم. ئەم کردارە مامەڵەی ناوخۆییە؛ پارەی ڕاستەقینە وەرناگرێت و بە شێوەی جیاواز لە قازانجی شێر و خەڵات تۆمار دەکرێت.</p>
    </header>

    {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm font-bold text-red-700"><CircleAlert className="me-2 inline" size={16}/>{error}</div>}
    {message && <div role="status" className="rounded-xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-800"><BadgeCheck className="me-2 inline" size={17}/>{message}{balance !== null && <div className="mt-2 text-base">باڵانسی نوێ: {fmt(balance)}</div>}</div>}

    <form onSubmit={submit} className="rounded-[26px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-sm sm:p-7">
      <label className="block text-sm font-black">بڕی زیادکردن (د.ع)
        <input required type="number" min="1" max="100000000" step="1" value={amount} onChange={event=>setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 p-3 text-base font-normal" />
      </label>
      <label className="mt-4 block text-sm font-black">هۆکاری زیادکردن (پێویستە)
        <textarea required minLength={5} maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} placeholder="نموونە: باڵانسی سەرەتایی سوپەر ئەدمین بۆ تاقیکردنەوەی کڕینی پۆست" className="mt-2 min-h-28 w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/>
      </label>
      <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-50 p-3 text-xs leading-6 text-amber-900">ئاگاداری: باڵانسە زیادکراوەکە لە مێژووی مامەڵەکاندا بە جۆری <strong>admin_adjustment</strong> تۆمار دەکرێت. هۆکار، بڕ، هەژماری سوپەر ئەدمین و باڵانسی دوای مامەڵە لە Audit Logs دەپارێزرێن.</div>
      <button type="submit" disabled={busy} className="mt-5 min-h-12 w-full rounded-xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'تۆمارکردن...' : 'پشتڕاستکردنەوە و زیادکردنی باڵانس'}</button>
    </form>
  </section>;
}
