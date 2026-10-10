import { Edit3, Package, Plus, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getManageablePosts, getApparelVariants, saveManagedApparelPost } from '../api';
import type { ApparelAudience, ApparelCondition, ApparelVariant, Post } from '../types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { getPostImageUrl } from '@/lib/storage/postMedia';

const audienceLabels: Record<ApparelAudience,string> = { men: 'پیاوان', women: 'ئافرەتان', kids: 'منداڵان', all: 'هەمووان' };

type EditableApparelVariant = {
  id?: string;
  draftKey: string;
  post_id: string;
  color_name: string;
  color_hex: string;
  size_label: string;
  stock_quantity: number;
  price_iqd: number | null;
  image_path: string | null;
};

export function MyPostsPage() {
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<Post | null>(null);
  const [variants, setVariants] = useState<EditableApparelVariant[]>([]);
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#2563EB');
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newStockQuantity, setNewStockQuantity] = useState('1');
  const [newVariantPrice, setNewVariantPrice] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [discount, setDiscount] = useState('0');
  const [condition, setCondition] = useState<ApparelCondition>('new');
  const [audience, setAudience] = useState<ApparelAudience>('all');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageAll = permissions.has('posts.manage');

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setPosts(await getManageablePosts()); }
    catch (err) { setError(err instanceof Error ? err.message : 'نەتوانرا پۆستەکان بخوێندرێنەوە.'); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visiblePosts = posts.filter((post) => post.category === 'fashion' && (canManageAll || post.author_id === user?.id));

  const startEdit = async (post: Post) => {
    setError(null);
    setMessage(null);
    try {
      const rows = await getApparelVariants(post.id);
      setSelected(post);
      setVariants(rows.map((variant) => ({ ...variant, draftKey: variant.id })));
      setTitle(post.title);
      setContent(post.content);
      setPrice(String(post.price_iqd ?? ''));
      setLocation(post.location ?? '');
      setDiscount(String(post.discount_percent ?? 0));
      setCondition(post.item_condition ?? 'new');
      setAudience(post.apparel_audience ?? 'all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'وردەکاریی قەبارە و کۆگا نەخوێندرایەوە.');
    }
  };

  const addVariant = () => {
    if (!selected) return;
    const colorName = newColorName.trim();
    const sizeLabel = newSizeLabel.trim();
    const colorHex = newColorHex.toLowerCase();
    const stock = Number(newStockQuantity);
    const priceValue = newVariantPrice.trim() ? Number(newVariantPrice) : null;
    if (!colorName || colorName.length > 60 || !/^#[0-9a-f]{6}$/.test(colorHex) || !sizeLabel || sizeLabel.length > 40) {
      setError('ناوی ڕەنگ، کۆدی ڕەنگ و قەبارە پڕبکەرەوە.');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0 || (priceValue !== null && (!Number.isFinite(priceValue) || priceValue <= 0))) {
      setError('کۆگا دەبێت ژمارەی تەواوی ٠ یان زیاتر بێت؛ نرخیش دەبێت بەتاڵ بێت یان لە سفر زیاتر.');
      return;
    }
    const key = colorHex + '::' + sizeLabel.toLocaleLowerCase();
    if (variants.some((item) => item.color_hex.toLowerCase() + '::' + item.size_label.trim().toLocaleLowerCase() === key)) {
      setError('ئەم تێکەڵەی ڕەنگ و قەبارە پێشتر هەیە؛ لە خشتەکەدا دەستکاریی بکە.');
      return;
    }
    setVariants((current) => [...current, {
      draftKey: 'new:' + crypto.randomUUID(),
      post_id: selected.id,
      color_name: colorName,
      color_hex: colorHex,
      size_label: sizeLabel,
      stock_quantity: stock,
      price_iqd: priceValue,
      image_path: null,
    }]);
    setNewColorName('');
    setNewSizeLabel('');
    setNewStockQuantity('1');
    setNewVariantPrice('');
    setError(null);
    setMessage(null);
  };

  const save = async () => {
    if (!selected || busy) return;
    setError(null);
    setMessage(null);
    const parsedPrice = Number(price);
    const parsedDiscount = Number(discount);
    if (title.trim().length < 3 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('ناوی کاڵا و نرخی دروست پێویستن.');
      return;
    }
    if (!Number.isInteger(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 99) {
      setError('داشکاندن دەبێت لە ٠ تا ٩٩ بێت.');
      return;
    }
    const variantKeys = new Set<string>();
    for (const item of variants) {
      if (!item.color_name.trim() || item.color_name.trim().length > 60 || !/^#[0-9A-Fa-f]{6}$/.test(item.color_hex) || !item.size_label.trim() || item.size_label.trim().length > 40) {
        setError('ناوی ڕەنگ، کۆدی HEX و قەبارەی هەر تێکەڵەیەک دروست بنووسە.');
        return;
      }
      if (!Number.isInteger(Number(item.stock_quantity)) || Number(item.stock_quantity) < 0 || (item.price_iqd !== null && (!Number.isFinite(Number(item.price_iqd)) || Number(item.price_iqd) <= 0))) {
        setError('کۆگا دەبێت ٠ یان زیاتر بێت؛ نرخی تایبەت یان بەتاڵ بێت یان لە سفر زیاتر.');
        return;
      }
      const key = item.color_hex.toLowerCase() + '::' + item.size_label.trim().toLocaleLowerCase();
      if (variantKeys.has(key)) {
        setError('هەمان ڕەنگ و قەبارە دووبارە کراوەتەوە.');
        return;
      }
      variantKeys.add(key);
    }
    setBusy(true);
    try {
      await saveManagedApparelPost({
        postId: selected.id,
        patch: {
          title: title.trim(),
          content: content.trim(),
          price_iqd: parsedPrice,
          location: location.trim() || null,
          discount_percent: parsedDiscount,
          item_condition: condition,
          apparel_audience: audience,
        },
        variants: variants.map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          color_name: item.color_name.trim(),
          color_hex: item.color_hex.toLowerCase(),
          size_label: item.size_label.trim(),
          stock_quantity: Number(item.stock_quantity),
          price_iqd: item.price_iqd == null ? null : Number(item.price_iqd),
        })),
      });
      setMessage('گۆڕانکارییەکان بە سەرکەوتوویی لە Supabase پاشەکەوت کران.');
      await refresh();
      const rows = await getApparelVariants(selected.id);
      const updated = (await getManageablePosts()).find((item) => item.id === selected.id) ?? selected;
      setSelected(updated);
      setVariants(rows);
      setTitle(updated.title);
      setContent(updated.content);
      setPrice(String(updated.price_iqd ?? ''));
      setLocation(updated.location ?? '');
      setDiscount(String(updated.discount_percent ?? 0));
      setCondition(updated.item_condition ?? 'new');
      setAudience(updated.apparel_audience ?? 'all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'پاشەکەوتکردن سەرنەکەوت.');
    } finally { setBusy(false); }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><div className="text-xs font-black text-[var(--shakh-blue)]">SHAKH · Apparel inventory</div><h1 className="mt-1 text-3xl font-black">بەڕێوەبردنی پۆستەکانی جل‌وبەرگ</h1><p className="mt-2 text-sm leading-6 text-black/50">دەستکاریی نرخ، داشکاندن، دۆخ، ڕەنگ/قەبارە و کۆگا لە داتابەیسی ڕاستەقینە.</p></div>
          <Link to="/dashboard/posts/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white"><Package size={16}/> پۆستی نوێ</Link>
        </div>
        {error ? <div role="alert" className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(300px,.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-3">
            {loading ? <div className="rounded-2xl bg-white p-8 text-sm font-bold text-black/45">بارکردن...</div> : null}
            {!loading && visiblePosts.length === 0 ? <div className="rounded-2xl bg-white p-8 text-sm font-bold text-black/45">هیچ پۆستی جل‌وبەرگت نییە.</div> : null}
            {visiblePosts.map((post) => (
              <button key={post.id} type="button" onClick={() => void startEdit(post)} className={'flex w-full gap-3 rounded-2xl border bg-white p-3 text-start transition ' + (selected?.id === post.id ? 'border-[var(--shakh-orange)] shadow-md' : 'border-black/[0.06]')}>
                {post.images?.[0]?.storage_path ? <img src={getPostImageUrl(post.images[0].storage_path)} alt="" className="size-20 shrink-0 rounded-xl object-cover"/> : <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-[var(--shakh-bg)]"><Package size={20}/></div>}
                <span className="min-w-0 flex-1"><span className="block truncate font-black">{post.title}</span><span className="mt-1 block text-xs text-black/45">{post.status === 'active' ? 'چالاک' : post.status === 'archived' ? 'ئەرشیف' : post.status}</span><span className="mt-2 block text-sm font-black">{Number(post.price_iqd ?? 0).toLocaleString('en-US')} د.ع</span>{canManageAll ? <span className="mt-1 block text-[10px] text-black/35">نووسەر: {post.author_id}</span> : null}</span>
                <Edit3 size={16} className="mt-1 shrink-0 text-black/35"/>
              </button>
            ))}
          </div>

          <div className="min-w-0 rounded-[26px] border border-black/[0.06] bg-white p-4 shadow-sm sm:p-6">
            {!selected ? <div className="grid min-h-64 place-items-center text-center"><div><Package size={32} className="mx-auto text-black/20"/><p className="mt-3 text-sm font-bold text-black/45">یەکێک لە پۆستەکانی لیستەکە هەڵبژێرە بۆ دەستکاری.</p></div></div> : (
              <div className="space-y-5">
                <div><h2 className="text-xl font-black">دەستکاری: {selected.title}</h2><p className="mt-1 text-xs text-black/40">هەموو گۆڕانکارییەکان لە RPC ـی transaction ـی Supabase پاشەکەوت دەکرێن.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-black">ناوی کاڵا<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal"/></label>
                  <label className="block text-sm font-black">نرخ (د.ع)<input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal"/></label>
                  <label className="block text-sm font-black">شوێنی فرۆشیار<input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal" placeholder="هەولێر"/></label>
                  <label className="block text-sm font-black">داشکاندن (%)<input type="number" min="0" max="99" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal"/></label>
                  <label className="block text-sm font-black">دۆخی کاڵا<select value={condition} onChange={(e) => setCondition(e.target.value as ApparelCondition)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal"><option value="new">نوێ</option><option value="used">بەکارهاتوو</option></select></label>
                  <label className="block text-sm font-black">بۆ کێیە؟<select value={audience} onChange={(e) => setAudience(e.target.value as ApparelAudience)} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 text-sm font-normal">{Object.entries(audienceLabels).map(([key,value]) => <option key={key} value={key}>{value}</option>)}</select></label>
                </div>
                <label className="block text-sm font-black">وەسفی ورد<textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={12000} className="mt-2 min-h-28 w-full rounded-xl border border-black/10 p-3 text-sm font-normal"/></label>
                <div>
                  <h3 className="font-black">ڕەنگ × قەبارە · کۆگا و نرخ</h3>
                  <p className="mt-1 text-xs leading-5 text-black/45">هەر تێکەڵەیەک بە جیا ڕەنگ، قەبارە، کۆگا و نرخ هەیە. کۆگای ٠ لە پۆستی کڕین نیشان نادرێت. تێکەڵەی کۆن ناسڕدرێتەوە؛ بۆ پاراستنی مێژووی داواکاری، تەنها کۆگاکەی دەخرێتە سفر.</p>
                  {variants.length === 0 ? <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm font-bold text-amber-700">هیچ تێکەڵەیەک تۆمار نەکراوە؛ یەکێک زیاد بکە.</p> : (
                    <div className="mt-3 space-y-3">
                      {variants.map((variant) => (
                        <div key={variant.draftKey} className="rounded-2xl border border-black/[0.06] bg-[var(--shakh-bg)] p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-xs font-black text-black/45"><span className="size-4 rounded-full border border-black/15" style={{backgroundColor:variant.color_hex}} />{variant.stock_quantity > 0 ? 'بەردەست' : 'ناچالاک / کۆگا ٠'}</span>
                            {variant.stock_quantity > 0 ? <button type="button" onClick={() => setVariants((current) => current.map((item) => item.draftKey === variant.draftKey ? {...item, stock_quantity: 0} : item))} className="rounded-lg border border-red-500/20 bg-white px-3 py-1.5 text-xs font-black text-red-600">ڕاگرتنی ئەم تێکەڵەیە</button> : null}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <label className="text-xs font-black">ناوی ڕەنگ<input value={variant.color_name} maxLength={60} onChange={(e) => setVariants((current) => current.map((item) => item.draftKey === variant.draftKey ? {...item, color_name: e.target.value} : item))} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                            <label className="text-xs font-black">کۆدی ڕەنگ<input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(variant.color_hex) ? variant.color_hex : '#FFFFFF'} onChange={(e) => setVariants((current) => current.map((item) => item.draftKey === variant.draftKey ? {...item, color_hex: e.target.value.toLowerCase()} : item))} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-white p-1"/></label>
                            <label className="text-xs font-black">قەبارە<input value={variant.size_label} maxLength={40} onChange={(e) => setVariants((current) => current.map((item) => item.draftKey === variant.draftKey ? {...item, size_label: e.target.value} : item))} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                            <label className="text-xs font-black">کۆگا<input type="number" min="0" step="1" value={variant.stock_quantity} onChange={(e) => setVariants((current) => current.map((item) => item.draftKey === variant.draftKey ? {...item, stock_quantity: Number(e.target.value)} : item))} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                            <label className="text-xs font-black">نرخی تایبەت (د.ع)<input type="number" min="1" step="1" value={variant.price_iqd ?? ''} placeholder={price || 'نرخی سەرەکی'} onChange={(e) => setVariants((current) => current.map((item) => item.draftKey === variant.draftKey ? {...item, price_iqd: e.target.value.trim() === '' ? null : Number(e.target.value)} : item))} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 rounded-2xl border border-dashed border-black/15 p-3 sm:p-4">
                    <h4 className="flex items-center gap-2 font-black"><Plus size={16}/> زیادکردنی ڕەنگ/قەبارەی نوێ</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <label className="text-xs font-black">ناوی ڕەنگ<input value={newColorName} onChange={(e) => setNewColorName(e.target.value)} maxLength={60} placeholder="وەک: شینی تۆخ" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                      <label className="text-xs font-black">کۆدی ڕەنگ<input type="color" value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-black/10 bg-white p-1"/></label>
                      <label className="text-xs font-black">قەبارە<input value={newSizeLabel} onChange={(e) => setNewSizeLabel(e.target.value)} maxLength={40} placeholder="XS، M، ٤٢ یان 12Y" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                      <label className="text-xs font-black">کۆگای دەستپێک<input type="number" min="0" step="1" value={newStockQuantity} onChange={(e) => setNewStockQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                      <label className="text-xs font-black">نرخی تایبەت (د.ع)<input type="number" min="1" step="1" value={newVariantPrice} onChange={(e) => setNewVariantPrice(e.target.value)} placeholder={price || 'نرخی سەرەکی'} className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-2.5 text-sm font-normal"/></label>
                    </div>
                    <button type="button" onClick={addVariant} disabled={busy} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Plus size={15}/> زیادکردنی ئەم تێکەڵەیە</button>
                  </div>
                </div>
                <button type="button" onClick={() => void save()} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-orange)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Save size={17}/>{busy ? 'پاشەکەوتکردن...' : 'پاشەکەوتکردنی هەموو گۆڕانکارییەکان'}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
