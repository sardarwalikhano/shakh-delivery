import { Calculator, CheckCircle2, MapPin, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, Truck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import {
  deleteDeliveryFeeRule,
  getDeliveryFeeRules,
  getPlatformFeeSetting,
  saveDeliveryFeeRule,
  savePlatformFeeSetting,
  type DeliveryFeeRule,
} from '../api';

const money = (value: number) => Math.round(Number(value) || 0).toLocaleString('en-US') + ' د.ع';
const cityLabel = (rule: DeliveryFeeRule) => rule.is_default ? 'هەموو شارەکان (بنەڕەت)' : rule.city_name_ku;

export function DeliveryFeeSettingsPage() {
  const { permissions } = useAuthorization();
  const canManage = permissions.has('settings.manage');
  const [rules, setRules] = useState<DeliveryFeeRule[]>([]);
  const [platformFeePercent, setPlatformFeePercent] = useState('5');
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('1000');
  const [ruleActive, setRuleActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextRules, platform] = await Promise.all([getDeliveryFeeRules(), getPlatformFeeSetting()]);
      setRules(nextRules);
      setPlatformFeePercent(String(platform.fee_percent ?? 0));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا ڕێکخستنی نرخەکان بخوێندرێتەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetRuleForm = () => {
    setEditingId(null);
    setCity('');
    setDeliveryFee('1000');
    setRuleActive(true);
  };

  const savePlatform = async () => {
    if (!canManage || savingPlatform) return;
    setError(null);
    setMessage(null);
    setSavingPlatform(true);
    try {
      const rate = Number(platformFeePercent);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new Error('ڕێژەی کرێی پلاتفۆرم دەبێت لە ٠ تا ١٠٠٪ بێت.');
      }
      await savePlatformFeeSetting(rate);
      setPlatformFeePercent(String(Math.round(rate * 100) / 100));
      setMessage('ڕێژەی کرێی پلاتفۆرمی SHAKH پاشەکەوت کرا؛ لە وەسڵی داواکارییە نوێکاندا هەژمار دەکرێت.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی ڕێژەی پلاتفۆرم سەرکەوتوو نەبوو.');
    } finally {
      setSavingPlatform(false);
    }
  };

  const saveRule = async () => {
    if (!canManage || savingRule) return;
    setError(null);
    setMessage(null);
    setSavingRule(true);
    try {
      if (!city.trim()) throw new Error('ناوی شار بنووسە؛ بۆ نرخێکی fallback «هەموو شارەکان» هەڵبژێرە.');
      const amount = Number(deliveryFee);
      await saveDeliveryFeeRule({
        ...(editingId ? { id: editingId } : {}),
        city: city.trim(),
        deliveryFeeIqd: amount,
        isActive: ruleActive,
        isDefault: ['*', 'هەموو شارەکان'].includes(city.trim()),
      });
      setMessage('نرخی گەیاندن پاشەکەوت کرا. نرخە دیاریکراوی شار پێش نرخی بنەڕەتی بەکاردێت.');
      resetRuleForm();
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی نرخی گەیاندن سەرکەوتوو نەبوو.');
    } finally {
      setSavingRule(false);
    }
  };

  const editRule = (rule: DeliveryFeeRule) => {
    setEditingId(rule.id);
    setCity(rule.is_default ? 'هەموو شارەکان' : rule.city_name_ku);
    setDeliveryFee(String(rule.delivery_fee_iqd));
    setRuleActive(rule.is_active);
    setError(null);
    setMessage(null);
  };

  const deactivateRule = async (rule: DeliveryFeeRule) => {
    if (!canManage || deactivatingId || rule.is_default || !rule.is_active) return;
    if (!window.confirm('دڵنیایت لە ناچالاککردنی نرخی ئەم شارە؟ ئەگەر داواکاریی نوێ بێت، نرخی بنەڕەتی بەکاردێت.')) return;

    setDeactivatingId(rule.id);
    setError(null);
    setMessage(null);
    try {
      await deleteDeliveryFeeRule(rule.id);
      setMessage('نرخی تایبەتی شار ناچالاک کرا؛ ئۆردەرە کۆنەکان هەروا دەمێننەوە.');
      if (editingId === rule.id) resetRuleForm();
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ناچالاککردنی نرخی گەیاندن سەرکەوتوو نەبوو.');
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-[var(--shakh-orange)]"><Calculator size={15}/> SHAKH · Pricing control</div>
            <h1 className="mt-1 text-3xl font-black">کرێی گەیاندن و پلاتفۆرم</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-black/50">نرخی گەیاندن بە پێی شار ڕێکبخە؛ هەمان نرخی شار بۆ خواردن، جل‌وبەرگ، بازاڕی گشتی و کاتەگۆرییەکانی تر بەکاردێت. ئۆتۆمبێل و حەج/عومرە کرێی گەیاندنیان نییە.</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-xs font-black"><RefreshCw size={15}/> نوێکردنەوە</button>
        </header>

        {!canManage ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">ئەم بەشە تەنها بۆ ئەدمینی مۆڵەت‌پێدراوە.</div> : null}
        {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><Calculator size={20}/></span>
              <div><h2 className="text-lg font-black">کرێی پلاتفۆرمی SHAKH</h2><p className="text-xs text-black/40">ڕێژەیەک لە کۆی بەرهەمەکان، بۆ هەر ئۆردەرێک</p></div>
            </div>
            <label className="mt-5 block text-sm font-black">ڕێژەی کرێی پلاتفۆرم (%)
              <div className="relative mt-2">
                <input type="number" min="0" max="100" step="0.1" value={platformFeePercent} onChange={(event) => setPlatformFeePercent(event.target.value)} disabled={!canManage || savingPlatform} className="w-full rounded-xl border border-black/10 px-3 py-3 pe-10 text-base font-black outline-none focus:border-[var(--shakh-blue)]"/>
                <span className="absolute inset-y-0 end-3 flex items-center font-black text-black/35">%</span>
              </div>
            </label>
            {Number(platformFeePercent) === 0 ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">ڕێژەی کرێی پلاتفۆرم ئێستا ٠٪ ـە؛ بۆ زیادکردنی کرێ لە وەسڵە نوێکاندا ڕێژەیەک دیاری بکە.</p> : null}
            <button type="button" onClick={() => void savePlatform()} disabled={!canManage || savingPlatform || loading} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{savingPlatform ? 'پاشەکەوتکردن...' : 'پاشەکەوتکردنی ڕێژەی پلاتفۆرم'}</button>
            <p className="mt-3 text-xs leading-6 text-black/40">نموونە: ئەگەر نرخەکە ٥٪ بێت و کۆی بەرهەم ١٠,٠٠٠ د.ع بێت، کرێی پلاتفۆرم ٥٠٠ د.ع دەبێت. لە وەسڵدا بڕی حسابکراو پیشان دەدرێت.</p>
          </section>

          <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><Truck size={20}/></span><div><h2 className="text-lg font-black">{editingId ? 'دەستکاری نرخی گەیاندن' : 'زیادکردنی نرخی گەیاندن'}</h2><p className="text-xs text-black/40">ڕێسای تایبەت بۆ شار، لەگەڵ نرخی بنەڕەتی</p></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-black">شار
                <input list="fee-cities" value={city} onChange={(event) => setCity(event.target.value)} disabled={!canManage || savingRule} maxLength={120} placeholder="بەردەڕەش" className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal outline-none focus:border-[var(--shakh-blue)]"/>
                <datalist id="fee-cities">{[...new Set(rules.filter((rule) => !rule.is_default).map((rule) => rule.city_name_ku))].map((value) => <option key={value} value={value}/>)}</datalist>
                <span className="mt-1 block text-[11px] font-normal text-black/40">بۆ fallback ـی شارە نوێکان «هەموو شارەکان» بنووسە.</span>
              </label>
              <label className="block text-sm font-black">کرێی گەیاندن (د.ع)
                <input type="number" min="0" max="100000000" step="1" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} disabled={!canManage || savingRule} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-base font-black outline-none focus:border-[var(--shakh-blue)]"/>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[var(--shakh-bg)] p-3 text-sm font-black sm:col-span-2">
                <input type="checkbox" checked={ruleActive} onChange={(event) => setRuleActive(event.target.checked)} disabled={!canManage || savingRule || ['*', 'هەموو شارەکان'].includes(city.trim())}/>
                نرخ چالاکە
              </label>
            </div>
            <div className="mt-4 rounded-2xl bg-[var(--shakh-bg)] p-3 text-xs leading-6 text-black/50">
              <div className="flex items-center gap-2 font-black text-black/70"><MapPin size={14}/> نموونەی نرخ</div>
              <p className="mt-1">بەردەڕەش: ١,٠٠٠ د.ع. نرخی شارەکانی تر لەم فۆڕمەوە دەستکاری دەکرێت؛ ئەگەر نرخی تایبەتی شارێک ناچالاک بێت، نرخی بنەڕەتی بەکاردێت.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveRule()} disabled={!canManage || savingRule || loading} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{savingRule ? 'پاشەکەوتکردن...' : editingId ? 'نوێکردنەوەی نرخ' : 'زیادکردنی نرخ'}</button>
              {editingId ? <button type="button" onClick={resetRuleForm} disabled={savingRule} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-black"><X size={15}/> پاشگەزبوونەوە</button> : null}
            </div>
          </section>
        </div>

        <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">ڕێساکانی کرێی گەیاندن</h2><p className="mt-1 text-sm text-black/45">نرخی تایبەتی شار پێش نرخی بنەڕەتی هەڵدەبژێردرێت؛ ئۆردەرە کۆنەکان ناگۆڕدرێن.</p></div><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{rules.length} ڕێسا</span></div>
          {loading ? <div className="mt-5 rounded-2xl bg-[var(--shakh-bg)] p-8 text-center text-sm font-bold text-black/40">بارکردن...</div> : rules.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-black/10 p-8 text-center text-sm text-black/45">هێشتا هیچ ڕێسایەک نییە.</div> : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {rules.map((rule) => (
                <article key={rule.id} className="rounded-2xl border border-black/[0.06] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-black">{cityLabel(rule)}</span>{rule.is_default ? <span className="rounded-full bg-[var(--shakh-navy)]/8 px-2 py-1 text-[10px] font-black text-[var(--shakh-navy)]">fallback</span> : null}</div>
                      <div className="mt-2 text-2xl font-black">{money(rule.delivery_fee_iqd)}</div>
                    </div>
                    <span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + (rule.is_active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-black/5 text-black/40')}>{rule.is_active ? 'چالاک' : 'ناچالاک'}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">
                    <button type="button" onClick={() => editRule(rule)} disabled={!canManage || Boolean(deactivatingId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Pencil size={13}/> دەستکاری</button>
                    {!rule.is_default && rule.is_active ? <button type="button" onClick={() => void deactivateRule(rule)} disabled={!canManage || deactivatingId === rule.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40"><Trash2 size={13}/>{deactivatingId === rule.id ? 'ناچالاککردن...' : 'ناچالاککردن'}</button> : null}
                    {rule.is_active ? <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={12}/> بەکاردێت</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-4 text-xs leading-6 text-black/45"><ShieldCheck size={15} className="me-1 inline text-[var(--shakh-blue)]"/> کرێی گەیاندن و پلاتفۆرم لە Supabase دووبارە هەژمار دەکرێن. ئەم نرخانە بۆ داواکاریی نوێیە؛ داتای وەسڵی ئۆردەرە کۆنەکان هەروا دەمێنێتەوە.</div>
      </div>
    </section>
  );
}
