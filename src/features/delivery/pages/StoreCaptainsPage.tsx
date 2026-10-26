import { useCallback, useEffect, useState } from 'react';
import { UserPlus, RefreshCw, Wifi, WifiOff, UserRound, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type Captain = {
  captain_id: string;
  full_name: string | null;
  phone: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  is_active?: boolean;
};

export function StoreCaptainsPage() {
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [eligible, setEligible] = useState<Captain[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [roster, available] = await Promise.all([
      supabase.rpc('list_store_captains'),
      supabase.rpc('list_eligible_store_captains'),
    ]);
    if (roster.error || available.error) {
      setError(roster.error?.message ?? available.error?.message ?? 'نەتوانرا لیستی کاپتنەکان بخوێندرێتەوە.');
    } else {
      setCaptains((roster.data ?? []) as Captain[]);
      setEligible((available.data ?? []) as Captain[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const addCaptain = async () => {
    if (!selectedId) return;
    setSaving(true); setError(null); setMessage(null);
    const { error: rpcError } = await supabase.rpc('add_store_captain', { p_captain_id: selectedId });
    if (rpcError) setError(rpcError.message);
    else { setMessage('کاپتن زیاد کرا بۆ تیمی دوکانەکەت.'); setSelectedId(''); await refresh(); }
    setSaving(false);
  };

  const toggleCaptain = async (captain: Captain) => {
    setSaving(true); setError(null); setMessage(null);
    const { error: rpcError } = await supabase.rpc('set_store_captain_active', {
      p_captain_id: captain.captain_id,
      p_is_active: !captain.is_active,
    });
    if (rpcError) setError(rpcError.message);
    else { setMessage(captain.is_active ? 'کاپتن لە تیمی دوکان ناچالاک کرا.' : 'کاپتن چالاک کرایەوە.'); await refresh(); }
    setSaving(false);
  };

  return (
    <section className="space-y-6" dir="rtl">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-slate-800 p-6 text-white sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-white/10 p-3"><UserRound size={28} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-orange-300">بەڕێوەبردنی گەیاندن</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">کاپتنەکانی دوکانەکەم</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">کاپتنێکی مۆڵەتپێدراوی شاخ زیاد بکە بۆ تیمی دوکانەکەت. ئەم لیستە تایبەتە بە هەژماری تۆ و لە لیستی کاپتنە گشتییەکە جیاوازە.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-bold hover:bg-white/15 disabled:opacity-50"><RefreshCw size={16} /> نوێکردنەوە</button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><UserPlus size={20} className="text-orange-600" /><h2 className="text-lg font-black text-slate-900">زیادکردنی کاپتن</h2></div>
          <p className="mt-2 text-sm leading-6 text-slate-600">تەنها هەژمارێک هەڵبژێرە کە ڕۆڵی کاپتنی پێدراوە. کاپتن خۆی لە بەشی کاپتنەکانی شاخ بەڕێوەدەبات.</p>
          <label htmlFor="captain-select" className="mt-5 block text-sm font-bold text-slate-800">کاپتن</label>
          <select id="captain-select" value={selectedId} onChange={e => setSelectedId(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
            <option value="">کاپتن هەڵبژێرە...</option>
            {eligible.map(c => <option key={c.captain_id} value={c.captain_id}>{c.full_name || 'بێ ناو'}{c.phone ? ' — ' + c.phone : ''}{c.is_online ? ' (ئۆنلاین)' : ' (ئۆفلاین)'}</option>)}
          </select>
          <button type="button" onClick={() => void addCaptain()} disabled={!selectedId || saving} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"><UserPlus size={18} /> {saving ? 'چاوەڕوان بە...' : 'زیادکردن بۆ دوکان'}</button>
          {eligible.length === 0 && !loading && <p className="mt-3 text-sm text-slate-500">هیچ کاپتنێکی نوێ بەردەست نییە بۆ زیادکردن.</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-slate-900">تیمی گەیاندن</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{captains.length} کاپتن</span></div>
          {loading ? <p className="py-10 text-center text-sm text-slate-500">لیستی کاپتنەکان دەخوێندرێتەوە...</p> :
            captains.length === 0 ? <div className="py-10 text-center"><ShieldCheck className="mx-auto text-slate-400" size={32} /><p className="mt-3 font-bold text-slate-800">هێشتا کاپتنێکت زیاد نەکردووە</p><p className="mt-1 text-sm text-slate-500">لە لیستی لای چەپ کاپتنێک هەڵبژێرە.</p></div> :
            <ul className="mt-4 divide-y divide-slate-100">{captains.map(c => <li key={c.captain_id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><UserRound size={20} /></div>
              <div className="min-w-0 flex-1"><p className="truncate font-black text-slate-900">{c.full_name || 'کاپتن'}</p><p className="mt-1 text-sm text-slate-500">{c.phone || 'ژمارەی تەلەفۆن نییە'}</p><div className="mt-1 flex items-center gap-1.5 text-xs font-bold">{c.is_online ? <><Wifi size={14} className="text-emerald-600" /><span className="text-emerald-700">ئۆنلاین</span></> : <><WifiOff size={14} className="text-slate-400" /><span className="text-slate-500">ئۆفلاین</span></>}<span className="text-slate-300">•</span><span className={c.is_active ? 'text-emerald-700' : 'text-rose-700'}>{c.is_active ? 'لە تیمدا چالاکە' : 'ناچالاکە'}</span></div></div>
              <button type="button" onClick={() => void toggleCaptain(c)} disabled={saving} className={`min-h-10 rounded-xl px-3 text-sm font-bold disabled:opacity-50 ${c.is_active ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>{c.is_active ? 'ناچالاککردن' : 'چالاککردن'}</button>
            </li>)}</ul>}
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{message}</div>}
    </section>
  );
}
