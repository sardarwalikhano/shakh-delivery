import { Boxes, ChevronDown, Edit3, ImagePlus, PackagePlus, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { addVendorProductImage, createVendorProduct, createVendorVariant, deleteDraftProduct, deleteVendorProductImage, deleteVendorVariant, getVendorProductImages, getVendorProducts, getVendorStores, getVendorVariants, updateVendorProduct, updateVendorVariant, type VendorProduct, type VendorProductImage, type VendorStore, type VendorVariant } from '../api';
import { supabase } from '@/lib/supabase/client';
import { deleteProductImage, getProductImageUrl, uploadProductImage } from '@/lib/storage/catalogMedia';

type Category = { id: string; name_ku: string; name_ar: string; name_en: string };

export function VendorProductsPage() {
  const { user } = useAuth();
  const { role } = useAuthorization();
  const [stores, setStores] = useState<VendorStore[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VendorProduct | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name_ku: '', name_ar: '', name_en: '', slug: '', category_id: '', base_price_iqd: '', compare_at_price_iqd: '', stock_quantity: '0', description_ku: '' });

  const refresh = async () => {
    if (!user) return;
    setLoading(true); setMessage(null);
    try {
      const [nextStores, nextProducts, catResult] = await Promise.all([
        getVendorStores(user.id, role),
        getVendorProducts(user.id, storeId || undefined),
        supabase.from('categories').select('id,name_ku,name_ar,name_en').eq('is_active', true).order('sort_order', { ascending: true }),
      ]);
      setStores(nextStores);
      setProducts(nextProducts);
      setCategories((catResult.data ?? []) as Category[]);
      if (!storeId && nextStores[0]) setStoreId(nextStores[0].id);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'هەڵەیەک ڕوویدا.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user) void refresh(); }, [user, role, storeId]);

  const selectedStore = useMemo(() => stores.find((item) => item.id === storeId) ?? null, [stores, storeId]);

  const resetForm = () => {
    setEditing(null); setShowForm(false);
    setForm({ name_ku: '', name_ar: '', name_en: '', slug: '', category_id: '', base_price_iqd: '', compare_at_price_iqd: '', stock_quantity: '0', description_ku: '' });
  };

  const edit = (product: VendorProduct) => {
    setEditing(product); setShowForm(true);
    setForm({ name_ku: product.name_ku, name_ar: product.name_ar, name_en: product.name_en, slug: product.slug, category_id: product.category_id ?? '', base_price_iqd: String(product.base_price_iqd), compare_at_price_iqd: product.compare_at_price_iqd == null ? '' : String(product.compare_at_price_iqd), stock_quantity: String(product.stock_quantity), description_ku: product.description_ku ?? '' });
  };

  const save = async () => {
    if (!user) return;
    setMessage(null);
    try {
      const base = Number(form.base_price_iqd);
      const compare = form.compare_at_price_iqd ? Number(form.compare_at_price_iqd) : null;
      const stock = Math.max(0, Math.floor(Number(form.stock_quantity)));
      if (!form.name_ku || !form.name_ar || !form.name_en || !form.slug || !Number.isFinite(base)) throw new Error('ناو، slug و نرخ پێویستن.');
      if (compare !== null && compare < base) throw new Error('نرخی پێشوو نابێت لە نرخی ئێستا کەمتر بێت.');
      if (editing) {
        await updateVendorProduct(user.id, editing.id, { name_ku: form.name_ku, name_ar: form.name_ar, name_en: form.name_en, slug: form.slug, category_id: form.category_id || null, base_price_iqd: base, compare_at_price_iqd: compare, stock_quantity: stock, description_ku: form.description_ku });
        setMessage('بەرهەم نوێکرایەوە.');
      } else {
        if (!selectedStore) throw new Error('سەرەتا فرۆشگایەک هەڵبژێرە.');
        await createVendorProduct(user.id, { store_id: selectedStore.id, category_id: form.category_id || null, name_ku: form.name_ku, name_ar: form.name_ar, name_en: form.name_en, slug: form.slug, base_price_iqd: base, compare_at_price_iqd: compare, stock_quantity: stock, description_ku: form.description_ku });
        setMessage('بەرهەم دروستکرا و بە دۆخی draft هەڵگیرا.');
      }
      resetForm(); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'هەڵەیەک ڕوویدا.'); }
  };

  const remove = async (product: VendorProduct) => {
    if (!user || product.status !== 'draft') return;
    try { await deleteDraftProduct(user.id, product.id); setProducts((items) => items.filter((item) => item.id !== product.id)); setMessage('بەرهەمی draft سڕایەوە.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'سڕینەوە سەرنەکەوت.'); }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/[0.06] bg-white p-6 shadow-[0_14px_45px_rgba(16,22,35,.04)] sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><Boxes size={22} /></div><div><div className="text-xs font-black text-[var(--shakh-orange)]">Catalog management</div><h1 className="text-2xl font-black">بەرهەمەکان</h1></div></div>
          <button disabled={!selectedStore} onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-40"><PackagePlus size={17} /> بەرهەمی نوێ</button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label><span className="text-xs font-black text-black/50">فرۆشگا</span><div className="relative mt-2"><select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="h-12 w-full appearance-none rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 pe-10 text-sm font-black outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10"><option value="">فرۆشگایەک هەڵبژێرە</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name_ku} — {store.status}</option>)}</select><ChevronDown className="pointer-events-none absolute end-3 top-3.5 text-black/35" size={18} /></div></label>
          <div className="rounded-2xl bg-[var(--shakh-bg)] px-5 py-3 text-sm"><div className="text-xs font-bold text-black/35">کۆی بەرهەم</div><div className="mt-1 text-xl font-black">{products.length.toLocaleString('en-US')}</div></div>
        </div>
        {message ? <div className="mt-5 rounded-2xl bg-[var(--shakh-blue)]/8 px-4 py-3 text-sm font-bold leading-6 text-[var(--shakh-blue)]">{message}</div> : null}
      </section>

      {showForm ? <ProductForm form={form} setForm={setForm} categories={categories} editing={editing} onCancel={resetForm} onSave={() => void save()} /> : null}

      <section className="space-y-3">
        {loading ? <div className="rounded-[30px] bg-white p-12 text-center text-sm font-bold text-black/45">بارکردن...</div> : products.length === 0 ? <div className="rounded-[30px] border border-dashed border-black/10 bg-white p-12 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--shakh-bg)] text-black/30"><Boxes size={24} /></div><h2 className="mt-4 text-lg font-black">هێشتا بەرهەم نییە</h2><p className="mt-2 text-sm leading-7 text-black/45">یەکەم بەرهەم دروست بکە؛ هەموو بەرهەمە نوێکان بە `draft` دەستپێدەکەن تا approval سیستەمەکە دواتر status ـیان بگۆڕێت.</p></div> : products.map((product) => <VendorProductRow key={product.id} product={product} userId={user?.id ?? ''} onEdit={() => edit(product)} onDelete={() => void remove(product)} />)}
      </section>
    </div>
  );
}

function ProductForm({ form, setForm, categories, editing, onCancel, onSave }: { form: ReturnType<typeof useState>[0] & { name_ku: string; name_ar: string; name_en: string; slug: string; category_id: string; base_price_iqd: string; compare_at_price_iqd: string; stock_quantity: string; description_ku: string }; setForm: React.Dispatch<React.SetStateAction<any>>; categories: Category[]; editing: VendorProduct | null; onCancel: () => void; onSave: () => void }) {
  const f = (key: keyof typeof form, value: string) => setForm((current: typeof form) => ({ ...current, [key]: value }));
  return <section className="rounded-[30px] border border-black/[0.06] bg-white p-6 shadow-[0_14px_45px_rgba(16,22,35,.04)] sm:p-8"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">{editing ? 'Edit' : 'Create'}</div><h2 className="mt-1 text-xl font-black">{editing ? 'دەستکاری بەرهەم' : 'دروستکردنی بەرهەم'}</h2></div><button onClick={onCancel} className="grid size-10 place-items-center rounded-xl bg-[var(--shakh-bg)]"><X size={18} /></button></div><div className="mt-7 grid gap-4 md:grid-cols-2"><Field label="ناوی کوردی" value={form.name_ku} onChange={(v) => f('name_ku', v)} dir="rtl" /><Field label="ناوی عەرەبی" value={form.name_ar} onChange={(v) => f('name_ar', v)} dir="rtl" /><Field label="English name" value={form.name_en} onChange={(v) => f('name_en', v)} dir="ltr" /><Field label="Slug" value={form.slug} onChange={(v) => f('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} dir="ltr" /><label><span className="text-xs font-black text-black/55">Category</span><select value={form.category_id} onChange={(e) => f('category_id', e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold"><option value="">بێ category</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name_ku}</option>)}</select></label><Field label="Stock" value={form.stock_quantity} onChange={(v) => f('stock_quantity', v)} dir="ltr" inputMode="numeric" /><Field label="نرخی IQD" value={form.base_price_iqd} onChange={(v) => f('base_price_iqd', v)} dir="ltr" inputMode="decimal" /><Field label="نرخی پێشوو" value={form.compare_at_price_iqd} onChange={(v) => f('compare_at_price_iqd', v)} dir="ltr" inputMode="decimal" /><label className="md:col-span-2"><span className="text-xs font-black text-black/55">وەسفی کوردی</span><textarea value={form.description_ku} onChange={(e) => f('description_ku', e.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10" /></label></div><div className="mt-6 flex flex-wrap gap-3"><button onClick={onSave} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white"><Save size={17} /> پاشەکەوتکردن</button><button onClick={onCancel} className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black">هەڵوەشاندنەوە</button></div></section>;
}

function Field({ label, value, onChange, dir, inputMode }: { label: string; value: string; onChange: (value: string) => void; dir?: 'ltr' | 'rtl'; inputMode?: 'numeric' | 'decimal' }) { return <label><span className="text-xs font-black text-black/55">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} dir={dir} inputMode={inputMode} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10" /></label>; }

function VendorProductRow({ product, userId, onEdit, onDelete }: { product: VendorProduct; userId: string; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<VendorVariant[]>([]);
  const [images, setImages] = useState<VendorProductImage[]>([]);
  const [variantForm, setVariantForm] = useState({ name_ku: '', name_ar: '', name_en: '', sku: '', price_iqd: '', stock_quantity: '0' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);

  const loadDetails = async () => {
    if (!userId) return;
    const [variantResult, imageResult] = await Promise.all([getVendorVariants(userId, product.id), getVendorProductImages(userId, product.id)]);
    setVariants(variantResult);
    setImages(imageResult);
    setOpen(true);
  };
  const addVariant = async () => { setSaving(true); try { const created = await createVendorVariant(userId, { product_id: product.id, ...variantForm, price_iqd: variantForm.price_iqd ? Number(variantForm.price_iqd) : null, stock_quantity: Math.max(0, Number(variantForm.stock_quantity)) }); setVariants((items) => [...items, created]); setVariantForm({ name_ku: '', name_ar: '', name_en: '', sku: '', price_iqd: '', stock_quantity: '0' }); } finally { setSaving(false); } };
  const updateVariantStock = async (variant: VendorVariant, next: string) => { const updated = await updateVendorVariant(userId, variant.id, { stock_quantity: Math.max(0, Math.floor(Number(next))) }); setVariants((items) => items.map((item) => item.id === variant.id ? updated : item)); };
  const uploadImage = async (file: File) => {
    setUploading(true); setMediaMessage(null);
    try {
      const path = await uploadProductImage(userId, product.id, file);
      const row = await addVendorProductImage(userId, product.id, path);
      setImages((items) => [...items, row]);
      setMediaMessage('وێنەکە بە سەرکەوتوویی بارکرا.');
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : 'بارکردنی وێنە سەرنەکەوت.');
    } finally { setUploading(false); }
  };
  const removeImage = async (image: VendorProductImage) => {
    setMediaMessage(null);
    try {
      const path = await deleteVendorProductImage(userId, image.id);
      await deleteProductImage(path);
      setImages((items) => items.filter((item) => item.id !== image.id));
      setMediaMessage('وێنەکە سڕایەوە.');
    } catch (error) {
      setMediaMessage(error instanceof Error ? error.message : 'سڕینەوەی وێنە سەرنەکەوت.');
    }
  };
  return <article className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_38px_rgba(16,22,35,.035)]"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--shakh-bg)]">{images[0] ? <img src={getProductImageUrl(images[0].storage_path)} alt={images[0].alt_ku ?? product.name_ku} className="h-full w-full object-cover" loading="lazy" /> : <Boxes size={22} className="text-black/25" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-black">{product.name_ku}</h3><span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-black text-black/45">{product.status}</span></div><div className="mt-1 text-xs text-black/35">{product.category?.name_ku ?? 'بێ category'} · {product.slug}</div><div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span className="font-black">{product.base_price_iqd.toLocaleString('en-US')} د.ع</span><span className="text-black/40">stock: {product.stock_quantity}</span></div></div><div className="flex gap-2"><button onClick={onEdit} className="grid size-10 place-items-center rounded-xl bg-[var(--shakh-bg)]" title="دەستکاری"><Edit3 size={17} /></button>{product.status === 'draft' ? <button onClick={onDelete} className="grid size-10 place-items-center rounded-xl bg-red-500/8 text-red-600" title="سڕینەوە"><Trash2 size={17} /></button> : null}<button onClick={() => { if (open) setOpen(false); else void loadDetails(); }} className="inline-flex items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-3 py-2 text-xs font-black text-white"><Plus size={15} /> وردەکاری</button></div></div>{open ? <div className="mt-5 space-y-6 border-t border-black/[0.06] pt-5"><div><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">وێنەکانی بەرهەم</div><div className="mt-1 text-xs text-black/40">JPG, PNG, WebP — تا 5MB.</div></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--shakh-blue)] px-3 py-2 text-xs font-black text-white has-[:disabled]:opacity-40"><Upload size={15} /> {uploading ? 'بارکردن...' : 'زیادکردنی وێنە'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => { const file=e.target.files?.[0]; e.currentTarget.value=''; if (file) void uploadImage(file); }} className="sr-only" /></label></div>{images.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image) => <div key={image.id} className="group relative overflow-hidden rounded-2xl border border-black/[0.06]"><img src={getProductImageUrl(image.storage_path)} alt={image.alt_ku ?? product.name_ku} className="aspect-square w-full object-cover" loading="lazy" /><button onClick={() => void removeImage(image)} className="absolute end-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100" aria-label="سڕینەوەی وێنە"><Trash2 size={14} /></button></div>)}</div> : <div className="mt-4 rounded-2xl bg-[var(--shakh-bg)] p-4 text-xs font-bold text-black/40"><ImagePlus size={16} className="mb-2" />هێشتا وێنەیەکی ئەم بەرهەمە بار نەکراوە.</div>}{mediaMessage ? <div className="mt-3 rounded-2xl bg-[var(--shakh-blue)]/8 px-4 py-3 text-xs font-bold text-[var(--shakh-blue)]">{mediaMessage}</div> : null}</div><div><div className="text-sm font-black">Variants</div><div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_140px_120px_auto]">{(['name_ku','name_ar','name_en','sku','price_iqd','stock_quantity'] as const).map((key) => <input key={key} value={variantForm[key as keyof typeof variantForm]} onChange={(e) => setVariantForm({ ...variantForm, [key]: e.target.value })} placeholder={key.replace('_', ' ')} className="h-10 rounded-xl border border-black/10 bg-[var(--shakh-bg)] px-3 text-xs font-bold" />)}<button disabled={saving} onClick={() => void addVariant()} className="h-10 rounded-xl bg-[var(--shakh-blue)] px-4 text-xs font-black text-white disabled:opacity-40">زیادکردن</button></div><div className="mt-4 space-y-2">{variants.map((variant) => <div key={variant.id} className="flex flex-col gap-3 rounded-2xl bg-[var(--shakh-bg)] p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="font-black">{variant.name_ku}</div><div className="text-[11px] text-black/35">{variant.sku ?? 'SKU نییە'} · {variant.price_iqd == null ? product.base_price_iqd : variant.price_iqd.toLocaleString('en-US')} د.ع</div></div><input value={variant.stock_quantity} onChange={(e) => void updateVariantStock(variant, e.target.value)} inputMode="numeric" className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-black sm:w-28" aria-label="stock" /><button onClick={() => void deleteVendorVariant(userId, variant.id).then(() => setVariants((items) => items.filter((item) => item.id !== variant.id)))} className="grid size-10 place-items-center rounded-xl bg-white text-red-600" aria-label="سڕینەوە"><Trash2 size={16} /></button></div>)}</div></div></div> : null}</article>;
}
