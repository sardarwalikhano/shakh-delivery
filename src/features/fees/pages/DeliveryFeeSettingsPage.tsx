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

const categoryOptions = [
  { value: 'all', label: 'هەموو کاتەگۆرییەکان', description: 'بنەڕەت بۆ هەموو کاتەگۆرییەکان' },
  { value: 'food', label: 'خواردن / چێشتخانە', description: 'خواردنی پۆست و چێشتخانە' },
  { value: 'fashion', label: 'جل و بەرگ', description: 'جل و بەرگ و پێڵاو' },
  { value: 'general', label: 'بازاڕی گشتی', description: 'پۆست و کاڵای گشتی' },
  { value: 'electronics', label: 'ئەلیکترۆنیات', description: 'مۆبایل و کەلوپەلی ئەلیکترۆنی' },
  { value: 'home-living', label: 'ماڵ و ژیان', description: 'کەلوپەلی ماڵەوە' },
  { value: 'beauty', label: 'جوانکاری', description: 'جوانکاری و ئەکسسوارات' },
  { value: 'kids', label: 'منداڵان', description: 'کاڵا و پێداویستیی منداڵان' },
  { value: 'online-stores', label: 'دۆکانی ئۆنلاین', description: 'فرۆشگای ئۆنلاین' },
  { value: 'supermarket', label: 'سوپەرمارکێت', description: 'کاڵاکانی سوپەرمارکێت' },
  { value: 'supermarket-food', label: 'خواردنی سوپەرمارکێت', description: 'خواردن و کاڵای تازە' },
  { value: 'supermarket-drinks', label: 'خواردنەوەکان', description: 'خواردنەوە' },
  { value: 'supermarket-cleaning', label: 'پاککەرەوەکان', description: 'کەلوپەلی پاککردنەوە' },
  { value: 'supermarket-daily', label: 'کاڵای ڕۆژانە', description: 'پێداویستیی ڕۆژانە' },
  { value: 'supermarket-fresh', label: 'خواردنی تازە', description: 'میوە، سەوزە و خواردنی تازە' },
  { value: 'delivery', label: 'خزمەتگوزاریی گەیاندن', description: 'پۆستی خزمەتگوزاری' },
  { value: 'cars', label: 'ئۆتۆمبێل', description: 'کرێی گەیاندن هەمیشە سفرە', disabled: true },
  { value: 'umrah', label: 'عومرە', description: 'کرێی گەیاندن هەمیشە سفرە', disabled: true },
  { value: 'hajj', label: 'حەج', description: 'کرێی گەیاندن هەمیشە سفرە', disabled: true },
] as const;

const categoryLabel = (key: string) =>
  categoryOptions.find((item) => item.value === key)?.label ?? key;

const money = (value: number) => Math.round(Number(value) || 0).toLocaleString('en-US') + ' د.ع';

export function DeliveryFeeSettingsPage() {
  const { permissions } = useAuthorization();
  const canManage = permissions.has('settings.manage');
  const [rules, setRules] = useState<DeliveryFeeRule[]>([]);
  const [platformFee, setPlatformFee] = useState('0');
  const [platformActive, setPlatformActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [categoryKey, setCategoryKey] = useState('food');
  const [deliveryFee, setDeliveryFee] = useState('1000');
  const [ruleActive, setRuleActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextRules, platform] = await Promise.all([getDeliveryFeeRules(), getPlatformFeeSetting()]);
      setRules(nextRules);
      setPlatformFee(String(platform.platform_fee_iqd ?? 0));
      setPlatformActive(platform.is_active);
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
    setCategoryKey('food');
    setDeliveryFee('1000');
    setRuleActive(true);
  };

  const savePlatform = async () => {
    if (!canManage || savingPlatform) return;
    setError(null);
    setMessage(null);
    setSavingPlatform(true);
    try {
      const amount = Number(platformFee);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new Error('کرێی پلاتفۆرم دەبێت ژمارەیەکی سفر یان زیاتر بێت.');
      await savePlatformFeeSetting(amount, platformActive);
      setPlatformFee(String(Math.round(amount)));
      setMessage('کرێی پلاتفۆرمی SHAKH پاشەکەوت کرا. ئەمە بۆ داواکارییە نوێکان جێبەجێ دەبێت.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی کرێی پلاتفۆرم سەرکەوتوو نەبوو.');
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
      if (!city.trim()) throw new Error('شارێک بنووسە یان «هەموو شارەکان» هەڵبژێرە.');
      const amount = Number(deliveryFee);
      await saveDeliveryFeeRule({
        ...(editingId ? { id: editingId } : {}),
        city: ['*', 'هەموو شارەکان'].includes(city.trim()) ? '*' : city.trim(),
        categoryKey,
        deliveryFeeIqd: amount,
        isActive: ruleActive,
      });
      setMessage('نرخی گەیاندن پاشەکەوت کرا. نرخە نوێکان تەنها بۆ داواکارییەکانی داهاتوو جێبەجێ دەبن.');
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
    setCity(rule.city);
    setCategoryKey(rule.category_key);
    setDeliveryFee(String(rule.delivery_fee_iqd));
    setRuleActive(rule.is_active);
    setError(null);
    setMessage(null);
  };

  const removeRule = async (rule: DeliveryFeeRule) => {
    if (!canManage || deletingId) return;
    const confirmed = window.confirm('دڵنیایت لە سڕینەوەی ئەم ڕێکخستنەی کرێی گەیاندن؟ نرخەکانی داواکارییە کۆنەکان ناگۆڕدرێن.');
    if (!confirmed) return;
    setDeletingId(rule.id);
    setError(null);
    setMessage(null);
    try {
      await deleteDeliveryFeeRule(rule.id);
      setMessage('ڕێکخستنی کرێی گەیاندن سڕدرایەوە؛ لەوە بەدوا نرخەکە لە ڕێسای بنەڕەت یان fallback وەردەگیرێت.');
      if (editingId === rule.id) resetRuleForm();
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'سڕینەوەی ڕێکخستن سەرکەوتوو نەبوو.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-[var(--shakh-orange)]"><Calculator size={15}/> SHAKH · Pricing control</div>
            <h1 className="mt-1 text-3xl font-black">کرێی گەیاندن و پلاتفۆرم</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-black/50">نرخی گەیاندن بەپێی شار و کاتەگۆری ڕێکبخە. کرێی پلاتفۆرمی SHAKH یەک نرخە بۆ هەر ئۆردەرێک؛ گۆڕانکارییەکان تەنها بۆ داواکاریی نوێ جێبەجێ دەبن.</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-xs font-black"><RefreshCw size={15}/> نوێکردنەوە</button>
        </header>

        {!canManage ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">ئەم بەشە تەنها بۆ ئەدمینی مۆڵەت‌پێدراوە.</div> : null}
        {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><Calculator size={20}/></span><div><h2 className="text-lg font-black">کرێی پلاتفۆرمی SHAKH</h2><p className="text-xs text-black/40">بۆ هەر داواکارییەک، بە دیناری عێراقی</p></div></div>
            <label className="mt-5 block text-sm font-black">بڕی کرێ (د.ع)
              <input type="number" min="0" max="100000000" step="1" value={platformFee} onChange={(event) => setPlatformFee(event.target.value)} disabled={!canManage || savingPlatform} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-base font-black outline-none focus:border-[var(--shakh-blue)]"/>
            </label>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--shakh-bg)] p-3">
              <input type="checkbox" checked={platformActive} onChange={(event) => setPlatformActive(event.target.checked)} disabled={!canManage || savingPlatform} className="mt-1 size-4"/>
              <span><span className="block text-sm font-black">چالاککردنی کرێی پلاتفۆرم</span><span className="mt-1 block text-xs leading-5 text-black/45">ئەگەر ناچالاک بێت، بۆ ئۆردەرە نوێکان کرێی پلاتفۆرم سفر دەبێت.</span></span>
            </label>
            {Number(platformFee) === 0 && platformActive ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">کرێی پلاتفۆرم هێشتا ٠ د.ع ـە. بڕێک دیاری بکە بۆ ئەوەی لە وەسڵی ئۆردەرە نوێکان زیاد بکرێت.</p> : null}
            <button type="button" onClick={() => void savePlatform()} disabled={!canManage || savingPlatform || loading} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{savingPlatform ? 'پاشەکەوتکردن...' : 'پاشەکەوتکردنی کرێی پلاتفۆرم'}</button>
          </section>

          <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><Truck size={20}/></span><div><h2 className="text-lg font-black">{editingId ? 'دەستکاری نرخی گەیاندن' : 'زیادکردنی نرخی گەیاندن'}</h2><p className="text-xs text-black/40">بە پێی شار و کاتەگۆری</p></div></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-black">شار
                <input list="fee-cities" value={city} onChange={(event) => setCity(event.target.value)} disabled={!canManage || savingRule} maxLength={120} placeholder="بەردەڕەش" className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal outline-none focus:border-[var(--shakh-blue)]"/>
                <datalist id="fee-cities">{[...new Set(rules.map((rule) => rule.city).filter((value) => value !== '*'))].map((value) => <option key={value} value={value}/>)}</datalist>
                <span className="mt-1 block text-[11px] font-normal text-black/40">بۆ fallback ـی هەموو شارەکان «هەموو شارەکان» دیاری بکە.</span>
              </label>
              <label className="block text-sm font-black">کاتەگۆری
                <select value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)} disabled={!canManage || savingRule} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-[var(--shakh-blue)]">
                  {categoryOptions.map((option) => <option key={option.value} value={option.value} disabled={'disabled' in option ? option.disabled : false}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-black">کرێی گەیاندن (د.ع)
                <input type="number" min="0" max="100000000" step="1" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} disabled={!canManage || savingRule || ['cars','umrah','hajj'].includes(categoryKey)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-base font-black outline-none focus:border-[var(--shakh-blue)]"/>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[var(--shakh-bg)] p-3 text-sm font-black">
                <input type="checkbox" checked={ruleActive} onChange={(event) => setRuleActive(event.target.checked)} disabled={!canManage || savingRule}/>
                نرخ چالاکە
              </label>
            </div>
            <div className="mt-4 rounded-2xl bg-[var(--shakh-bg)] p-3 text-xs leading-6 text-black/50">
              <div className="flex items-center gap-2 font-black text-black/70"><MapPin size={14}/> نموونەی نرخ</div>
              <p className="mt-1">بەردەڕەش + خواردن = ١,٠٠٠ د.ع. شار و کاتەگۆرییەکانی تر دەتوانیت بە جیاوازی ڕێکبخەیت. ئۆتۆمبێل و حەج/عومرە کرێی گەیاندنیان نییە.</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveRule()} disabled={!canManage || savingRule || loading || ['cars','umrah','hajj'].includes(categoryKey)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{savingRule ? 'پاشەکەوتکردن...' : editingId ? 'نوێکردنەوەی نرخ' : 'زیادکردنی نرخ'}</button>
              {editingId ? <button type="button" onClick={resetRuleForm} disabled={savingRule} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-4 py-3 text-sm font-black"><X size={15}/> پاشگەزبوونەوە</button> : null}
            </div>
          </section>
        </div>

        <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">ڕێساکانی کرێی گەیاندن</h2><p className="mt-1 text-sm text-black/45">نرخی دیاریکراوی شار/کاتەگۆری پێش نرخە بنەڕەتییەکان هەڵدەبژێردرێت. نرخە کۆنەکانی ئۆردەر ناگۆڕدرێن.</p></div><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{rules.length} ڕێسا</span></div>
          {loading ? <div className="mt-5 rounded-2xl bg-[var(--shakh-bg)] p-8 text-center text-sm font-bold text-black/40">بارکردن...</div> : rules.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-black/10 p-8 text-center text-sm text-black/45">هێشتا هیچ ڕێسایەک نییە.</div> : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {rules.map((rule) => (
                <article key={rule.id} className="rounded-2xl border border-black/[0.06] bg-white p-4">
                  <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black">{rule.city === '*' ? 'هەموو شارەکان' : rule.city}</span><span className="rounded-full bg-[var(--shakh-blue)]/8 px-2 py-1 text-[10px] font-black text-[var(--shakh-blue)]">{categoryLabel(rule.category_key)}</span></div><div className="mt-2 text-2xl font-black">{money(rule.delivery_fee_iqd)}</div></div><span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + (rule.is_active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-black/5 text-black/40')}>{rule.is_active ? 'چالاک' : 'ناچالاک'}</span></div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">
                    <button type="button" onClick={() => editRule(rule)} disabled={!canManage || Boolean(deletingId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-black disabled:opacity-40"><Pencil size={13}/> دەستکاری</button>
                    <button type="button" onClick={() => void removeRule(rule)} disabled={!canManage || deletingId === rule.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-40"><Trash2 size={13}/>{deletingId === rule.id ? 'سڕینەوە...' : 'سڕینەوە'}</button>
                    {rule.is_active ? <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={12}/> بەکاردێت</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-4 text-xs leading-6 text-black/45"><ShieldCheck size={15} className="me-1 inline text-[var(--shakh-blue)]"/> نرخەکان لە داتابەیسی Supabase هەژمار دەکرێن؛ frontend ناتوانێت کرێی ئۆردەر بگۆڕێت. کرێی پلاتفۆرم لە ئێستادا بە شێوەی نرخێکی جێگیر بۆ هەر ئۆردەرێکە؛ ئەگەر ناچالاک بێت سفر دەبێت.</div>
      </div>
    </section>
  );
}
