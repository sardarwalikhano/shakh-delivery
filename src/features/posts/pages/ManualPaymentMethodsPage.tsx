import { Check, LoaderCircle, Save, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { getManualPaymentMethodsForAdmin, saveManualPaymentMethod, type ManualPaymentMethod } from '../manualPayments';

type MethodDraft = {
  accountIdentifier: string;
  accountHolder: string;
  instructions: string;
  isActive: boolean;
};

const providerHelp: Record<string, string> = {
  fastpay: 'ژمارەی فاستپەی کە بەکارهێنەران پارەی پۆست و داواکاری بۆی دەنێرن.',
  fib: 'ژمارە یان ناسنامەی هەژماری FIB بۆ وەرگرتنی پارە بە مۆبایل.',
  asia_hawala: 'ژمارەی ئاسیا حوالە کە بەکارهێنەر لە ئەپی خۆیەوە پارەی بۆ دەنێرێت.',
};

export function ManualPaymentMethodsPage() {
  const [methods, setMethods] = useState<ManualPaymentMethod[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MethodDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getManualPaymentMethodsForAdmin();
      setMethods(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, {
        accountIdentifier: row.account_identifier ?? '',
        accountHolder: row.account_holder ?? '',
        instructions: row.instructions_ku ?? '',
        isActive: row.is_active,
      }])));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا ژمارەکانی پارەدان باربکرێن.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateDraft = (id: string, patch: Partial<MethodDraft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setMessage(null);
  };

  const save = async (method: ManualPaymentMethod) => {
    const draft = drafts[method.id];
    if (!draft) return;
    if (draft.isActive && draft.accountIdentifier.trim().length < 3) {
      setError('پێش چالاککردنی شێوازی پارەدان، ژمارە یان ناسنامەی هەژمار داخڵ بکە.');
      return;
    }
    setSavingId(method.id);
    setError(null);
    setMessage(null);
    try {
      await saveManualPaymentMethod({
        id: method.id,
        accountIdentifier: draft.accountIdentifier,
        accountHolder: draft.accountHolder,
        instructions: draft.instructions,
        isActive: draft.isActive,
      });
      setMethods((current) => current.map((item) => item.id === method.id ? {
        ...item,
        account_identifier: draft.accountIdentifier.trim() || null,
        account_holder: draft.accountHolder.trim() || null,
        instructions_ku: draft.instructions.trim() || null,
        is_active: draft.isActive,
      } : item));
      setMessage('زانیاریی ' + method.label_ku + ' پاشەکەوت کرا.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردن سەرکەوتوو نەبوو.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <header className="rounded-2xl bg-white p-5 shadow-sm sm:rounded-[28px] sm:p-7">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><WalletCards size={22} /></div>
          <div>
            <p className="text-xs font-black text-[var(--shakh-orange)]">SUPER ADMIN · MANUAL PAYMENTS</p>
            <h1 className="mt-1 text-2xl font-black">ژمارەکانی وەرگرتنی پارە</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-black/55">ژمارەی ڕاستەقینەی فاستپەی، FIB و ئاسیا حوالە لێرە دابنێ. تەنها شێوازە چالاک و ژمارەی پڕکراوەکان بۆ کڕیار پیشان دەدرێن؛ هیچ پارەدانێکی بانکیی ئۆتۆماتیک نییە.</p>
          </div>
        </div>
      </header>

      <AuthFeedback error={error} />
      {message ? <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><Check size={17}/>{message}</div> : null}

      {loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-black/45"><LoaderCircle size={18} className="me-2 inline animate-spin"/>بارکردنی ژمارەکان...</div> : null}
      {!loading && !methods.length ? <div className="rounded-2xl bg-white p-6 text-sm leading-7 text-black/50">هیچ شێوازی پارەدان نەدۆزرایەوە. مایگریشنی manual mobile payment پێویستە لە Supabase جێبەجێ بکرێت.</div> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {methods.map((method) => {
          const draft = drafts[method.id];
          if (!draft) return null;
          return (
            <article key={method.id} className="min-w-0 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:rounded-[24px] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">{method.label_ku}</h2>
                  <p className="mt-1 text-xs leading-5 text-black/45">{providerHelp[method.provider] ?? 'ژمارەی هەژماری پارەدان'}</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs font-black">
                  <input type="checkbox" checked={draft.isActive} onChange={(event) => updateDraft(method.id, { isActive: event.target.checked })} className="size-4 accent-[var(--shakh-orange)]"/>
                  چالاک
                </label>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-black text-black/60">ژمارە / ناسنامەی هەژمار
                  <input dir="ltr" inputMode="text" value={draft.accountIdentifier} onChange={(event) => updateDraft(method.id, { accountIdentifier: event.target.value })} maxLength={160} placeholder="ژمارەی ڕاستەقینە بنووسە" className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-[var(--shakh-blue)]"/>
                </label>
                <label className="block text-xs font-black text-black/60">ناوی خاوەنی هەژمار
                  <input value={draft.accountHolder} onChange={(event) => updateDraft(method.id, { accountHolder: event.target.value })} maxLength={160} placeholder="ناوی وەرگر" className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--shakh-blue)]"/>
                </label>
                <label className="block text-xs font-black text-black/60">ڕێنمایی بۆ نێرەر
                  <textarea value={draft.instructions} onChange={(event) => updateDraft(method.id, { instructions: event.target.value })} maxLength={1000} rows={3} placeholder="وەک: تکایە ژمارەی پۆستەکە لە تێبینییەکەت بنووسە." className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-[var(--shakh-blue)]"/>
                </label>
                <button type="button" onClick={() => void save(method)} disabled={savingId !== null} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                  {savingId === method.id ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}
                  پاشەکەوتکردن
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
