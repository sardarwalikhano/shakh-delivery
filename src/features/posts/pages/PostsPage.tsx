import { Gift, Home, Plus, Search, Tag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { listActivePosts } from '../api';
import { getPostImageUrl } from '@/lib/storage/postMedia';
import { supabase } from '@/lib/supabase/client';
import { postCategoryLabels, postRoleLabels } from '../labels';
import type { Post, PostCategory } from '../types';

const electronicsColors: Record<string, string> = {
  black: 'ڕەش', white: 'سپی', blue: 'شین', silver: 'زیوی', gray: 'خاکستەری',
  gold: 'زێڕی', green: 'سەوز', red: 'سوور', purple: 'مۆر', pink: 'پەمەیی', other: 'ڕەنگی تر',
};

const electronicsColorHexes: Record<string, string> = {
  black: '#171717', white: '#FFFFFF', blue: '#2563EB', silver: '#C0C0C0', gray: '#6B7280',
  gold: '#D4AF37', green: '#15803D', red: '#DC2626', purple: '#9333EA', pink: '#EC4899', other: '#9CA3AF',
};

function getElectronicsColorValues(post: Post): string[] {
  const details = post.category_details ?? {};
  const multiple = typeof details.available_colors === 'string'
    ? details.available_colors.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
  const fallback = typeof details.color === 'string' && details.color.trim() ? [details.color.trim()] : [];
  return [...new Set(multiple.length ? multiple : fallback)];
}

const electronicsTypes = [
  { value: 'all', label: 'هەموو ئەلیکترۆنیات' },
  { value: 'phone', label: 'مۆبایل' },
  { value: 'tablet', label: 'تابلێت' },
  { value: 'laptop', label: 'لاپتۆپ' },
  { value: 'desktop', label: 'دیسکۆپ' },
  { value: 'monitor', label: 'مۆنیتەر' },
  { value: 'tv', label: 'تەلەڤیزیۆن' },
  { value: 'audio', label: 'دەنگ و هێدفۆن' },
  { value: 'camera', label: 'کامێرا' },
  { value: 'gaming', label: 'گێمینگ' },
  { value: 'appliance', label: 'ئامێری کارەبایی' },
  { value: 'accessory', label: 'ئەکسسوارات' },
  { value: 'other', label: 'جۆری تر' },
] as const;

function homeLivingKind(post: Post): string {
  return String(post.category_details?.listing_kind ?? '');
}

function homeLivingFee(post: Post): number {
  const kind = homeLivingKind(post);
  if (kind === 'property') return 5000;
  if (kind === 'furniture') return 2000;
  return Number(post.category_details?.posting_fee_iqd ?? 0);
}

function searchablePostText(post: Post): string {
  const details = post.category_details ?? {};
  const productType = String(details.product_type ?? '');
  const productTypeLabel = electronicsTypes.find((item) => item.value === productType)?.label ?? '';
  const color = String(details.color ?? '');
  const colorLabel = electronicsColors[color] ?? color;
  return [
    post.title,
    post.content,
    post.brand ?? '',
    productType,
    productTypeLabel,
    String(details.model ?? ''),
    color,
    colorLabel,
    getElectronicsColorValues(post).map((value) => electronicsColors[value] ?? value).join(' '),
    String(details.ram_capacity ?? ''),
    String(details.storage_capacity ?? ''),
  ].join(' ').toLocaleLowerCase();
}

export function PostsPage() {
  const { permissions } = useAuthorization();
  const canCreate = permissions.has('posts.create');
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState<PostCategory | 'all'>('all');
  const [electronicsType, setElectronicsType] = useState<(typeof electronicsTypes)[number]['value']>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activePosts = await listActivePosts();
      setPosts(activePosts);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا پۆستەکان بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('posts-list-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const visible = useMemo(() => posts.filter((post) => {
    const textMatch = !query.trim() || searchablePostText(post).includes(query.trim().toLocaleLowerCase());
    const categoryMatch = category === 'all' || post.category === category;
    const electronicsTypeMatch = category !== 'electronics'
      || electronicsType === 'all'
      || String(post.category_details?.product_type ?? '') === electronicsType;
    return categoryMatch && electronicsTypeMatch && textMatch;
  }), [category, electronicsType, posts, query]);

  // Keep every supported category available even when its first query returns
  // no rows; category buttons should not disappear because the feed is still loading.
  const categories = useMemo(() => Object.keys(postCategoryLabels) as PostCategory[], []);

  return (
    <section className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] px-2 py-3 sm:px-6 sm:py-6 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        <header className="rounded-2xl bg-[var(--shakh-orange)] p-4 text-white shadow-[0_14px_40px_rgba(255,122,26,.16)] sm:rounded-[30px] sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black text-white/70">SHAKH Posts</div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">پۆستەکان</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80 sm:leading-7">پۆستە چالاکەکان لێرەدا پیشان دەدرێن؛ وردەکاری و نرخەکان بە ڕوونی ببینە.</p>
            </div>
            {canCreate ? <Link to="/dashboard/posts/new" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-[var(--shakh-navy)]"><Plus size={17} /> پۆستی نوێ</Link> : null}
          </div>
        </header>

        <AuthFeedback error={error} />

        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/35" size={17} />
            <input className="h-12 w-full rounded-2xl border border-black/10 bg-white ps-11 pe-4 text-sm outline-none focus:border-[var(--shakh-blue)]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="گەڕان لە پۆستەکان..." />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button className={`min-h-12 shrink-0 rounded-2xl px-4 text-sm font-black ${category === 'all' ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/55'}`} onClick={() => { setCategory('all'); setElectronicsType('all'); }}>هەموو</button>
            {categories.map((item) => <button key={item} className={`min-h-12 shrink-0 rounded-2xl px-4 text-sm font-black ${category === item ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/55'}`} onClick={() => { setCategory(item); if (item !== 'electronics') setElectronicsType('all'); }}><Tag className="me-1 inline" size={14} />{postCategoryLabels[item]}</button>)}
          </div>
        </div>

        {category === 'electronics' ? (
          <section aria-label="کاتەگۆرییەکانی ئەلیکترۆنیات" className="rounded-2xl border border-[var(--shakh-blue)]/10 bg-white p-3 sm:p-4">
            <div className="mb-3 text-xs font-black text-black/40">جۆری ئەلیکترۆنیات</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {electronicsTypes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={electronicsType === item.value}
                  onClick={() => setElectronicsType(item.value)}
                  className={`min-h-10 shrink-0 rounded-xl px-3 py-2 text-xs font-black transition ${electronicsType === item.value ? 'bg-[var(--shakh-blue)] text-white' : 'bg-[var(--shakh-bg)] text-black/60 hover:bg-[var(--shakh-blue)]/10'}`}
                >{item.label}</button>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? <div className="rounded-[28px] bg-white p-12 text-center text-sm font-bold text-black/45">بارکردن...</div> : null}
        {!loading && visible.length === 0 ? <div className="rounded-[28px] border border-dashed border-black/10 bg-white p-12 text-center text-sm font-bold text-black/45">هیچ پۆستێک نەدۆزرایەوە.</div> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {visible.map((post) => (
            <Link key={post.id} to={`/posts/${post.id}`} className="group min-w-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(16,22,35,.04)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,22,35,.09)] sm:rounded-[28px]">
              {post.images?.[0]?.storage_path ? (
                <img src={getPostImageUrl(post.images[0].storage_path)} alt={post.title} className="aspect-[4/3] w-full bg-[var(--shakh-bg)] object-cover" loading="lazy" />
              ) : null}
              <div className="p-3 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-black sm:text-[11px]">
                  <span className="rounded-full bg-[var(--shakh-orange)]/10 px-2.5 py-1 text-[var(--shakh-orange)]">{postCategoryLabels[post.category]}</span>
                  <span className="text-black/30">{postRoleLabels[post.publisher_role]}</span>
                </div>
                <h2 className="mt-2 line-clamp-2 break-words text-sm font-black leading-6 group-hover:text-[var(--shakh-blue)] sm:mt-4 sm:text-lg sm:leading-normal">{post.title}</h2>
                <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-black/50 sm:mt-2 sm:line-clamp-4 sm:text-sm sm:leading-7">{post.content || '—'}</p>
                {post.category === 'fashion' && post.discount_percent > 0 ? <span className="mt-3 inline-flex rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-600">{post.discount_percent}٪ داشکاندن</span> : null}
                {post.category === 'electronics' ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const productType = String(post.category_details?.product_type ?? '');
                        const typeLabel = electronicsTypes.find((item) => item.value === productType)?.label;
                        return typeLabel ? <span className="rounded-full bg-[var(--shakh-blue)]/10 px-2.5 py-1 text-xs font-black text-[var(--shakh-blue)]">{typeLabel}</span> : null;
                      })()}
                      {post.category_details?.model ? <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-bold text-black/60">{String(post.category_details.model)}</span> : null}
                      {(() => {
                        const colorValues = getElectronicsColorValues(post);
                        return colorValues.length ? (
                          <span className="inline-flex flex-wrap items-center gap-2 rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-bold text-black/60">
                            <span className="flex -space-x-1.5" aria-hidden="true">
                              {colorValues.map((value) => <span key={value} title={electronicsColors[value] ?? value} className="size-4 rounded-full border border-black/15" style={{ backgroundColor: electronicsColorHexes[value] ?? '#9CA3AF' }} />)}
                            </span>
                            <span>ڕەنگ: {colorValues.map((value) => electronicsColors[value] ?? value).join('، ')}</span>
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="text-xs leading-5 text-black/50">
                      {post.category_details?.ram_capacity ? <span>RAM: {String(post.category_details.ram_capacity)}</span> : null}
                      {post.category_details?.ram_capacity && post.category_details?.storage_capacity ? <span> · </span> : null}
                      {post.category_details?.storage_capacity ? <span>Storage: {String(post.category_details.storage_capacity)}</span> : null}
                    </div>
                    {Number(post.share_reward_iqd || post.referral_reward_iqd || 0) > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-800"><Gift size={13}/>{Number(post.share_reward_iqd ?? post.referral_reward_iqd ?? 0).toLocaleString('en-US')} د.ع خەڵات بۆ هەر فرۆشتنی تەواوبوو</span> : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-col items-start justify-between gap-1.5 border-t border-black/[0.06] pt-3 sm:mt-4 sm:flex-row sm:items-center sm:pt-4">
                  <span className="text-xs font-bold text-black/35">{post.location || '—'}</span>
                  <span className="break-words text-sm font-black leading-5 text-[var(--shakh-navy)] sm:text-base">{post.price_iqd !== null ? Number(post.price_iqd).toLocaleString('en-US') + ' د.ع' : '—'}</span>
                </div>
                <div className="mt-3 text-xs font-black text-[var(--shakh-blue)]">بینینی وردەکاری ←</div>{post.category === 'home_living' && homeLivingFee(post) > 0 ? <div className="mt-2 rounded-lg bg-[var(--shakh-orange)]/[0.08] px-2.5 py-2 text-[11px] font-black leading-5 text-[var(--shakh-orange)] sm:rounded-xl sm:text-xs">کرێی پۆستکردن: {homeLivingFee(post).toLocaleString('en-US')} د.ع</div> : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
