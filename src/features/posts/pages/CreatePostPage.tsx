import { BadgeDollarSign, FileText, ImagePlus, MapPin, Send, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import type { AppRole } from '@/lib/permissions/AuthorizationContext';
import { MAX_POST_IMAGES, validatePostImage } from '@/lib/storage/postMedia';
import { createPost, getAllowedPostTargets } from '../api';
import { postCategoryLabels, postRoleLabels } from '../labels';
import type { ApparelSeason, ApparelType, PostTarget } from '../types';

type SelectedImage = { file: File; previewUrl: string };
type ApparelColor = { name: string; hex: string };
type VariantDraft = { stock: string; price: string; imageIndex: string };

const apparelTypes: Array<{ value: ApparelType; label: string; group: 'clothing' | 'shoes' | 'other' }> = [
  { value: 'mens_clothing', label: 'جل‌وبەرگی پیاوان', group: 'clothing' },
  { value: 'womens_clothing', label: 'جل‌وبەرگی ئافرەتان', group: 'clothing' },
  { value: 'kids_clothing', label: 'جل‌وبەرگی منداڵان', group: 'clothing' },
  { value: 'mens_shoes', label: 'پێڵاوی پیاوان', group: 'shoes' },
  { value: 'womens_shoes', label: 'پێڵاوی ئافرەتان', group: 'shoes' },
  { value: 'kids_shoes', label: 'پێڵاوی منداڵان', group: 'shoes' },
  { value: 'bags', label: 'جانتـا', group: 'other' },
  { value: 'sportswear', label: 'جل‌وبەرگی وەرزشی', group: 'clothing' },
  { value: 'home_textiles', label: 'جل‌وبەرگی ناوماڵ', group: 'other' },
  { value: 'beauty_fashion_accessories', label: 'کەلوپەلی جوانکاری و ئەکسسواراتی جل‌وبەرگ', group: 'other' },
  { value: 'other_accessories', label: 'پێداویستیی تر و ئەکسسوارات', group: 'other' },
];

const standardColors: ApparelColor[] = [
  { name: 'ڕەش', hex: '#171717' },
  { name: 'سپی', hex: '#FFFFFF' },
  { name: 'سوور', hex: '#DC2626' },
  { name: 'شین', hex: '#2563EB' },
  { name: 'خاکستەری', hex: '#6B7280' },
  { name: 'قاوەیی', hex: '#854D0E' },
  { name: 'سەوز', hex: '#15803D' },
  { name: 'زەرد', hex: '#EAB308' },
  { name: 'مۆر', hex: '#9333EA' },
  { name: 'پەمەیی', hex: '#EC4899' },
  { name: 'نارنجی', hex: '#F97316' },
  { name: 'کرێم', hex: '#F5F5DC' },
];

function sizeOptionsFor(type: ApparelType): string[] {
  if (type === 'mens_shoes' || type === 'womens_shoes') return Array.from({ length: 11 }, (_, index) => String(index + 36));
  if (type === 'kids_shoes') return Array.from({ length: 13 }, (_, index) => String(index + 24));
  if (type === 'kids_clothing') return ['٢ ساڵ', '٣ ساڵ', '٤ ساڵ', '٥ ساڵ', '٦ ساڵ', '٧ ساڵ', '٨ ساڵ', '٩ ساڵ', '١٠ ساڵ', '١١ ساڵ', '١٢ ساڵ', '١٣ ساڵ', '١٤ ساڵ', 'XS', 'S', 'M', 'L', 'XL'];
  if (type === 'home_textiles') return ['یەک قەبارە', 'فردی', 'دوو کەسی', 'Queen', 'King'];
  if (type === 'bags' || type === 'beauty_fashion_accessories' || type === 'other_accessories') return ['یەک قەبارە'];
  return ['XS', 'S', 'M', 'L', 'XL', 'XXL', '44', '46', '48', '50', '52', '54', '56', '58', '60'];
}

function variantKey(colorHex: string, size: string): string {
  return colorHex.toLowerCase() + '::' + size.trim().toLocaleLowerCase();
}

export function CreatePostPage() {
  const navigate = useNavigate();
  const [targets, setTargets] = useState<PostTarget[]>([]);
  const [role, setRole] = useState<AppRole | ''>('');
  const [category, setCategory] = useState<PostTarget['category'] | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [apparelType, setApparelType] = useState<ApparelType>('mens_clothing');
  const [brand, setBrand] = useState('');
  const [material, setMaterial] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [season, setSeason] = useState<ApparelSeason>('all_seasons');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const imageUrls = useRef<string[]>([]);
  const [colors, setColors] = useState<ApparelColor[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('#0F766E');
  const [customSize, setCustomSize] = useState('');
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextTargets = await getAllowedPostTargets();
      setTargets(nextTargets);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا دەسەڵاتەکانی پۆستکردن بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { imageUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const roles = useMemo(() => [...new Set(targets.map((item) => item.publisher_role))], [targets]);
  const preferredRole = useMemo(
    () => roles.find((item) => item !== 'customer' && item !== 'super_admin') ?? roles[0] ?? '',
    [roles],
  );
  const categories = useMemo(() => [...new Set(targets.map((item) => item.category))], [targets]);
  const targetForCategory = useCallback((nextCategory: PostTarget['category'] | '') => {
    if (!nextCategory) return undefined;
    return targets.find((item) => item.category === nextCategory && item.publisher_role === preferredRole)
      ?? targets.find((item) => item.category === nextCategory);
  }, [preferredRole, targets]);

  useEffect(() => {
    if (!targets.length) return;
    if (!category) {
      const initialTarget = targets.find((item) => item.publisher_role === preferredRole && item.category !== 'cars')
        ?? targets.find((item) => item.publisher_role === preferredRole)
        ?? targets[0];
      setRole(initialTarget?.publisher_role ?? '');
      setCategory(initialTarget?.category ?? '');
      return;
    }
    const target = targetForCategory(category);
    if (target) { setRole(target.publisher_role); return; }
    const firstTarget = targets[0];
    setRole(firstTarget?.publisher_role ?? '');
    setCategory(firstTarget?.category ?? '');
  }, [category, preferredRole, targetForCategory, targets]);

  const availableSizes = useMemo(() => sizeOptionsFor(apparelType), [apparelType]);
  const combinations = useMemo(
    () => colors.flatMap((color) => sizes.map((size) => ({ color, size, key: variantKey(color.hex, size) }))),
    [colors, sizes],
  );
  const totalStock = useMemo(
    () => combinations.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(variantDrafts[item.key]?.stock || '0'))), 0),
    [combinations, variantDrafts],
  );

  const toggleColor = (color: ApparelColor) => {
    setColors((current) => current.some((item) => item.hex.toLowerCase() === color.hex.toLowerCase())
      ? current.filter((item) => item.hex.toLowerCase() !== color.hex.toLowerCase())
      : [...current, color]);
  };

  const toggleSize = (size: string) => {
    setSizes((current) => current.some((item) => item.toLowerCase() === size.toLowerCase())
      ? current.filter((item) => item.toLowerCase() !== size.toLowerCase())
      : [...current, size]);
  };

  const updateVariant = (key: string, patch: Partial<VariantDraft>) => {
    setVariantDrafts((current) => {
      const previous = current[key] ?? { stock: '0', price: '', imageIndex: '' };
      return { ...current, [key]: { ...previous, ...patch } };
    });
  };

  const addCustomColor = () => {
    const name = customColorName.trim();
    if (!name) { setError('ناوی ڕەنگی تایبەت بنووسە.'); return; }
    if (colors.some((item) => item.hex.toLowerCase() === customColorHex.toLowerCase())) {
      setError('ئەم ڕەنگە پێشتر هەڵبژێردراوە.');
      return;
    }
    setColors((current) => [...current, { name, hex: customColorHex.toUpperCase() }]);
    setCustomColorName('');
    setError(null);
  };

  const addCustomSize = () => {
    const size = customSize.trim();
    if (!size) return;
    if (sizes.some((item) => item.toLowerCase() === size.toLowerCase())) {
      setError('ئەم قەبارەیە پێشتر هەڵبژێردراوە.');
      return;
    }
    setSizes((current) => [...current, size]);
    setCustomSize('');
    setError(null);
  };

  const chooseImages = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (images.length + selected.length > MAX_POST_IMAGES) {
      setError('زۆرترین ژمارەی وێنە ٨ دانەیە.');
      return;
    }
    try {
      selected.forEach(validatePostImage);
      const next = selected.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        imageUrls.current.push(previewUrl);
        return { file, previewUrl };
      });
      setImages((current) => [...current, ...next]);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'وێنەکە ڕێگەپێدراو نییە.');
    }
  };

  const removeImage = (index: number) => {
    const removed = images[index];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setVariantDrafts((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [
      key,
      { ...value, imageIndex: value.imageIndex === String(index) ? '' : value.imageIndex && Number(value.imageIndex) > index ? String(Number(value.imageIndex) - 1) : value.imageIndex },
    ])));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !role || !category) return;
    setError(null);

    if (title.trim().length < 3) return setError('ناونیشانی پۆست دەبێت لانیکەم 3 پیت بێت.');
    if (content.trim().length > 12000) return setError('ناوەڕۆک زۆر درێژە.');

    const numericPrice = price.trim() ? Number(price.replace(/,/g, '')) : null;
    if (numericPrice !== null && (!Number.isFinite(numericPrice) || numericPrice < 0)) return setError('نرخی پۆست دروست نییە.');

    const apparel = category === 'fashion';
    if (apparel) {
      if (numericPrice === null || numericPrice <= 0) return setError('نرخی بەرهەمی جل‌وبەرگ پێویستە و دەبێت لە سفر زیاتر بێت.');
      if (images.length < 1 || images.length > MAX_POST_IMAGES) return setError('لە ١ تا ٨ وێنەی ڕاستەقینەی بەرهەم هەڵبژێرە.');
      if (!colors.length) return setError('لانیکەم یەک ڕەنگ هەڵبژێرە.');
      if (!sizes.length) return setError('لانیکەم یەک قەبارە هەڵبژێرە.');
      if (!combinations.length) return setError('ڕەنگ و قەبارەکان پێکەوە هەڵبژێرە.');
      if (!totalStock) return setError('کۆگای لانیکەم یەک ڕەنگ و قەبارە دەبێت لە سفر زیاتر بێت.');

      const discount = Number(discountPercent);
      if (!Number.isInteger(discount) || discount < 0 || discount > 99) return setError('داشکاندن دەبێت لە ٠ تا ٩٩٪ بێت.');

      for (const item of combinations) {
        const draft = variantDrafts[item.key] ?? { stock: '0', price: '', imageIndex: '' };
        const stock = Number(draft.stock);
        const overridePrice = draft.price.trim() ? Number(draft.price.replace(/,/g, '')) : null;
        if (!Number.isInteger(stock) || stock < 0) return setError(`کۆگای ${item.color.name} / ${item.size} دروست نییە.`);
        if (overridePrice !== null && (!Number.isFinite(overridePrice) || overridePrice <= 0)) return setError(`نرخی تایبەتی ${item.color.name} / ${item.size} دروست نییە.`);
      }

      const apparelVariants = combinations.map((item) => {
        const draft = variantDrafts[item.key] ?? { stock: '0', price: '', imageIndex: '' };
        return {
          color_name: item.color.name,
          color_hex: item.color.hex,
          size_label: item.size,
          stock_quantity: Math.floor(Number(draft.stock || '0')),
          price_iqd: draft.price.trim() ? Number(draft.price.replace(/,/g, '')) : null,
          image_index: draft.imageIndex === '' ? null : Number(draft.imageIndex),
        };
      });

      setBusy(true);
      try {
        const created = await createPost({
          publisherRole: role,
          category,
          title,
          content,
          priceIqd: numericPrice,
          location,
          apparel: {
            apparel_type: apparelType,
            brand,
            material,
            country_of_origin: countryOfOrigin,
            season,
            discount_percent: Number(discountPercent),
            images: images.map((item) => item.file),
            variants: apparelVariants,
          },
        });
        setSuccess(true);
        navigate(`/posts/${created.id}`, { replace: true });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'پۆستکردن سەرکەوتوو نەبوو.');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const created = await createPost({ publisherRole: role, category, title, content, priceIqd: numericPrice, location });
      setSuccess(true);
      navigate(`/posts/${created.id}`, { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پۆستکردن سەرکەوتوو نەبوو.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <AuthPageShell><div className="mx-auto max-w-xl text-center text-sm font-bold text-black/50">پشکنینی دەسەڵاتی پۆستکردن...</div></AuthPageShell>;

  if (!targets.length) {
    return <AuthPageShell><AuthCard title="پۆستکردن بەردەست نییە" description="ئەم هەژمارە هیچ Role ـێکی ڕێگەپێدراو بۆ پۆستکردنی نییە."><AuthFeedback error="هیچ category ـێکت بۆ پۆستکردن نییە." /></AuthCard></AuthPageShell>;
  }

  return (
    <AuthPageShell>
      <AuthCard title="پۆستکردنی نوێ" description="زانیاریی پۆستەکە پڕبکەرەوە؛ دەسەڵات و داتای ڕاستەقینە لە Supabase پشکنین دەکرێن.">
        <form className="space-y-6" onSubmit={submit} noValidate>
          <AuthFeedback error={error} />
          {success ? <AuthSuccess>پۆستەکە بە سەرکەوتوویی بڵاوکرایەوە.</AuthSuccess> : null}

          <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
            <div className="text-xs font-bold text-black/40">بڵاوکردنەوە بە ناوی Role</div>
            <div className="mt-1 font-black">{role ? postRoleLabels[role] : '—'}</div>
          </div>

          <Field label="جۆری پۆست">
            <div className="relative">
              <Tag className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/35" size={17} />
              <select className={inputClass + ' ps-11'} value={category} onChange={(event) => setCategory(event.target.value as PostTarget['category'])}>
                {categories.map((item) => <option key={item} value={item}>{postCategoryLabels[item]}</option>)}
              </select>
            </div>
          </Field>

          {category === 'fashion' ? (
            <section className="space-y-5 rounded-[26px] border border-[var(--shakh-orange)]/20 bg-white p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-black">زانیاریی جل‌وبەرگ</h2>
                <p className="mt-1 text-sm leading-6 text-black/45">تەنها ڕەنگ و قەبارەی ڕاستەقینەی بەردەست هەڵبژێرە. تۆمارکردن لە Supabase پاشەکەوت و دواتر بڵاو دەکرێتەوە.</p>
              </div>

              <Field label="١. جۆری بەرهەم">
                <select className={inputClass} value={apparelType} onChange={(event) => { setApparelType(event.target.value as ApparelType); setSizes([]); }} required>
                  {apparelTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="براند / کۆمپانیا (ئارەزوومەندانە)">
                  <input className={inputClass} value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={120} placeholder="ناوی براند" />
                </Field>
                <Field label="جۆری پارچە / ماددە (ئارەزوومەندانە)">
                  <input className={inputClass} value={material} onChange={(event) => setMaterial(event.target.value)} maxLength={160} placeholder="وەک: پەمە، پۆلیستەر..." />
                </Field>
                <Field label="وڵاتی دروستکردن (ئارەزوومەندانە)">
                  <input className={inputClass} value={countryOfOrigin} onChange={(event) => setCountryOfOrigin(event.target.value)} maxLength={100} placeholder="وەک: تورکیا" />
                </Field>
                <Field label="وەرزی بەکارهێنان">
                  <select className={inputClass} value={season} onChange={(event) => setSeason(event.target.value as ApparelSeason)}>
                    <option value="summer">هاوین</option>
                    <option value="winter">زستان</option>
                    <option value="all_seasons">هەموو وەرزەکان</option>
                  </select>
                </Field>
              </div>

              <Field label={`٢. وێنەی بەرهەم (${images.length}/8)`} hint="JPG، PNG یان WebP؛ هەر وێنەیەک تا 5MB. وێنەکان بە شێوەی ڕاستەقینە لە Supabase Storage هەڵدەگیرێن.">
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-[var(--shakh-bg)] p-4 text-center transition hover:border-[var(--shakh-orange)]">
                  <ImagePlus size={23} className="text-[var(--shakh-orange)]" />
                  <span className="text-sm font-black">هەڵبژاردن / زیادکردنی وێنە</span>
                  <span className="text-xs text-black/40">تا {MAX_POST_IMAGES} وێنە</span>
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseImages} disabled={images.length >= MAX_POST_IMAGES} />
                </label>
                {images.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {images.map((item, index) => (
                      <div key={item.previewUrl} className="relative overflow-hidden rounded-2xl border border-black/10 bg-white">
                        <img src={item.previewUrl} alt={item.file.name} className="aspect-square w-full object-cover" />
                        <div className="truncate px-2 py-1.5 text-[10px] font-bold text-black/55">وێنەی {index + 1}</div>
                        <button type="button" onClick={() => removeImage(index)} className="absolute end-2 top-2 grid size-8 place-items-center rounded-full bg-white/95 text-red-600 shadow" aria-label="سڕینەوەی وێنە"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Field>

              <div>
                <Field label="٣. ڕەنگە بەردەستەکان">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {standardColors.map((item) => {
                      const selected = colors.some((color) => color.hex.toLowerCase() === item.hex.toLowerCase());
                      return (
                        <button key={item.hex} type="button" onClick={() => toggleColor(item)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${selected ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8' : 'border-black/10 bg-white'}`}>
                          <span className="size-5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: item.hex }} />
                          <span>{item.name}</span>
                          {selected ? <span className="ms-auto text-[var(--shakh-orange)]">✓</span> : null}
                        </button>
                      );
                    })}
                    {colors.filter((item) => !standardColors.some((preset) => preset.hex.toLowerCase() === item.hex.toLowerCase())).map((item) => (
                      <button key={item.hex} type="button" onClick={() => toggleColor(item)} className="flex items-center gap-2 rounded-xl border border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8 px-3 py-2.5 text-sm font-bold">
                        <span className="size-5 rounded-full border border-black/15" style={{ backgroundColor: item.hex }} /><span>{item.name}</span><X size={14} className="ms-auto" />
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input className={inputClass} value={customColorName} onChange={(event) => setCustomColorName(event.target.value)} maxLength={60} placeholder="ناوی ڕەنگی تایبەت" />
                  <label className="flex h-12 items-center justify-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-bold">
                    ڕەنگ <input type="color" value={customColorHex} onChange={(event) => setCustomColorHex(event.target.value)} className="size-7 cursor-pointer border-0 bg-transparent" />
                  </label>
                  <button type="button" onClick={addCustomColor} className="rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white">زیادکردنی ڕەنگ</button>
                </div>
              </div>

              <div>
                <Field label="٤. قەبارەکان">
                  <div className="flex flex-wrap gap-2">
                    {availableSizes.map((item) => {
                      const selected = sizes.some((size) => size.toLowerCase() === item.toLowerCase());
                      return <button key={item} type="button" onClick={() => toggleSize(item)} className={`min-w-12 rounded-xl border px-3 py-2.5 text-sm font-black ${selected ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/8 text-[var(--shakh-blue)]' : 'border-black/10 bg-white'}`}>{item}</button>;
                    })}
                    {sizes.filter((item) => !availableSizes.some((preset) => preset.toLowerCase() === item.toLowerCase())).map((item) => (
                      <button key={item} type="button" onClick={() => toggleSize(item)} className="rounded-xl border border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/8 px-3 py-2.5 text-sm font-black">{item} <X size={12} className="ms-1 inline" /></button>
                    ))}
                  </div>
                </Field>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input className={inputClass} value={customSize} onChange={(event) => setCustomSize(event.target.value)} maxLength={40} placeholder="قەبارەی تایبەت: وەک 3XL یان ١٦ ساڵ" />
                  <button type="button" onClick={addCustomSize} className="shrink-0 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white">زیادکردنی قەبارە</button>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-black">٥. کۆگا: ڕەنگ × قەبارە</h3>
                    <p className="mt-1 text-xs leading-6 text-black/45">بۆ هەر تێکەڵەیەک کۆگا و نرخی جیاواز دابنێ. نرخی بەتاڵ واتە نرخی سەرەکی.</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-700">کۆی دانەکان: {totalStock.toLocaleString('en-US')}</div>
                </div>
                {!combinations.length ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-black/15 p-5 text-sm font-bold text-black/45">سەرەتا ڕەنگ و قەبارە هەڵبژێرە بۆ دروستبوونی خشتەی کۆگا.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {combinations.map((item) => {
                      const draft = variantDrafts[item.key] ?? { stock: '0', price: '', imageIndex: '' };
                      return (
                        <div key={item.key} className="rounded-2xl border border-black/10 bg-[var(--shakh-bg)] p-3">
                          <div className="mb-3 flex items-center gap-2">
                            <span className="size-5 rounded-full border border-black/15" style={{ backgroundColor: item.color.hex }} />
                            <span className="font-black">{item.color.name}</span>
                            <span className="text-black/25">/</span>
                            <span className="font-black">{item.size}</span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="ژمارەی بەردەست">
                              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={draft.stock} onChange={(event) => updateVariant(item.key, { stock: event.target.value })} required />
                            </Field>
                            <Field label="نرخی تایبەت (د.ع)">
                              <input className={inputClass} type="number" min="1" step="1" inputMode="decimal" value={draft.price} onChange={(event) => updateVariant(item.key, { price: event.target.value })} placeholder={price ? Number(price.replace(/,/g, '')).toLocaleString('en-US') : 'نرخی سەرەکی'} />
                            </Field>
                            <Field label="وێنەی ئەم ڕەنگە">
                              <select className={inputClass} value={draft.imageIndex} onChange={(event) => updateVariant(item.key, { imageIndex: event.target.value })} disabled={!images.length}>
                                <option value="">وێنەی گشتی بەکاربهێنە</option>
                                {images.map((image, imageIndex) => <option key={image.previewUrl} value={imageIndex}>وێنەی {imageIndex + 1}</option>)}
                              </select>
                            </Field>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="٦. داشکاندن (%)" hint="ئەگەر داشکاندن نییە، ٠ بەجێبهێڵە.">
                  <input className={inputClass} type="number" min="0" max="99" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} />
                </Field>
                <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
                  <div className="text-xs font-bold text-black/40">نرخی پێشبینیکراو دوای داشکاندن</div>
                  <div className="mt-1 text-xl font-black">{price.trim() && Number(price) > 0 ? Math.round(Number(price.replace(/,/g, '')) * (100 - Math.min(99, Math.max(0, Number(discountPercent) || 0))) / 100).toLocaleString('en-US') : '—'} <span className="text-xs text-black/40">د.ع</span></div>
                </div>
              </div>
            </section>
          ) : null}

          <Field label="ناوی بەرهەم / ناونیشانی پۆست">
            <div className="relative">
              <FileText className="pointer-events-none absolute start-4 top-4 text-black/30" size={17} />
              <input className={inputClass + ' ps-11'} required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder={category === 'fashion' ? 'ناوی جل‌وبەرگ یان بەرهەم' : 'ناونیشانی پۆست'} />
            </div>
          </Field>

          <Field label="وەسفی بەرهەم">
            <textarea className={inputClass + ' min-h-32 resize-y'} value={content} onChange={(event) => setContent(event.target.value)} maxLength={12000} placeholder="وردەکاریی بەرهەم، کوالێتی و تایبەتمەندییەکان..." />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={category === 'fashion' ? 'نرخی سەرەکی (د.ع)' : 'نرخ (IQD)'} hint={category === 'fashion' ? 'نرخی ئەو ڕەنگ و قەبارانەی نرخی تایبەتیان نییە.' : 'نرخی پۆست؛ ئەگەر گونجاوە.'}>
              <div className="relative">
                <BadgeDollarSign className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/30" size={17} />
                <input className={inputClass + ' ps-11'} type="number" min={category === 'fashion' ? 1 : 0} step="1" inputMode="decimal" required={category === 'fashion'} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" dir="ltr" />
              </div>
            </Field>
            <Field label="شوێنی فرۆشیار">
              <div className="relative">
                <MapPin className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/30" size={17} />
                <input className={inputClass + ' ps-11'} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="هەولێر" />
              </div>
            </Field>
          </div>

          <button className={primaryButtonClass} type="submit" disabled={busy}>
            {busy ? 'پاشەکەوت و بڵاوکردنەوە...' : <><Send size={17} /> <span className="ms-2">بڵاوکردنەوەی پۆست</span></>}
          </button>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
