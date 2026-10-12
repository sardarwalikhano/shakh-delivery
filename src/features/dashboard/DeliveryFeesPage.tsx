import { Plus, RefreshCw, Save, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type DeliveryFeeRule = {
  id: string;
  city_name_ku: string;
  delivery_fee_iqd: number;
  is_active: boolean;
  is_default: boolean;
  updated_at: string;
};

type RuleDraft = { cityName: string; fee: string; active: boolean };

export function DeliveryFeesPage() {
  const [rules, setRules] = useState<DeliveryFeeRule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [platformPercent, setPlatformPercent] = useState('0');
  const [newCity, setNewCity] = useState('');
  const [newFee, setNewFee] = useState('1000');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesResult, platformResult] = await Promise.all([
        supabase.from('delivery_fee_rules')
          .select('id,city_name_ku,delivery_fee_iqd,is_active,is_default,updated_at')
          .order('is_default', { ascending: false })
          .order('city_name_ku', { ascending: true }),
        supabase.from('platform_fee_settings').select('fee_percent').eq('id', 1).maybeSingle(),
      ]);
      if (rulesResult.error) throw rulesResult.error;
      if (platformResult.error) throw platformResult.error;
      const nextRules = (rulesResult.data ?? []) as DeliveryFeeRule[];
      setRules(nextRules);
      setDrafts(Object.fromEntries(nextRules.map((rule) => [rule.id, {
        cityName: rule.is_default ? '' : rule.city_name_ku,
        fee: String(rule.delivery_fee_iqd),
        active: rule.is_active,
      }])));
      setPlatformPercent(String(platformResult.data?.fee_percent ?? 0));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا ڕێکخستنی نرخەکان بخوێندرێتەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveRule = async (rule: DeliveryFeeRule) => {
    const draft = drafts[rule.id];
    const cityName = rule.is_default ? '__default__' : draft?.cityName.trim();
    const fee = Number(draft?.fee);
    if (!rule.is_default && (!cityName || cityName.length < 2 || cityName.length > 100)) {
      setError('ناوی شار دەبێت لە ٢ تا ١٠٠ پیت بێت.');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000000) {
      setError('نرخی گەیاندن دەبێت ژمارەیەکی دروستی سفر یان زیاتر بێت.');
      return;
    }
    setSavingId(rule.id);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.from('delivery_fee_rules').update({
        city_name_ku: cityName,
        delivery_fee_iqd: fee,
        is_active: rule.is_default ? true : Boolean(draft?.active),
        updated_at: new Date().toISOString(),
      }).eq('id', rule.id);
      if (updateError) throw updateError;
      setMessage('نرخی گەیاندن پاشەکەوت کرا.');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی نرخ سەرکەوتوو نەبوو.');
    } finally {
      setSavingId(null);
    }
  };

  const addRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cityName = newCity.trim();
    const fee = Number(newFee);
    if (cityName.length < 2 || cityName.length > 100) {
      setError('ناوی شار بنووسە (٢ تا ١٠٠ پیت).');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000000) {
      setError('نرخی گەیاندن دروست نییە.');
      return;
    }
    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      const { error: insertError } = await supabase.from('delivery_fee_rules').insert({
        city_name_ku: cityName,
        delivery_fee_iqd: fee,
        is_active: true,
        is_default: false,
      });
      if (insertError) throw insertError;
      setNewCity('');
      setNewFee('1000');
      setMessage('شاری نوێ و نرخی گەیاندن زیاد کران.');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'زیادکردنی شار سەرنەکەوت.');
    } finally {
      setAdding(false);
    }
  };

  const savePlatformFee = async () => {
    const fee = Number(platformPercent);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      setError('ڕێژەی کرێی پلاتفۆرم دەبێت لە ٠ تا ١٠٠٪ بێت.');
      return;
    }
    setSavingPlatform(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.from('platform_fee_settings')
        .update({ fee_percent: fee, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (updateError) throw updateError;
      setMessage('ڕێژەی کرێی پلاتفۆرمی شاخ پاشەکەوت کرا.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی ڕێژەی پلاتفۆرم سەرنەکەوت.');
    } finally {
      setSavingPlatform(false);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black text-[var(--shakh-orange)]">SHAKH · Delivery & fees</div>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">نرخی گەیاندن و کرێی پلاتفۆرم</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-black/50">نرخی گەیاندن بەپێی شار ڕێکبخە. ئەم نرخە بۆ هەموو کاتەگۆرییەکانی گەیاندن‌پێویست بەکاردێت؛ ئۆتۆمبێل و حەج/عومرە کرێی گەیاندنیان نییە. گۆڕانکارییەکان تەنها لەسەر داواکاریی نوێ کاریگەرییان هەیە.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-black disabled:opacity-50"><RefreshCw size={16}/> نوێکردنەوە</button>
        </div>

        {error ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><Truck size={20}/></div>
                <div><h2 className="text-xl font-black">نرخی گەیاندن بەپێی شار</h2><p className="mt-1 text-sm leading-6 text-black/45">نرخی شارێک ئەگەر دیاری کرابێت بەکار دێت؛ ئەگەر نا، نرخی بنەڕەتی بەکار دێت. بەردەڕەش بە ١,٠٠٠ د.ع دەست پێ دەکات.</p></div>
              </div>

              <form onSubmit={addRule} className="mt-5 grid gap-3 rounded-2xl bg-[var(--shakh-bg)] p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
                <label className="block text-sm font-black">ناوی شار<input value={newCity} onChange={(event) => setNewCity(event.target.value)} required maxLength={100} placeholder="هەولێر، دهۆک، سلێمانی..." className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/></label>
                <label className="block text-sm font-black">نرخی گەیاندن (د.ع)<input type="number" min="0" max="10000000" step="250" value={newFee} onChange={(event) => setNewFee(event.target.value)} required className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal" dir="ltr"/></label>
                <button type="submit" disabled={adding} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Plus size={16}/>{adding ? 'زیادکردن...' : 'زیادکردنی شار'}</button>
              </form>

              {loading ? <div className="mt-5 rounded-2xl bg-[var(--shakh-bg)] p-8 text-center text-sm font-bold text-black/45">بارکردن...</div> : rules.length === 0 ? <div className="mt-5 rounded-2xl bg-[var(--shakh-bg)] p-8 text-center text-sm font-bold text-black/45">هیچ نرخێک دانەنراوە.</div> : (
                <div className="mt-5 space-y-3">
                  {rules.map((rule) => {
                    const draft = drafts[rule.id] ?? { cityName: '', fee: String(rule.delivery_fee_iqd), active: rule.is_active };
                    return (
                      <div key={rule.id} className="rounded-2xl border border-black/[0.06] p-4">
                        <div className="grid gap-3 md:grid-cols-[1fr_180px_130px_auto] md:items-end">
                          <label className="block text-sm font-black">{rule.is_default ? 'نرخی بنەڕەتی بۆ شارەکانی تر' : 'ناوی شار'}
                            <input value={rule.is_default ? 'نرخی بنەڕەتی' : draft.cityName} onChange={(event) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, cityName: event.target.value } }))} disabled={rule.is_default || savingId === rule.id} maxLength={100} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal disabled:bg-black/[0.03]"/>
                          </label>
                          <label className="block text-sm font-black">نرخ (د.ع)
                            <input type="number" min="0" max="10000000" step="250" value={draft.fee} onChange={(event) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, fee: event.target.value } }))} disabled={savingId === rule.id} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal" dir="ltr"/>
                          </label>
                          <label className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-bg)] px-3 text-sm font-bold">
                            <input type="checkbox" checked={rule.is_default ? true : draft.active} disabled={rule.is_default || savingId === rule.id} onChange={(event) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, active: event.target.checked } }))}/>
                            چالاک
                          </label>
                          <button type="button" onClick={() => void saveRule(rule)} disabled={savingId === rule.id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={15}/>{savingId === rule.id ? 'پاشەکەوت...' : 'پاشەکەوت'}</button>
                        </div>
                        {rule.is_default ? <p className="mt-2 text-xs leading-5 text-black/40">بۆ شارێک کە نرخی تایبەتی نییە، ئەم نرخە بەکار دەهێنرێت.</p> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="text-xs font-black text-[var(--shakh-blue)]">GLOBAL PLATFORM FEE</div>
            <h2 className="mt-1 text-xl font-black">کرێی پلاتفۆرمی شاخ</h2>
            <p className="mt-2 text-sm leading-6 text-black/50">ڕێژەیەکی گشتییە بۆ هەموو داواکارییەکان. لەسەر کۆی بەرهەم هەژمار دەکرێت، نەک لەسەر کرێی گەیاندن؛ بۆ حەج/عومرە و ئۆتۆمبێل تەنها کرێی گەیاندن لابراوە.</p>
            <label className="mt-5 block text-sm font-black">ڕێژە (%)<input type="number" min="0" max="100" step="0.25" value={platformPercent} onChange={(event) => setPlatformPercent(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-lg font-black" dir="ltr"/></label>
            <div className="mt-3 rounded-2xl bg-[var(--shakh-bg)] p-4 text-sm">
              <div className="text-xs text-black/40">نموونە: لەسەر ١٠٠,٠٠٠ د.ع</div>
              <div className="mt-1 text-xl font-black">{Math.round((Number(platformPercent) || 0) * 1000).toLocaleString('en-US')} د.ع</div>
            </div>
            <button type="button" onClick={() => void savePlatformFee()} disabled={savingPlatform} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{savingPlatform ? 'پاشەکەوتکردن...' : 'پاشەکەوتکردنی کرێی پلاتفۆرم'}</button>
            <p className="mt-3 text-xs leading-5 text-black/35">ڕێژەی دەستپێک ٠٪ ـە چونکە ڕێژەی فەرمی دیاری نەکراوە. گۆڕینی نرخەکان لەسەر داواکاریی نوێ کاریگەری هەیە، نەک وەسلەی پێشوو.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
