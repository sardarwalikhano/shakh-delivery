import { Boxes, Check, ChevronDown, Edit3, PackagePlus, Plus, Ruler, Save, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { addVendorProductImage, createVendorProduct, createVendorVariant, deleteDraftProduct, deleteVendorProductImage, deleteVendorVariant, getVendorProductImages, getVendorProducts, getVendorStores, getVendorVariants, updateVendorProduct, updateVendorVariant, type VendorProduct, type VendorProductImage, type VendorStore, type VendorVariant } from '../api';
import { supabase } from '@/lib/supabase/client';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import { deleteProductImage, getProductImageUrl, uploadProductImage } from '@/lib/storage/catalogMedia';
import { apparelColorPalette, apparelSeasonOptions, apparelTypeOptions, defaultSizesForApparel, isShoeType, type ApparelColor, type ApparelProductType } from '@/lib/catalog/apparel';

type Category = { id: string; parent_id: string | null; name_ku: string; name_ar: string; name_en: string; slug: string };
type ProductFormState = {
  name_ku: string; name_ar: string; name_en: string; slug: string; category_id: string;
  base_price_iqd: string; compare_at_price_iqd: string; stock_quantity: string; description_ku: string;
  apparel_product_type: string; brand: string; material: string; country_of_origin: string; season: string; seller_location: string;
};
type MatrixCell = { enabled: boolean; stock: string; price: string };
type ProductFormPayload = ProductFormState & { imageFiles: File[]; colors: ApparelColor[]; sizes: string[]; matrix: Record<string, MatrixCell> };

const emptyForm = (): ProductFormState => ({
  name_ku: '', name_ar: '', name_en: '', slug: '', category_id: '', base_price_iqd: '',
  compare_at_price_iqd: '', stock_quantity: '0', description_ku: '', apparel_product_type: '',
  brand: '', material: '', country_of_origin: '', season: '', seller_location: '',
});

function comboKey(colorKey: string, size: string): string {
  return colorKey + '::' + size;
}

function isApparelCategory(categoryId: string, categories: Category[]): boolean {
  const fashionRoot = categories.find((item) => item.slug === 'fashion');
  if (!categoryId || !fashionRoot) return false;

  let current = categories.find((item) => item.id === categoryId);
  while (current) {
    if (current.id === fashionRoot.id || current.slug === 'fashion') return true;
    current = current.parent_id ? categories.find((item) => item.id === current?.parent_id) : undefined;
  }
  return false;
}

function colorFromVariant(variant: VendorVariant): ApparelColor {
  const preset = apparelColorPalette.find((item) => item.hex.toLowerCase() === (variant.color_hex ?? '').toLowerCase());
  return {
    key: preset?.key ?? 'custom-' + (variant.color_name_ku ?? variant.name_ku).toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-'),
    name_ku: variant.color_name_ku ?? variant.name_ku,
    name_ar: variant.name_ar || variant.name_ku,
    name_en: variant.name_en || variant.name_ku,
    hex: variant.color_hex ?? '#9CA3AF',
    imageRef: variant.color_image_storage_path ? 'path:' + variant.color_image_storage_path : '',
    custom: !preset,
  };
}

export function VendorProductsPage() {
  const { user } = useAuth();
  const { role } = useAuthorization();
  const [stores, setStores] = useState<VendorStore[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<VendorProduct | null>(null);
  const [editingVariants, setEditingVariants] = useState<VendorVariant[]>([]);
  const [editingImages, setEditingImages] = useState<VendorProductImage[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);

  const refresh = async () => {
    if (!user) return;
    setLoading(true); setMessage(null);
    try {
      const [nextStores, nextProducts, catResult] = await Promise.all([
        getVendorStores(user.id, role),
        getVendorProducts(user.id, storeId || undefined),
        supabase.from('categories').select('id,parent_id,name_ku,name_ar,name_en,slug').eq('is_active', true).order('sort_order', { ascending: true }),
      ]);
      if (catResult.error) throw catResult.error;
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
    setFormKey((value) => value + 1);
    setEditing(null); setEditingVariants([]); setEditingImages([]); setShowForm(false); setForm(emptyForm());
  };

  const edit = async (product: VendorProduct) => {
    if (!user) return;
    setMessage(null);
    try {
      const [variants, images] = await Promise.all([
        getVendorVariants(user.id, product.id),
        getVendorProductImages(user.id, product.id),
      ]);
      setFormKey((value) => value + 1);
      setEditingVariants(variants);
      setEditingImages(images);
      setEditing(product);
      setForm({
        name_ku: product.name_ku, name_ar: product.name_ar, name_en: product.name_en, slug: product.slug,
        category_id: product.category_id ?? '', base_price_iqd: String(product.base_price_iqd),
        compare_at_price_iqd: product.compare_at_price_iqd == null ? '' : String(product.compare_at_price_iqd),
        stock_quantity: String(product.stock_quantity), description_ku: product.description_ku ?? '',
        apparel_product_type: product.apparel_product_type ?? '', brand: product.brand ?? '', material: product.material ?? '',
        country_of_origin: product.country_of_origin ?? '', season: product.season ?? '', seller_location: product.seller_location ?? '',
      });
      setShowForm(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'وردەکاریی بەرهەم نەخوێندرایەوە.');
    }
  };

  const save = async (data: ProductFormPayload) => {
    if (!user) return;
    setMessage(null);
    let savedProduct: VendorProduct | null = null;
    let createdDuringAttempt = false;
    const uploadedImages: VendorProductImage[] = [];
    const uploadedStoragePaths: string[] = [];
    try {
      const base = Number(data.base_price_iqd);
      const compare = data.compare_at_price_iqd.trim() ? Number(data.compare_at_price_iqd) : null;
      const apparel = isApparelCategory(data.category_id, categories);
      const apparelType = apparel && data.apparel_product_type ? data.apparel_product_type as ApparelProductType : null;
      const combinations = apparel ? data.colors.flatMap((color) => data.sizes.flatMap((size) => {
        const cell = data.matrix[comboKey(color.key, size)];
        return cell?.enabled ? [{ color, size, cell }] : [];
      })) : [];
      const totalMatrixStock = combinations.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.cell.stock))), 0);
      const stock = apparel ? totalMatrixStock : Math.max(0, Math.floor(Number(data.stock_quantity)));

      if (!data.name_ku.trim() || !data.name_ar.trim() || !data.name_en.trim() || !data.slug.trim() || !Number.isFinite(base) || base < 0) {
        throw new Error('ناوی بەرهەم، slug و نرخ پێویستن.');
      }
      if (compare !== null && (!Number.isFinite(compare) || compare < base)) throw new Error('نرخی پێشوو نابێت لە نرخی ئێستا کەمتر بێت.');
      if (!Number.isFinite(Number(data.stock_quantity)) && !apparel) throw new Error('ژمارەی کۆگا دروست نییە.');
      if (apparel && !apparelType) throw new Error('جۆری بەرهەم هەڵبژێرە.');
      if (data.imageFiles.length + editingImages.length > 8) throw new Error('کۆی وێنەکانی بەرهەم نابێت لە ٨ زیاتر بێت. پێش زیادکردن وێنەیەکی پێشووتر بسڕەوە.');
      if (apparel && data.imageFiles.length + editingImages.length === 0) throw new Error('لانیکەم یەک وێنەی بەرهەم زیاد بکە.');
      if (apparel && (!data.colors.length || !data.sizes.length || combinations.length === 0)) throw new Error('لانیکەم یەک ڕەنگ، یەک قەبارە و یەک تێکەڵەی ڕەنگ × قەبارە دیاری بکە.');
      if (apparel && data.colors.some((color) => !/^#[0-9A-Fa-f]{6}$/.test(color.hex))) throw new Error('کۆدی HEX ـی ڕەنگێک دروست نییە.');
      if (apparel && combinations.some((item) => !Number.isFinite(Number(item.cell.stock)) || Number(item.cell.stock) < 0 || (item.cell.price.trim() !== '' && (!Number.isFinite(Number(item.cell.price)) || Number(item.cell.price) < 0)))) {
        throw new Error('نرخی تایبەت و ژمارەی کۆگا دەبێت ژمارەی دروست و نەرێنی نەبن.');
      }
      for (const file of data.imageFiles) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
          throw new Error('وێنەکان دەبێت JPG/PNG/WebP بن و هەر یەکەیان لە ٥MB زیاتر نەبێت.');
        }
      }

      const productInput = {
        name_ku: data.name_ku.trim(), name_ar: data.name_ar.trim(), name_en: data.name_en.trim(),
        slug: data.slug.trim(), category_id: data.category_id || null, base_price_iqd: base,
        compare_at_price_iqd: compare, stock_quantity: stock, description_ku: data.description_ku.trim(),
        apparel_product_type: apparelType,
        brand: apparel ? data.brand.trim() || null : null,
        material: apparel ? data.material.trim() || null : null,
        country_of_origin: apparel ? data.country_of_origin.trim() || null : null,
        season: apparel && data.season ? data.season as 'summer' | 'winter' | 'all_seasons' : null,
        seller_location: apparel ? data.seller_location.trim() || null : null,
      };

      if (editing) {
        savedProduct = await updateVendorProduct(user.id, editing.id, productInput);
      } else {
        if (!selectedStore) throw new Error('سەرەتا فرۆشگایەک هەڵبژێرە.');
        savedProduct = await createVendorProduct(user.id, { ...productInput, store_id: selectedStore.id });
        createdDuringAttempt = true;
      }
      if (!savedProduct) throw new Error('بەرهەم پاشەکەوت نەکرا.');

      for (const file of data.imageFiles) {
        const path = await uploadProductImage(user.id, savedProduct.id, file);
        uploadedStoragePaths.push(path);
        uploadedImages.push(await addVendorProductImage(user.id, savedProduct.id, path));
      }
      const allImages = [...editingImages, ...uploadedImages];

      if (apparel) {
        const resolveImage = (imageRef: string) => {
          if (!imageRef) return null;
          if (imageRef.startsWith('path:')) return imageRef.slice(5);
          if (imageRef.startsWith('new:')) return uploadedImages[Number(imageRef.slice(4))]?.storage_path ?? null;
          return null;
        };

        const previousMatrix = editingVariants.filter((item) => item.color_name_ku && item.size_label);
        const activeKeys = new Set<string>();
        for (const combo of combinations) {
          const uniqueKey = combo.color.name_ku.toLocaleLowerCase() + '|' + combo.size.toLocaleLowerCase();
          activeKeys.add(uniqueKey);
          const customPrice = combo.cell.price.trim() ? Number(combo.cell.price) : null;
          const variantInput = {
            name_ku: combo.color.name_ku + ' · ' + combo.size,
            name_ar: combo.color.name_ar + ' · ' + combo.size,
            name_en: combo.color.name_en + ' · ' + combo.size,
            price_iqd: customPrice,
            stock_quantity: Math.floor(Number(combo.cell.stock)),
            is_active: true,
            color_name_ku: combo.color.name_ku,
            color_hex: combo.color.hex.toUpperCase(),
            size_label: combo.size,
            color_image_storage_path: resolveImage(combo.color.imageRef),
          };
          const existingVariant = previousMatrix.find((item) =>
            item.color_name_ku?.toLocaleLowerCase() === combo.color.name_ku.toLocaleLowerCase()
            && item.size_label?.toLocaleLowerCase() === combo.size.toLocaleLowerCase());
          if (existingVariant) {
            await updateVendorVariant(user.id, existingVariant.id, variantInput);
          } else {
            await createVendorVariant(user.id, { product_id: savedProduct.id, ...variantInput });
          }
        }
        for (const oldVariant of previousMatrix) {
          const key = oldVariant.color_name_ku!.toLocaleLowerCase() + '|' + oldVariant.size_label!.toLocaleLowerCase();
          if (!activeKeys.has(key) && oldVariant.is_active) {
            // Retire a removed combination without deleting rows referenced by a cart/order.
            await updateVendorVariant(user.id, oldVariant.id, { is_active: false });
          }
        }
        setEditingVariants(await getVendorVariants(user.id, savedProduct.id));
        setEditingImages(allImages);
        setMessage('بەرهەم پاشەکەوت کرا و وێنە و تێکەڵەکانی ڕەنگ × قەبارە لە Supabase هەڵگیرا. دۆخی بەرهەم draft ـە تا بە پرۆسەی approval چالاک بکرێت.');
      } else {
        setEditingImages(allImages);
        setMessage(editing
          ? `بەرهەم نوێکرایەوە${uploadedImages.length ? ' و وێنەکان لە Supabase پاشەکەوت کران.' : '.'}`
          : `بەرهەم دروستکرا و بە دۆخی draft هەڵگیرا${uploadedImages.length ? '؛ وێنەکانیش لە Supabase پاشەکەوت کران.' : '.'}`);
      }

      resetForm();
      await refresh();
    } catch (error) {
      // Remove only media uploaded by this save attempt. Existing catalog images remain untouched.
      for (const image of uploadedImages) {
        try { await deleteVendorProductImage(user.id, image.id); } catch { /* preserve the original failure */ }
      }
      for (const path of uploadedStoragePaths) {
        try { await deleteProductImage(path); } catch { /* storage cleanup can be retried by an admin */ }
      }

      if (savedProduct) {
        // If creation succeeded but a later upload/variant step failed, keep its draft
        // selected for retry instead of attempting to create a duplicate product.
        if (createdDuringAttempt) setEditing(savedProduct);
        try {
          const [remainingImages, remainingVariants] = await Promise.all([
            getVendorProductImages(user.id, savedProduct.id),
            getVendorVariants(user.id, savedProduct.id),
          ]);
          setEditingImages(remainingImages);
          setEditingVariants(remainingVariants);
        } catch { /* show the original failure; the draft remains inactive */ }
      }
      setMessage(error instanceof Error ? error.message : 'پاشەکەوتکردنی بەرهەم سەرکەوتوو نەبوو. بەرهەمەکە بە دۆخی draft دەمێنێتەوە تا بتوانیت دووبارە هەوڵ بدەیتەوە.');
    }
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

      {showForm ? <ProductForm key={formKey} form={form} setForm={setForm} categories={categories} editing={editing} editingVariants={editingVariants} existingImages={editingImages} onCancel={resetForm} onSave={(payload) => save(payload)} /> : null}

      <section className="space-y-3">
        {loading ? <div className="rounded-[30px] bg-white p-12 text-center text-sm font-bold text-black/45">بارکردن...</div> : products.length === 0 ? <div className="rounded-[30px] border border-dashed border-black/10 bg-white p-12 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--shakh-bg)] text-black/30"><Boxes size={24} /></div><h2 className="mt-4 text-lg font-black">هێشتا بەرهەم نییە</h2><p className="mt-2 text-sm leading-7 text-black/45">یەکەم بەرهەم دروست بکە؛ هەموو بەرهەمە نوێکان بە `draft` دەستپێدەکەن تا approval سیستەمەکە دواتر status ـیان بگۆڕێت.</p></div> : products.map((product) => <VendorProductRow key={product.id} product={product} userId={user?.id ?? ''} onEdit={() => void edit(product)} onDelete={() => void remove(product)} />)}
      </section>
    </div>
  );
}

function ProductForm({ form, setForm, categories, editing, editingVariants, existingImages, onCancel, onSave }: {
  form: ProductFormState;
  setForm: Dispatch<SetStateAction<ProductFormState>>;
  categories: Category[];
  editing: VendorProduct | null;
  editingVariants: VendorVariant[];
  existingImages: VendorProductImage[];
  onCancel: () => void;
  onSave: (data: ProductFormPayload) => Promise<void> | void;
}) {
  const field = (key: keyof ProductFormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const apparel = isApparelCategory(form.category_id, categories);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [colors, setColors] = useState<ApparelColor[]>(() => {
    const rows = editingVariants.filter((item) => item.color_name_ku && item.size_label);
    const seen = new Set<string>();
    return rows.flatMap((item, index) => {
      const key = item.color_name_ku!.toLocaleLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      return [colorFromVariant(item)];
    });
  });
  const [sizes, setSizes] = useState<string[]>(() => [...new Set(editingVariants.filter((item) => item.color_name_ku && item.size_label).map((item) => item.size_label!))]);
  const [matrix, setMatrix] = useState<Record<string, MatrixCell>>(() => Object.fromEntries(
    editingVariants.filter((item) => item.color_name_ku && item.size_label).map((item) => [
      comboKey(colorsKeyFromVariant(item, editingVariants), item.size_label!),
      { enabled: item.is_active, stock: String(item.stock_quantity), price: item.price_iqd == null ? '' : String(item.price_iqd) },
    ]),
  ));
  const [newColorName, setNewColorName] = useState('');
  const [newColorEnglish, setNewColorEnglish] = useState('');
  const [newColorHex, setNewColorHex] = useState('#6B7280');
  const [newSize, setNewSize] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function colorsKeyFromVariant(variant: VendorVariant, _rows: VendorVariant[]): string {
    const preset = apparelColorPalette.find((item) => item.hex.toLowerCase() === (variant.color_hex ?? '').toLowerCase());
    return preset?.key ?? 'custom-' + (variant.color_name_ku ?? variant.name_ku).toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '-');
  }

  const defaultSizes = defaultSizesForApparel(form.apparel_product_type as ApparelProductType | '');
  const isShoe = isShoeType(form.apparel_product_type as ApparelProductType | '');
  const previews = useMemo(() => imageFiles.map((file, index) => ({ file, index, url: URL.createObjectURL(file) })), [imageFiles]);
  useEffect(() => () => { previews.forEach((item) => URL.revokeObjectURL(item.url)); }, [previews]);
  const totalStock = colors.reduce((sum, color) => sum + sizes.reduce((inner, size) => {
    const cell = matrix[comboKey(color.key, size)];
    return inner + (cell?.enabled ? Math.max(0, Math.floor(Number(cell.stock) || 0)) : 0);
  }, 0), 0);

  const updateCell = (key: string, patch: Partial<MatrixCell>) => setMatrix((current) => ({
    ...current, [key]: { enabled: false, stock: '0', price: '', ...current[key], ...patch },
  }));

  const togglePresetColor = (preset: typeof apparelColorPalette[number]) => {
    setColors((current) => current.some((item) => item.key === preset.key)
      ? current.filter((item) => item.key !== preset.key)
      : [...current, { ...preset, imageRef: '' }]);
  };

  const addCustomColor = () => {
    const name = newColorName.trim();
    if (!name) { setLocalError('ناوی ڕەنگی تایبەت بنووسە.'); return; }
    if (colors.some((item) => item.name_ku.toLocaleLowerCase() === name.toLocaleLowerCase())) { setLocalError('ئەم ڕەنگە پێشتر زیادکراوە.'); return; }
    if (!/^#[0-9A-Fa-f]{6}$/.test(newColorHex)) { setLocalError('کۆدی ڕەنگ دروست نییە.'); return; }
    const english = newColorEnglish.trim() || name;
    setColors((current) => [...current, { key: 'custom-' + Date.now().toString(36), name_ku: name, name_ar: english, name_en: english, hex: newColorHex.toUpperCase(), imageRef: '', custom: true }]);
    setNewColorName(''); setNewColorEnglish(''); setNewColorHex('#6B7280'); setLocalError(null);
  };

  const toggleSize = (size: string) => setSizes((current) => current.includes(size) ? current.filter((item) => item !== size) : [...current, size]);
  const addCustomSize = () => {
    const size = newSize.trim();
    if (!size) return;
    if (!sizes.some((item) => item.toLocaleLowerCase() === size.toLocaleLowerCase())) setSizes((current) => [...current, size]);
    setNewSize('');
  };

  const updateImageFiles = (nextFiles: File[]) => {
    setColors((current) => current.map((color) => {
      if (!color.imageRef.startsWith('new:')) return color;
      const oldFile = imageFiles[Number(color.imageRef.slice(4))];
      const nextIndex = oldFile ? nextFiles.indexOf(oldFile) : -1;
      return { ...color, imageRef: nextIndex < 0 ? '' : 'new:' + nextIndex };
    }));
    setImageFiles(nextFiles);
    setLocalError(null);
  };

  return <section className="rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_14px_45px_rgba(16,22,35,.04)] sm:p-8" dir="rtl">
    <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">{editing ? 'دەستکاری' : 'بەرهەمی نوێ'}</div><h2 className="mt-1 text-xl font-black">{editing ? 'دەستکاری بەرهەم' : 'دروستکردنی بەرهەم'}</h2><p className="mt-2 text-sm leading-6 text-black/45">تایبەتمەندییە نوێکان زیادکراون؛ فۆڕمی کۆنی بەرهەم و variants ـیش هەر بەردەوامە.</p></div><button onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--shakh-bg)]" aria-label="داخستن"><X size={18} /></button></div>

    <div className="mt-7 grid gap-4 md:grid-cols-2">
      <Field label="ناوی بەرهەم بە کوردی *" value={form.name_ku} onChange={(v) => field('name_ku', v)} dir="rtl" />
      <Field label="ناوی بەرهەم بە عەرەبی *" value={form.name_ar} onChange={(v) => field('name_ar', v)} dir="rtl" />
      <Field label="Product name (English) *" value={form.name_en} onChange={(v) => field('name_en', v)} dir="ltr" />
      <Field label="Slug *" value={form.slug} onChange={(v) => field('slug', v.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-'))} dir="ltr" />
      <label><span className="text-xs font-black text-black/55">بەشی بازاڕ *</span><select value={form.category_id} onChange={(e) => field('category_id', e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold"><option value="">بەشێک هەڵبژێرە</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.parent_id ? '↳ ' : ''}{cat.name_ku}</option>)}</select></label>
      <Field label="نرخی فرۆشتن (د.ع) *" value={form.base_price_iqd} onChange={(v) => field('base_price_iqd', v)} dir="ltr" inputMode="decimal" />
      <Field label="نرخی پێش داشکاندن (د.ع)" value={form.compare_at_price_iqd} onChange={(v) => field('compare_at_price_iqd', v)} dir="ltr" inputMode="decimal" />
      {!apparel ? <Field label="کۆی کۆگا" value={form.stock_quantity} onChange={(v) => field('stock_quantity', v)} dir="ltr" inputMode="numeric" /> : <div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs font-black text-emerald-800">کۆی کۆگا بە شێوەی خۆکار</div><div className="mt-1 text-2xl font-black text-emerald-900">{totalStock.toLocaleString('en-US')} دانە</div><div className="mt-1 text-xs text-emerald-800/75">کۆی دانەکانی تێکەڵەکانی ڕەنگ × قەبارە</div></div>}
      <label className="md:col-span-2"><span className="text-xs font-black text-black/55">وەسفی بەرهەم بە کوردی</span><textarea value={form.description_ku} onChange={(e) => field('description_ku', e.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10" /></label>
    </div>

    <ImageUploadField
      files={imageFiles}
      onChange={updateImageFiles}
      maxFiles={8}
      required={apparel}
      disabled={saving}
      label={apparel ? 'وێنەکانی جل‌وبەرگ' : 'وێنەکانی بەرهەم'}
      hint="وێنە لە کامێرا یان گەلەری هەڵبژێرە؛ تا ٨ وێنە. وێنەی سەرەکی لە لیستی وێنە پاشەکەوتکراوەکاندا یەکەمە."
      existingImages={existingImages.map((image, index) => ({
        id: image.id,
        url: getProductImageUrl(image.storage_path),
        label: image.alt_ku || `وێنەی ${index + 1}`,
      }))}
    />

    {apparel ? <div className="mt-8 space-y-7 border-t border-black/[0.07] pt-7">
      <div className="flex items-center gap-2"><Tag size={19} className="text-[var(--shakh-orange)]" /><h3 className="text-lg font-black">زانیاریی جل‌وبەرگ</h3></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label><span className="text-xs font-black text-black/55">جۆری بەرهەم *</span><select value={form.apparel_product_type} onChange={(e) => {
          const next = e.target.value;
          const previous = defaultSizesForApparel(form.apparel_product_type as ApparelProductType | '');
          const customSizes = sizes.filter((size) => !previous.includes(size));
          field('apparel_product_type', next);
          if (!sizes.length || customSizes.length === 0) setSizes(defaultSizesForApparel(next as ApparelProductType | ''));
        }} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold"><option value="">جۆرێک هەڵبژێرە</option>{apparelTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <Field label="براند یان ناوی کۆمپانیا" value={form.brand} onChange={(v) => field('brand', v)} />
        <Field label="جۆری پارچە / ماددە" value={form.material} onChange={(v) => field('material', v)} />
        <Field label="وڵاتی دروستکردن" value={form.country_of_origin} onChange={(v) => field('country_of_origin', v)} />
        <label><span className="text-xs font-black text-black/55">وەرزی بەکارهێنان</span><select value={form.season} onChange={(e) => field('season', e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold"><option value="">هەڵبژاردەیی</option>{apparelSeasonOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <Field label="شوێنی فرۆشیار" value={form.seller_location} onChange={(v) => field('seller_location', v)} />
      </div>

      <div className="rounded-3xl border border-black/[0.06] p-4 sm:p-5">
        <div className="flex items-center gap-2"><PaletteIcon /><div><h4 className="font-black">ڕەنگەکان</h4><p className="mt-1 text-xs leading-5 text-black/40">تەنها ئەو ڕەنگانە هەڵبژێرە کە لە کۆگادا بەردەستن.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {apparelColorPalette.map((item) => {
            const active = colors.some((color) => color.key === item.key);
            return <button type="button" key={item.key} onClick={() => togglePresetColor(item)} className={`flex items-center gap-2 rounded-2xl border p-3 text-start text-sm font-bold transition ${active ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/5' : 'border-black/10 bg-white'}`}><span className="grid size-7 shrink-0 place-items-center rounded-full border border-black/10" style={{ backgroundColor: item.hex }}>{active ? <Check size={15} className={item.key === 'white' || item.key === 'yellow' || item.key === 'beige' ? 'text-black' : 'text-white'} /> : null}</span><span>{item.name_ku}</span></button>;
          })}
        </div>
        <div className="mt-4 rounded-2xl bg-[var(--shakh-bg)] p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="ڕەنگی تایبەت" value={newColorName} onChange={setNewColorName} /><Field label="ناوی ئینگلیزی (هەڵبژاردەیی)" value={newColorEnglish} onChange={setNewColorEnglish} dir="ltr" /><label className="flex flex-col"><span className="text-xs font-black text-black/55">نیشانەی ڕەنگ</span><input aria-label="کۆدی ڕەنگ" type="color" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} className="mt-2 h-12 w-full cursor-pointer rounded-xl border border-black/10 bg-white p-1" /></label></div>
          <button type="button" onClick={addCustomColor} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2.5 text-xs font-black text-white"><Plus size={15} /> زیادکردنی ڕەنگی تایبەت</button>
        </div>
        {colors.length ? <div className="mt-4 space-y-3">{colors.map((color) => <div key={color.key} className="grid gap-3 rounded-2xl border border-black/[0.06] p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center"><span className="size-9 rounded-xl border border-black/10" style={{ backgroundColor: color.hex }} /><div className="min-w-0"><div className="font-black">{color.name_ku}</div><div className="text-[11px] text-black/40" dir="ltr">{color.hex}</div></div><label><span className="text-[11px] font-bold text-black/45">وێنەی ئەم ڕەنگە</span><select value={color.imageRef} onChange={(e) => setColors((current) => current.map((item) => item.key === color.key ? { ...item, imageRef: e.target.value } : item))} className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-2 text-xs font-bold"><option value="">وێنەی تایبەت نییە</option>{existingImages.map((image, index) => <option key={image.id} value={'path:' + image.storage_path}>وێنەی پێشوو {index + 1}</option>)}{previews.map((preview) => <option key={preview.index} value={'new:' + preview.index}>وێنەی نوێ {preview.index + 1}</option>)}</select></label><button type="button" onClick={() => setColors((current) => current.filter((item) => item.key !== color.key))} className="grid size-9 place-items-center rounded-xl bg-red-50 text-red-600" aria-label="لابردنی ڕەنگ"><X size={16} /></button></div>)}</div> : <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">هێشتا هیچ ڕەنگێکت هەڵنەبژاردووە.</p>}
      </div>

      <div className="rounded-3xl border border-black/[0.06] p-4 sm:p-5">
        <div className="flex items-center gap-2"><Ruler size={19} className="text-[var(--shakh-blue)]" /><div><h4 className="font-black">قەبارەکان</h4><p className="mt-1 text-xs leading-5 text-black/40">{isShoe ? 'قەبارەی پێڵاو بە ژمارە هەڵبژێرە؛ دەتوانیت قەبارەی تر زیاد بکەیت.' : 'قەبارەی ڕاستەقینەی بەردەست هەڵبژێرە؛ قەبارەی نادیار زیاد مەکە.'}</p></div></div>
        {defaultSizes.length ? <div className="mt-4 flex flex-wrap gap-2">{defaultSizes.map((size) => <button type="button" key={size} onClick={() => toggleSize(size)} className={`min-w-12 rounded-xl border px-3 py-2.5 text-sm font-black ${sizes.includes(size) ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)] text-white' : 'border-black/10 bg-white text-black/60'}`}>{size}</button>)}</div> : null}
        <div className="mt-4 flex gap-2"><input value={newSize} onChange={(e) => setNewSize(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize(); } }} placeholder={isShoe ? 'قەبارەی ژمارەیی یان تایبەت' : 'XS، M، قەبارەی تەمەن، یان تایبەت'} className="h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-[var(--shakh-bg)] px-3 text-sm font-bold" /><button type="button" onClick={addCustomSize} className="inline-flex items-center gap-1 rounded-xl bg-[var(--shakh-blue)] px-4 text-xs font-black text-white"><Plus size={15} /> زیادکردن</button></div>
        {sizes.filter((size) => !defaultSizes.includes(size)).length ? <div className="mt-3 flex flex-wrap gap-2">{sizes.filter((size) => !defaultSizes.includes(size)).map((size) => <button key={size} type="button" onClick={() => toggleSize(size)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/5 px-3 py-2 text-xs font-black">{size}<X size={13} /></button>)}</div> : null}
      </div>

      <div className="rounded-3xl border border-black/[0.06] p-4 sm:p-5">
        <div className="flex items-center gap-2"><Boxes size={19} className="text-[var(--shakh-orange)]" /><div><h4 className="font-black">کۆگا: ڕەنگ × قەبارە</h4><p className="mt-1 text-xs leading-5 text-black/40">تەنها تێکەڵەی ڕاستەقینەکان چالاک بکە. کۆگا و نرخی تایبەت بۆ هەر تێکەڵەیەک جیاوازن.</p></div></div>
        {!colors.length || !sizes.length ? <div className="mt-4 rounded-2xl bg-[var(--shakh-bg)] p-4 text-sm text-black/45">سەرەتا ڕەنگ و قەبارە هەڵبژێرە.</div> : <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pe-1">{colors.flatMap((color) => sizes.map((size) => {
          const key = comboKey(color.key, size);
          const cell = matrix[key] ?? { enabled: false, stock: '0', price: '' };
          return <div key={key} className={`rounded-2xl border p-3 ${cell.enabled ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/[0.035]' : 'border-black/[0.06]'}`}><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={cell.enabled} onChange={(e) => updateCell(key, { enabled: e.target.checked })} className="size-4 accent-[var(--shakh-blue)]" /><span className="size-7 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} /><span className="text-sm font-black">{color.name_ku} · {size}</span></label><span className={`text-[11px] font-black ${cell.enabled ? 'text-[var(--shakh-blue)]' : 'text-black/30'}`}>{cell.enabled ? 'لە کۆگادا' : 'چالاک نییە'}</span></div>{cell.enabled ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="دانەی بەردەست" value={cell.stock} onChange={(value) => updateCell(key, { stock: value })} dir="ltr" inputMode="numeric" /><Field label="نرخی تایبەتی (ئەگەر جیاوازە)" value={cell.price} onChange={(value) => updateCell(key, { price: value })} dir="ltr" inputMode="decimal" /></div> : null}</div>;
        })}</div>}
      </div>


    </div> : null}

    {localError ? <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-700">{localError}</div> : null}
    <div className="mt-7 flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={async () => { setLocalError(null); setSaving(true); try { await onSave({ ...form, imageFiles, colors, sizes, matrix }); } finally { setSaving(false); } }} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={17} /> {saving ? 'پاشەکەوت و بارکردنی وێنەکان...' : 'پاشەکەوتکردن'}</button><button type="button" disabled={saving} onClick={onCancel} className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-black disabled:opacity-50">هەڵوەشاندنەوە</button></div>
    {apparel ? <p className="mt-4 text-xs leading-6 text-black/40">بەرهەمە نوێکان وەک پێشوو بە دۆخی draft هەڵدەگیرێن؛ هەموو زانیاری، وێنە و کۆگاکان لە Supabase پاشەکەوت دەکرێن.</p> : null}
  </section>;
}

function PaletteIcon() {
  return <span className="grid size-9 place-items-center rounded-xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><Tag size={17} /></span>;
}

function Field({ label, value, onChange, dir, inputMode }: { label: string; value: string; onChange: (value: string) => void; dir?: 'ltr' | 'rtl'; inputMode?: 'numeric' | 'decimal' }) {
  return <label><span className="text-xs font-black text-black/55">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} dir={dir} inputMode={inputMode} className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 text-sm font-bold outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10" /></label>;
}

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
