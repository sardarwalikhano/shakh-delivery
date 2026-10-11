import { AlertTriangle, ArrowRight, Check, Package, Pencil, Save, Tag, Trash2, Warehouse, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getActivePostById, getApparelVariants, replaceOwnedPostImages, softDeleteOwnedPost, updateOwnedPostDetails } from '../api';
import { postCategoryLabels, postRoleLabels } from '../labels';
import { getPostImageUrl, MAX_POST_IMAGES } from '@/lib/storage/postMedia';
import { ImageUploadField } from '@/components/media/ImageUploadField';
import { supabase } from '@/lib/supabase/client';
import type { ApparelAudience, ApparelCondition, ApparelSeason, ApparelVariant, Post } from '../types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { ApparelPurchasePanel } from '../components/ApparelPurchasePanel';
import { VehiclePostDetails } from '../components/VehiclePostDetails';
import { singleVehicleListing } from '../vehicleTypes';

const APPAREL_AUDIENCE_LABELS: Record<string, string> = { men: 'پیاوان', women: 'ئافرەتان', kids: 'منداڵان', all: 'هەمووان' };

export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const [post, setPost] = useState<Post | null>(null);
  const [variants, setVariants] = useState<ApparelVariant[]>([]);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [activeImageIndex, setActiveImageIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editBrand, setEditBrand] = useState('');
  const [editMaterial, setEditMaterial] = useState('');
  const [editCountryOfOrigin, setEditCountryOfOrigin] = useState('');
  const [editSeason, setEditSeason] = useState<ApparelSeason | ''>('');
  const [editCondition, setEditCondition] = useState<ApparelCondition | ''>('');
  const [editAudience, setEditAudience] = useState<ApparelAudience | ''>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [replacementFiles, setReplacementFiles] = useState<File[]>([]);
  const [savingImages, setSavingImages] = useState(false);
  const [imageSaveError, setImageSaveError] = useState<string | null>(null);
  const [imageSaveMessage, setImageSaveMessage] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_listings', filter: 'post_id=eq.' + id }, () => {
        void refreshPost().catch((nextError) => { if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'نوێکردنەوەی زانیاریی ئۆتۆمبێل سەرکەوتوو نەبوو.'); });
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

  const isApparel = post.category === 'fashion';
  const isVehicle = post.category === 'cars';
  const vehicleListing = isVehicle ? singleVehicleListing(post.vehicle_listing) : null;
  const basePrice = vehicleListing
    ? Number(vehicleListing.price_amount)
    : (selectedVariant?.price_iqd ?? post.price_iqd ?? 0);
  const discount = isApparel
    ? Math.max(0, Math.min(99, post.discount_percent ?? 0))
    : vehicleListing ? Math.max(0, Math.min(99, vehicleListing.discount_percent ?? 0)) : 0;
  const finalPrice = Math.round(basePrice * (100 - discount) / 100);
  const currencyLabel = vehicleListing?.currency === 'USD' ? '$' : 'د.ع';
  const currentImage = activeImageIndex >= 0 ? images[activeImageIndex]?.storage_path : (selectedVariant?.image_path || images[0]?.storage_path);
  useEffect(() => { setImageLoadError(false); }, [currentImage]);
  const colorStock = sizesForColor.reduce((sum, variant) => sum + variant.stock_quantity, 0);
  const apparelTypeLabels: Record<string, string> = {
    mens_clothing: 'جل‌وبەرگی پیاوان', womens_clothing: 'جل‌وبەرگی ئافرەتان', kids_clothing: 'جل‌وبەرگی منداڵان',
    mens_shoes: 'پێڵاوی پیاوان', womens_shoes: 'پێڵاوی ئافرەتان', kids_shoes: 'پێڵاوی منداڵان', bags: 'جانتـا',
    sportswear: 'جل‌وبەرگی وەرزشی', home_textiles: 'جل‌وبەرگی ناوماڵ', beauty_fashion_accessories: 'کەلوپەلی جوانکاری و ئەکسسواراتی جل‌وبەرگ', other_accessories: 'ئەکسسوارات و پێداویستیی تر',
  };

  const canManageAllPosts = permissions.has('posts.manage');
  const ownsPost = Boolean(user && post.author_id === user.id);
  const canEditPost = Boolean((ownsPost && permissions.has('posts.update_own')) || canManageAllPosts);
  const canDeletePost = Boolean((ownsPost && permissions.has('posts.delete_own')) || canManageAllPosts);

  const startEditing = () => {
    setEditTitle(post.title);
    setEditContent(post.content ?? '');
    setEditPrice(String(isVehicle ? vehicleListing?.price_amount ?? '' : post.price_iqd ?? ''));
    setEditLocation(post.location ?? '');
    setEditDiscount(String(isVehicle ? vehicleListing?.discount_percent ?? post.discount_percent ?? 0 : post.discount_percent ?? 0));
    setEditBrand(post.brand ?? '');
    setEditMaterial(post.material ?? '');
    setEditCountryOfOrigin(post.country_of_origin ?? '');
    setEditSeason(post.season ?? '');
    setEditCondition(post.item_condition ?? '');
    setEditAudience(post.apparel_audience ?? '');
    setEditError(null);
    setEditMessage(null);
    setDeleteError(null);
    setReplacementFiles([]);
    setImageSaveError(null);
    setImageSaveMessage(null);
    setIsEditing(true);
  };

  const saveEdits = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingEdit) return;
    const normalizedTitle = editTitle.trim();
    const normalizedContent = editContent.trim();
    const normalizedPrice = editPrice.trim() ? Number(editPrice) : null;
    const normalizedDiscount = Number(editDiscount);

    if (normalizedTitle.length < 3 || normalizedTitle.length > 180) {
      setEditError('ناونیشان دەبێت لە ٣ تا ١٨٠ پیت بێت.');
      return;
    }
    if (normalizedContent.length > 12000) {
      setEditError('وەسفی پۆست زۆر درێژە.');
      return;
    }
    if (normalizedPrice !== null && (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)) {
      setEditError('نرخێکی دروست بنووسە.');
      return;
    }
    if ((isVehicle || isApparel) && (normalizedPrice === null || normalizedPrice <= 0)) {
      setEditError(isVehicle ? 'نرخی ئۆتۆمبێل دەبێت لە سفر زیاتر بێت.' : 'نرخی جل‌وبەرگ دەبێت لە سفر زیاتر بێت.');
      return;
    }
    if (!Number.isInteger(normalizedDiscount) || normalizedDiscount < 0 || normalizedDiscount > 99) {
      setEditError('داشکاندن دەبێت لە ٠ تا ٩٩٪ بێت.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    setEditMessage(null);
    try {
      await updateOwnedPostDetails(post.id, {
        title: normalizedTitle,
        content: normalizedContent,
        priceAmount: normalizedPrice,
        location: editLocation.trim() || null,
        discountPercent: normalizedDiscount,
        brand: editBrand.trim() || null,
        material: editMaterial.trim() || null,
        countryOfOrigin: editCountryOfOrigin.trim() || null,
        season: editSeason || null,
        itemCondition: editCondition || null,
        apparelAudience: editAudience || null,
      });

      const updatedPost = await getActivePostById(post.id);
      if (updatedPost) setPost(updatedPost);
      setEditMessage('گۆڕانکارییەکان بە سەرکەوتوویی پاشەکەوت کران.');
      setIsEditing(false);
    } catch (nextError) {
      setEditError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی گۆڕانکارییەکان سەرکەوتوو نەبوو.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deletePost = async () => {
    if (deletingPost) return;
    setDeletingPost(true);
    setDeleteError(null);
    try {
      await softDeleteOwnedPost(post.id);
      navigate('/posts', { replace: true, state: { notice: 'پۆستەکە لە بازاڕ شاردرایەوە.' } });
    } catch (nextError) {
      setDeleteError(nextError instanceof Error ? nextError.message : 'سڕینەوەی پۆست سەرکەوتوو نەبوو.');
    } finally {
      setDeletingPost(false);
    }
  };

  const saveReplacementImages = async () => {
    if (!ownsPost || savingImages || replacementFiles.length === 0) return;
    setSavingImages(true);
    setImageSaveError(null);
    setImageSaveMessage(null);
    try {
      const updated = await replaceOwnedPostImages(post.id, replacementFiles);
      setPost(updated);
      setReplacementFiles([]);
      setActiveImageIndex(-1);
      setImageLoadError(false);
      setImageSaveMessage('وێنە نوێیەکان بە سەرکەوتوویی پاشەکەوت کران.');
    } catch (nextError) {
      setImageSaveError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی وێنەکان سەرنەکەوت.');
    } finally {
      setSavingImages(false);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Link to="/posts" className="inline-flex items-center gap-2 text-sm font-black text-black/45 hover:text-black"><ArrowRight size={17} /> گەڕانەوە بۆ پۆستەکان</Link>

        {canEditPost || canDeletePost ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {canEditPost ? <button type="button" onClick={() => isEditing ? setIsEditing(false) : startEditing()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-blue)] px-4 py-2.5 text-sm font-black text-white"><Pencil size={16}/>{isEditing ? 'داخستنی دەستکاری' : 'دەستکاری پۆست'}</button> : null}
            {canDeletePost ? <button type="button" onClick={() => { setShowDeleteConfirm(true); setDeleteError(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-500/20 bg-white px-4 py-2.5 text-sm font-black text-red-600"><Trash2 size={16}/>سڕینەوەی پۆست</button> : null}
          </div>
        ) : null}

        {editMessage ? <div role="status" className="mt-4 rounded-2xl border border-emerald-600/15 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{editMessage}</div> : null}

        {isEditing ? (
          <form onSubmit={saveEdits} className="mt-5 space-y-4 rounded-[26px] border border-[var(--shakh-blue)]/20 bg-white p-4 shadow-sm sm:p-6">
            <div><h2 className="text-xl font-black">دەستکاری زانیاریی پۆست</h2><p className="mt-1 text-sm leading-6 text-black/45">کاتەگۆری و مێژووی پۆست هەمان دەمێنن؛ تەنها خانەکانت دەستکاری دەکەیت.</p></div>
            {editError ? <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{editError}</div> : null}
            <label className="block text-sm font-black">ناونیشان
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={180} required disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/>
            </label>
            <label className="block text-sm font-black">وەسف
              <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={12000} disabled={savingEdit} rows={5} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-black">{isVehicle ? 'نرخ (' + (vehicleListing?.currency ?? 'IQD') + ')' : 'نرخ (د.ع)'}
                <input type="number" min={isVehicle || isApparel ? 1 : 0} step="any" inputMode="decimal" value={editPrice} onChange={(event) => setEditPrice(event.target.value)} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal" placeholder="نرخ"/>
              </label>
              <label className="block text-sm font-black">شوێن
                <input value={editLocation} onChange={(event) => setEditLocation(event.target.value)} maxLength={180} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal" placeholder="هەولێر"/>
              </label>
              {(isVehicle || isApparel) ? <label className="block text-sm font-black">داشکاندن (%)
                <input type="number" min={0} max={99} step={1} value={editDiscount} onChange={(event) => setEditDiscount(event.target.value)} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/>
              </label> : null}
            </div>
            {isApparel ? (
              <section className="space-y-4 rounded-2xl bg-[var(--shakh-bg)] p-4">
                <h3 className="font-black">زانیاریی زیادەی جل‌وبەرگ</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-black">براند<input value={editBrand} onChange={(event) => setEditBrand(event.target.value)} maxLength={120} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/></label>
                  <label className="block text-sm font-black">ماددە<input value={editMaterial} onChange={(event) => setEditMaterial(event.target.value)} maxLength={160} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/></label>
                  <label className="block text-sm font-black">وڵاتی دروستکردن<input value={editCountryOfOrigin} onChange={(event) => setEditCountryOfOrigin(event.target.value)} maxLength={100} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal"/></label>
                  <label className="block text-sm font-black">وەرز
                    <select value={editSeason} onChange={(event) => setEditSeason(event.target.value as ApparelSeason | '')} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal">
                      <option value="">دیاری نەکراوە</option><option value="summer">هاوین</option><option value="winter">زستان</option><option value="all_seasons">هەموو وەرزەکان</option>
                    </select>
                  </label>
                  <label className="block text-sm font-black">دۆخی کاڵا
                    <select value={editCondition} onChange={(event) => setEditCondition(event.target.value as ApparelCondition | '')} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal">
                      <option value="">دیاری نەکراوە</option><option value="new">نوێ</option><option value="used">بەکارهاتوو</option>
                    </select>
                  </label>
                  <label className="block text-sm font-black">بۆ کێیە؟
                    <select value={editAudience} onChange={(event) => setEditAudience(event.target.value as ApparelAudience | '')} disabled={savingEdit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-normal">
                      <option value="">هەمووان / دیاری نەکراوە</option><option value="men">پیاوان</option><option value="women">ئافرەتان</option><option value="kids">منداڵان</option><option value="all">هەمووان</option>
                    </select>
                  </label>
                </div>
                <Link to="/dashboard/posts/manage" className="inline-flex text-xs font-black text-[var(--shakh-blue)]">بۆ دەستکاری ڕەنگ، قەبارە و کۆگا بچۆ بۆ بەڕێوەبردنی جل‌وبەرگ ←</Link>
              </section>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="submit" disabled={savingEdit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={16}/>{savingEdit ? 'پاشەکەوتکردن...' : 'پاشەکەوتکردنی گۆڕانکاری'}</button>
              <button type="button" onClick={() => setIsEditing(false)} disabled={savingEdit} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-black"><X size={16}/> پاشگەزبوونەوە</button>
            </div>
          </form>
        ) : null}

        {showDeleteConfirm ? (
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-post-title" className="mt-4 rounded-[24px] border border-red-500/20 bg-white p-5 shadow-sm">
            <h2 id="delete-post-title" className="flex items-center gap-2 text-lg font-black text-red-700"><AlertTriangle size={20}/> سڕینەوەی پۆست پشتڕاست بکەرەوە</h2>
            <p className="mt-2 text-sm leading-7 text-black/55">پۆستەکە لە بازاڕ و گەڕان دەشاردرێتەوە. مێژووی ئۆردەرە پەیوەندیدارەکان هەڵدەگیرێت و داتای پۆستەکە بۆ پاراستنی مێژوو ناسڕدرێتەوە.</p>
            {deleteError ? <div role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{deleteError}</div> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void deletePost()} disabled={deletingPost} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Trash2 size={16}/>{deletingPost ? 'سڕینەوە...' : 'بەڵێ، پۆستەکە بشارەوە'}</button>
              <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deletingPost} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-black"><X size={16}/> نەخێر</button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <div className="rounded-[30px] border border-black/[0.06] bg-white p-3 shadow-[0_18px_55px_rgba(16,22,35,.05)] sm:p-5">
            <div className="overflow-hidden rounded-[24px] bg-[var(--shakh-bg)]">
              {currentImage && !imageLoadError ? (
                <img
                  src={getPostImageUrl(currentImage)}
                  alt={post.title}
                  onError={() => setImageLoadError(true)}
                  className="aspect-square w-full object-cover"
                  fetchPriority="high"
                />
              ) : (
                <div className="grid aspect-square place-items-center gap-2 px-5 text-center text-sm font-bold text-black/35">
                  <Package size={34} />
                  <span>{images.length ? 'وێنەکە بار نەبوو؛ دەتوانیت لە دەستکاریدا جێگرتنەوەی بکەیت.' : 'هیچ وێنەیەک لەم پۆستەدا پاشەکەوت نەکراوە.'}</span>
                  {ownsPost ? <span className="text-xs font-medium">دەستکاری پۆست بکە بۆ زیادکردنی وێنە</span> : null}
                </div>
              )}
            </div>
            {ownsPost ? (
              <section className="mt-5 rounded-2xl border border-black/[0.06] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-black">وێنەکانی پۆست</h2>
                  <span className="text-xs font-bold text-black/40">{images.length}/{MAX_POST_IMAGES} وێنە تۆمارکراوە</span>
                </div>
                {imageSaveMessage ? <div role="status" className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700">{imageSaveMessage}</div> : null}
                {imageSaveError ? <div role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{imageSaveError}</div> : null}
                {isEditing ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs leading-6 text-black/45">ئەگەر وێنەی نوێ هەڵبژێریت، ئەوانەی پێشوو جێگرتەوە دەبن. ئەگەر ناتەوێت وێنەکان بگۆڕیت، ئەم بەشە بەتاڵ بهێڵە.</p>
                    <ImageUploadField
                      files={replacementFiles}
                      onChange={setReplacementFiles}
                      maxFiles={MAX_POST_IMAGES}
                      disabled={savingImages}
                      label="هەڵبژاردنی وێنە نوێکان"
                      hint="JPG، PNG یان WebP؛ تا ٨ وێنە، هەر وێنەیەک تا ٥MB."
                    />
                    <button type="button" onClick={() => void saveReplacementImages()} disabled={savingImages || replacementFiles.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-blue)] px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                      <Save size={16}/>{savingImages ? 'پاشەکەوتکردنی وێنەکان...' : 'پاشەکەوتکردنی وێنەکان'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-6 text-black/45">بۆ زیادکردن یان جێگرتنەوەی وێنەکان، «دەستکاری پۆست» هەڵبژێرە.</p>
                )}
              </section>
            ) : null}

            {images.length > 1 || isVehicle ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image, index) => <div key={image.storage_path} className="min-w-0"><button type="button" onClick={() => setActiveImageIndex(index)} className={`block w-full overflow-hidden rounded-xl border-2 ${(activeImageIndex === index || (activeImageIndex < 0 && selectedVariant?.image_path === image.storage_path)) ? 'border-[var(--shakh-orange)]' : 'border-transparent'}`}><img src={getPostImageUrl(image.storage_path)} alt={image.alt_ku ?? post.title} className="aspect-square w-full object-cover" loading="lazy" /></button>{isVehicle && image.alt_ku ? <div className="mt-1 text-center text-xs font-bold text-black/45">{image.alt_ku}</div> : null}</div>)}</div> : null}
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
              <div className="text-3xl font-black tabular-nums">{finalPrice.toLocaleString('en-US')} <span className="text-sm text-black/40">{currencyLabel}</span></div>
              {discount > 0 ? <div className="pb-1 text-sm text-black/35 line-through">{basePrice.toLocaleString('en-US')} {currencyLabel}</div> : null}
              {vehicleListing?.price_negotiable === true ? <span className="pb-1 text-xs font-bold text-emerald-700">نرخ جێگۆڕکێی تێدایە</span> : null}
              {vehicleListing?.price_negotiable === null ? <span className="pb-1 text-xs font-bold text-black/40">جێگۆڕکێی نرخ: نازانراوە</span> : null}
              {selectedVariant?.price_iqd != null ? <span className="pb-1 text-xs font-bold text-[var(--shakh-blue)]">نرخی تایبەتی ئەم ڕەنگ/قەبارەیە</span> : null}
            </div>

            {isVehicle && vehicleListing ? <VehiclePostDetails listing={vehicleListing} location={post.location} /> : null}
            {isVehicle && !vehicleListing ? <div role="status" className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm leading-6 text-amber-800">وردەکاریی تەکنیکی ئەم پۆستە لە داتابەیسدا تۆمار نەکراوە. هیچ زانیارییەکی ئۆتۆمبێل بە خۆڕایی دانەنراوە؛ تکایە لە فرۆشیارەوە پشتڕاستی بکەرەوە.</div> : null}

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

            {post.status !== 'active' ? <div role="status" className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm font-bold leading-7 text-amber-800">ئەم پۆستە لە ئێستادا ئەرشیفکراوە و بۆ کڕیاران بەردەست نییە. دەتوانیت لە بەشی دەستکارییەوە زانیارییەکانی نوێ بکەیتەوە.</div> : null}
            {isApparel && selectedVariant && post.status === 'active' ? <ApparelPurchasePanel post={post} variant={selectedVariant} /> : null}
            {isApparel && !selectedVariant && post.status === 'active' ? <div className="mt-6 rounded-2xl bg-red-500/[0.07] p-4 text-sm font-bold text-red-700">ئەم کاڵایە لە ئێستادا هیچ ڕەنگ و قەبارەیەکی بەردەستی نییە.</div> : null}

            {!isVehicle ? <div className="mt-6 grid gap-3 border-t border-black/[0.06] pt-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="text-xs font-bold text-black/40">شوێنی فرۆشیار</div><div className="mt-1 font-black">{post.location || 'دیاری نەکراوە'}</div></div>
              <div className="rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="text-xs font-bold text-black/40">بارودۆخی کۆگا</div><div className="mt-1 flex items-center gap-2 font-black"><Warehouse size={17} />{isApparel ? `${colorStock} دانە لەم ڕەنگە` : 'پۆستی چالاک'}</div></div>
            </div> : null}
            <Link to="/posts" className="mt-5 flex min-h-12 items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕانەوە بۆ هەموو پۆستەکان</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
