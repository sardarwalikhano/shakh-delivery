import { ArrowRight, Check, Package, Tag, Warehouse } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getActivePostById, getApparelVariants } from '../api';
import { postCategoryLabels, postRoleLabels } from '../labels';
import { getPostImageUrl } from '@/lib/storage/postMedia';
import { supabase } from '@/lib/supabase/client';
import type { ApparelVariant, Post } from '../types';
import { ApparelPurchasePanel } from '../components/ApparelPurchasePanel';

const APPAREL_AUDIENCE_LABELS: Record<string, string> = { men: 'پیاوان', women: 'ئافرەتان', kids: 'منداڵان', all: 'هەمووان' };

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [variants, setVariants] = useState<ApparelVariant[]>([]);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (!id) { setPost(null); setVariants([]); setLoading(false); return; }

    const refreshPost = async () => {
      const [nextPost, nextVariants] = await Promise.all([getActivePostById(id), getApparelVariants(id)]);
      if (cancelled) return;
      setPost(nextPost);
      setVariants(nextVariants);
      setActiveImageIndex((current) => current < 0 ? -1 : current);
    };

    void refreshPost()
      .catch((nextError) => { if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'نەتوانرا وردەکاریی پۆست بخوێندرێتەوە.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const channel = supabase.channel('post-detail:' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: 'id=eq.' + id }, () => {
        void refreshPost().catch((nextError) => { if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'نوێکردنەوەی پۆست سەرکەوتوو نەبوو.'); });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apparel_variants', filter: 'post_id=eq.' + id }, () => {
        void refreshPost().catch((nextError) => { if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'نوێکردنەوەی کۆگا سەرکەوتوو نەبوو.'); });
      })
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [id]);

  const images = useMemo(() => (Array.isArray(post?.images) ? post.images.filter((image) => Boolean(image?.storage_path)) : []), [post]);
  const colors = useMemo(() => {
    const byHex = new Map<string, { name: string; hex: string }>();
    variants.forEach((variant) => {
      if (variant.stock_quantity <= 0) return;
      if (!byHex.has(variant.color_hex.toLowerCase())) byHex.set(variant.color_hex.toLowerCase(), { name: variant.color_name, hex: variant.color_hex });
    });
    return [...byHex.values()];
  }, [variants]);
  const chosenColor = selectedColor || colors[0]?.hex || '';
  const sizesForColor = useMemo(() => variants.filter((variant) => variant.color_hex.toLowerCase() === chosenColor.toLowerCase() && variant.stock_quantity > 0), [chosenColor, variants]);
  const selectedVariant = useMemo(() => sizesForColor.find((variant) => variant.size_label === selectedSize) ?? sizesForColor[0] ?? null, [selectedSize, sizesForColor]);

  useEffect(() => {
    if (colors.length && !colors.some((color) => color.hex.toLowerCase() === selectedColor.toLowerCase())) setSelectedColor(colors[0].hex);
  }, [colors, selectedColor]);
  useEffect(() => {
    if (!sizesForColor.length) { if (selectedSize) setSelectedSize(''); return; }
    if (!sizesForColor.some((variant) => variant.size_label === selectedSize)) {
      setSelectedSize(sizesForColor[0].size_label);
    }
  }, [selectedSize, sizesForColor]);

  if (loading) return <div className="grid min-h-[65dvh] place-items-center"><div className="text-sm font-bold text-black/45">بارکردنی وردەکاریی پۆست...</div></div>;
  if (!post) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-black">پۆست نەدۆزرایەوە</h1>{error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}<Link className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white" to="/posts">گەڕانەوە بۆ پۆستەکان</Link></div>;

  const basePrice = selectedVariant?.price_iqd ?? post.price_iqd ?? 0;
  const discount = post.category === 'fashion' ? Math.max(0, Math.min(99, post.discount_percent ?? 0)) : 0;
  const finalPrice = Math.round(basePrice * (100 - discount) / 100);
  const currentImage = activeImageIndex >= 0 ? images[activeImageIndex]?.storage_path : (selectedVariant?.image_path || images[0]?.storage_path);
  const colorStock = sizesForColor.reduce((sum, variant) => sum + variant.stock_quantity, 0);
  const isApparel = post.category === 'fashion';
  const apparelTypeLabels: Record<string, string> = {
    mens_clothing: 'جل‌وبەرگی پیاوان', womens_clothing: 'جل‌وبەرگی ئافرەتان', kids_clothing: 'جل‌وبەرگی منداڵان',
    mens_shoes: 'پێڵاوی پیاوان', womens_shoes: 'پێڵاوی ئافرەتان', kids_shoes: 'پێڵاوی منداڵان', bags: 'جانتـا',
    sportswear: 'جل‌وبەرگی وەرزشی', home_textiles: 'جل‌وبەرگی ناوماڵ', beauty_fashion_accessories: 'کەلوپەلی جوانکاری و ئەکسسواراتی جل‌وبەرگ', other_accessories: 'ئەکسسوارات و پێداویستیی تر',
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Link to="/posts" className="inline-flex items-center gap-2 text-sm font-black text-black/45 hover:text-black"><ArrowRight size={17} /> گەڕانەوە بۆ پۆستەکان</Link>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[30px] border border-black/[0.06] bg-white p-3 shadow-[0_18px_55px_rgba(16,22,35,.05)] sm:p-5">
            <div className="overflow-hidden rounded-[24px] bg-[var(--shakh-bg)]">
              {currentImage ? <img src={getPostImageUrl(currentImage)} alt={post.title} className="aspect-square w-full object-cover" fetchPriority="high" /> : <div className="grid aspect-square place-items-center gap-2 text-sm font-bold text-black/30"><Package size={34} />وێنە بەردەست نییە</div>}
            </div>
            {images.length > 1 ? <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">{images.map((image, index) => <button key={image.storage_path} type="button" onClick={() => setActiveImageIndex(index)} className={`overflow-hidden rounded-xl border-2 ${(activeImageIndex === index || (activeImageIndex < 0 && selectedVariant?.image_path === image.storage_path)) ? 'border-[var(--shakh-orange)]' : 'border-transparent'}`}><img src={getPostImageUrl(image.storage_path)} alt={image.alt_ku ?? post.title} className="aspect-square w-full object-cover" loading="lazy" /></button>)}</div> : null}
          </div>

          <div className="rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_18px_55px_rgba(16,22,35,.05)] sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
              <span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1.5 text-[var(--shakh-orange)]">{postCategoryLabels[post.category]}</span>
              <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-black/45">{postRoleLabels[post.publisher_role]}</span>
              {discount > 0 ? <span className="rounded-full bg-red-500/10 px-3 py-1.5 text-red-600">{discount}٪ داشکاندن</span> : null}
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{post.title}</h1>
            {isApparel && post.apparel_type ? <div className="mt-2 text-sm font-bold text-black/45">{apparelTypeLabels[post.apparel_type] ?? post.apparel_type}</div> : null}
            {isApparel && post.brand ? <div className="mt-2 flex items-center gap-2 text-sm font-bold text-black/45"><Tag size={15} />{post.brand}</div> : null}
            {isApparel && post.item_condition ? <div className="mt-2 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5">دۆخ: {post.item_condition === 'new' ? 'نوێ' : 'بەکارهاتوو'}</span>{post.apparel_audience ? <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5">{APPAREL_AUDIENCE_LABELS[post.apparel_audience] ?? 'هەمووان'}</span> : null}</div> : null}
            <p className="mt-4 whitespace-pre-wrap leading-8 text-black/60">{post.content || 'وەسفی زیاتر بۆ ئەم پۆستە دانەنراوە.'}</p>

            <div className="mt-6 flex flex-wrap items-end gap-3">
              <div className="text-3xl font-black tabular-nums">{finalPrice.toLocaleString('en-US')} <span className="text-sm text-black/40">د.ع</span></div>
              {discount > 0 ? <div className="pb-1 text-sm text-black/35 line-through">{basePrice.toLocaleString('en-US')} د.ع</div> : null}
              {selectedVariant?.price_iqd != null ? <span className="pb-1 text-xs font-bold text-[var(--shakh-blue)]">نرخی تایبەتی ئەم ڕەنگ/قەبارەیە</span> : null}
            </div>

            {isApparel ? <div className="mt-7 space-y-6">
              <div>
                <div className="flex items-center justify-between gap-3"><h2 className="font-black">ڕەنگ</h2><span className="text-xs font-bold text-black/40">{colors.length} ڕەنگی تۆمارکراو</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {colors.map((color) => {
                    const active = color.hex.toLowerCase() === chosenColor.toLowerCase();
                    const quantity = variants.filter((variant) => variant.color_hex.toLowerCase() === color.hex.toLowerCase()).reduce((sum, variant) => sum + variant.stock_quantity, 0);
                    return <button key={color.hex} type="button" onClick={() => { setSelectedColor(color.hex); setSelectedSize(''); setActiveImageIndex(-1); }} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-black ${active ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/8 text-[var(--shakh-blue)]' : 'border-black/10'}`}><span className="size-5 rounded-full border border-black/15" style={{ backgroundColor: color.hex }} />{color.name}<span className="text-[10px] text-black/40">({quantity})</span></button>;
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3"><h2 className="font-black">قەبارە</h2><span className="text-xs font-bold text-black/40">تەنها قەبارە تۆمارکراوەکان</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sizesForColor.map((variant) => <button key={variant.id} type="button" disabled={variant.stock_quantity <= 0} onClick={() => { setSelectedSize(variant.size_label); setActiveImageIndex(-1); }} className={`min-w-14 rounded-xl border px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-35 ${selectedVariant?.id === variant.id ? 'border-[var(--shakh-blue)] bg-[var(--shakh-blue)]/8 text-[var(--shakh-blue)]' : 'border-black/10'}`}>{variant.size_label}</button>)}
                </div>
              </div>
              {selectedVariant ? <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${selectedVariant.stock_quantity > 0 ? 'bg-emerald-500/8 text-emerald-700' : 'bg-red-500/8 text-red-700'}`}><span className="grid size-9 place-items-center rounded-xl bg-white/70"><Check size={17} /></span><span>{selectedVariant.stock_quantity > 0 ? `${selectedVariant.stock_quantity} دانە لەم ڕەنگ و قەبارەیە بەردەستە` : 'ئەم تێکەڵەی ڕەنگ و قەبارەیە بەردەست نییە'}</span></div> : <div className="rounded-2xl bg-red-500/8 p-4 text-sm font-bold text-red-700">هیچ قەبارەیەک بۆ ئەم ڕەنگە تۆمار نەکراوە.</div>}
              <div className="rounded-2xl bg-[var(--shakh-bg)] p-4 text-xs leading-6 text-black/50">
                {post.material ? <div>ماددە: <span className="font-bold text-black/70">{post.material}</span></div> : null}
                {post.country_of_origin ? <div>وڵاتی دروستکردن: <span className="font-bold text-black/70">{post.country_of_origin}</span></div> : null}
                {post.season ? <div>وەرز: <span className="font-bold text-black/70">{post.season === 'summer' ? 'هاوین' : post.season === 'winter' ? 'زستان' : 'هەموو وەرزەکان'}</span></div> : null}
              </div>
            </div> : null}

            {isApparel && selectedVariant ? <ApparelPurchasePanel post={post} variant={selectedVariant} /> : null}
            {isApparel && !selectedVariant ? <div className="mt-6 rounded-2xl bg-red-500/[0.07] p-4 text-sm font-bold text-red-700">ئەم کاڵایە لە ئێستادا هیچ ڕەنگ و قەبارەیەکی بەردەستی نییە.</div> : null}

            <div className="mt-6 grid gap-3 border-t border-black/[0.06] pt-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="text-xs font-bold text-black/40">شوێنی فرۆشیار</div><div className="mt-1 font-black">{post.location || 'دیاری نەکراوە'}</div></div>
              <div className="rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="text-xs font-bold text-black/40">بارودۆخی کۆگا</div><div className="mt-1 flex items-center gap-2 font-black"><Warehouse size={17} />{isApparel ? `${colorStock} دانە لەم ڕەنگە` : 'پۆستی چالاک'}</div></div>
            </div>
            <Link to="/posts" className="mt-5 flex min-h-12 items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕانەوە بۆ هەموو پۆستەکان</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
