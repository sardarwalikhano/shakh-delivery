import { Building2, CheckCircle2, Plus, Save, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { createVendorStore, getVendorStores, updateVendorStore, type VendorStore } from '../api';

export function VendorStorePage() {
  const { user } = useAuth();
  const { role } = useAuthorization();
  const [stores, setStores] = useState<VendorStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name_ku: '', name_ar: '', name_en: '', slug: '', description_ku: '' });

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try { setStores(await getVendorStores(user.id, role)); } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [user, role]);

  const loadStore = (store: VendorStore) => {
    setSelected(store.id);
    setForm({ name_ku: store.name_ku, name_ar: store.name_ar, name_en: store.name_en, slug: store.slug, description_ku: store.description_ku ?? '' });
    setMessage(null);
  };

  const reset = () => {
    setSelected(null);
    setForm({ name_ku: '', name_ar: '', name_en: '', slug: '', description_ku: '' });
    setMessage(null);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true); setMessage(null);
    try {
      if (!form.name_ku || !form.name_ar || !form.name_en || !form.slug) throw new Error('ناوی فرۆشگا و slug پێویستن.');
      if (selected) {
        await updateVendorStore(user.id, selected, { ...form });
        setMessage('زانیاری فرۆشگا نوێکرایەوە.');
      } else {
        await createVendorStore(user.id, { ...form });
        setMessage('داواکاری فرۆشگا نێردرا و چاوەڕوانی پشتڕاستکردنەوەی بەڕێوەبەرە.');
      }
      await refresh();
      if (!selected) reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'هەڵەیەک ڕوویدا.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/[0.06] bg-white p-6 shadow-[0_14px_45px_rgba(16,22,35,.04)] sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]"><Store size={22} /></div><div><div className="text-xs font-black text-[var(--shakh-blue)]">Vendor workspace</div><h1 className="text-2xl font-black">فرۆشگا</h1></div></div>
          <button onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white"><Plus size={17} /> فرۆشگای نوێ</button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric icon={<Building2 size={17} />} label="فرۆشگاکان" value={stores.length.toLocaleString('en-US')} />
          <Metric icon={<CheckCircle2 size={17} />} label="چالاک" value={stores.filter((s) => s.status === 'active').length.toLocaleString('en-US')} />
          <Metric icon={<Store size={17} />} label="لە چاوەڕوانی" value={stores.filter((s) => s.status === 'pending').length.toLocaleString('en-US')} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <section className="rounded-[30px] border border-black/[0.06] bg-white p-4 shadow-[0_14px_45px_rgba(16,22,35,.04)]">
          <div className="px-2 py-2 text-sm font-black">فرۆشگاکانی تۆ</div>
          <div className="mt-2 space-y-2">
            {loading ? <div className="p-5 text-sm font-bold text-black/40">بارکردن...</div> : stores.length === 0 ? <div className="rounded-2xl bg-[var(--shakh-bg)] p-5 text-sm leading-7 text-black/45">هێشتا فرۆشگات نییە. لە لایەنی ڕاست یەکەم فرۆشگا دروست بکە.</div> : stores.map((store) => (
              <button key={store.id} onClick={() => loadStore(store)} className={`w-full rounded-2xl p-4 text-start transition ${selected === store.id ? 'bg-[var(--shakh-navy)] text-white' : 'bg-[var(--shakh-bg)] hover:bg-black/[0.05]'}`}>
                <div className="flex items-center justify-between gap-3"><span className="truncate font-black">{store.name_ku}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${selected === store.id ? 'bg-white/10 text-white' : 'bg-white text-black/50'}`}>{statusLabel(store.status)}</span></div>
                <div className={`mt-1 truncate text-xs ${selected === store.id ? 'text-white/45' : 'text-black/35'}`}>{store.slug}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-black/[0.06] bg-white p-6 shadow-[0_14px_45px_rgba(16,22,35,.04)] sm:p-8">
          <div><div className="text-xs font-black text-[var(--shakh-orange)]">{selected ? 'دەستکاری' : 'دروستکردن'}</div><h2 className="mt-1 text-xl font-black">زانیاری فرۆشگا</h2><p className="mt-2 text-sm leading-6 text-black/45">دۆخی فرۆشگا لەلایەن بەڕێوەبەرەوە کنترل دەکرێت؛ vendor ناتوانێت خۆی `active` بکا.</p></div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <Field label="ناوی کوردی" value={form.name_ku} onChange={(v) => setForm({ ...form, name_ku: v })} dir="rtl" />
            <Field label="ناوی عەرەبی" value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} dir="rtl" />
            <Field label="English name" value={form.name_en} onChange={(v) => setForm({ ...form, name_en: v })} dir="ltr" />
            <Field label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} dir="ltr" />
            <label className="md:col-span-2"><span className="text-xs font-black text-black/55">وەسفی کوردی</span><textarea value={form.description_ku} onChange={(e) => setForm({ ...form, description_ku: e.target.value })} rows={4} className="mt-2 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 py-3 text-sm outline-none ring-[var(--shakh-blue)]/20 focus:ring-4" /></label>
          </div>
          {message ? <div className="mt-5 rounded-2xl bg-[var(--shakh-blue)]/8 px-4 py-3 text-sm font-bold leading-6 text-[var(--shakh-blue)]">{message}</div> : null}
          <div className="mt-6 flex flex-wrap gap-3"><button disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-40"><Save size={17} /> {saving ? 'پاشەکەوتکردن...' : selected ? 'پاشەکەوتکردنی گۆڕانکاری' : 'ناردنی داواکاری'}</button>{selected ? <button onClick={reset} className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black">هەڵوەشاندنەوە</button> : null}</div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, dir }: { label: string; value: string; onChange: (value: string) => void; dir?: 'ltr' | 'rtl' }) {
  return <label><span className="text-xs font-black text-black/55">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} dir={dir} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10" /></label>;
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="flex items-center gap-2 text-xs font-bold text-black/40">{icon}{label}</div><div className="mt-2 text-xl font-black">{value}</div></div>; }
function statusLabel(status: VendorStore['status']) { return status === 'active' ? 'چالاک' : status === 'pending' ? 'چاوەڕوان' : status === 'suspended' ? 'راگیراو' : 'داخراو'; }
