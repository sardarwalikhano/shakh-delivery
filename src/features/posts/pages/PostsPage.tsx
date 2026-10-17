import { Gift, Image as ImageIcon, Plus, Search, Tag } from 'lucide-react';
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
    <section className="min-h-[calc(100dvh-4rem)] bg-transparent px-3 py-4 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-[1.9rem] border border-white/10 bg-[var(--shakh-navy)] p-5 text-white shadow-[var(--shakh-shadow-lg)] sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="shakh-eyebrow !text-[var(--shakh-orange)]">SHAKH Posts</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">پۆستەکان</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">پۆستە چالاکەکان لێرەدا پیشان دەدرێن؛ دەسەڵاتی publish لە database ـدا enforce کراوە.</p>
            </div>
            {canCreate ? <Link to="/dashboard/posts/new" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-5 py-3 text-sm font-black text-white transition hover:bg-[#e96919]"><Plus size={17} /> پۆستی نوێ</Link> : null}
          </div>
        </header>

        <AuthFeedback error={error} />

        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[var(--shakh-border)] bg-white p-3 shadow-[var(--shakh-shadow-sm)] md:flex-row md:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-black/35" size={17} />
            <input className="shakh-field h-12 w-full ps-11 pe-4 text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="گەڕان لە پۆستەکان..." />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`min-h-11 shrink-0 rounded-xl px-3.5 text-sm font-black transition ${category === 'all' ? 'bg-[var(--shakh-navy)] text-white' : 'text-[var(--shakh-muted)] hover:bg-[var(--shakh-bg)]'}`} onClick={() => { setCategory('all'); setElectronicsType('all'); }}>هەموو</button>
            {categories.map((item) => <button key={item} className={`min-h-11 shrink-0 rounded-xl px-3.5 text-sm font-black transition ${category === item ? 'bg-[var(--shakh-navy)] text-white' : 'text-[var(--shakh-muted)] hover:bg-[var(--shakh-bg)]'}`} onClick={() => { setCategory(item); if (item !== 'electronics') setElectronicsType('all'); }}><Tag className="me-1 inline" size={14} />{postCategoryLabels[item]}</button>)}
          </div>
        </div>

        {category === 'electronics' ? (
          <section aria-label="کاتەگۆرییەکانی ئەلیکترۆنیات" className="rounded-2xl border border-[var(--shakh-border)] bg-white p-3 shadow-[var(--shakh-shadow-sm)] sm:p-4">
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

        {loading ? <div className="rounded-[1.5rem] border border-[var(--shakh-border)] bg-white p-12 text-center text-sm font-bold text-[var(--shakh-muted)]">بارکردن...</div> : null}
        {!loading && visible.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-[var(--shakh-border)] bg-white p-12 text-center text-sm font-bold text-[var(--shakh-muted)]">هیچ پۆستێک نەدۆزرایەوە.</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {visible.map((post) => (
            <Link key={post.id} to={`/posts/${post.id}`} className="group flex min-w-0 flex-col overflow-hidden rounded-[1.45rem] border border-[var(--shakh-border)] bg-white shadow-[var(--shakh-shadow-sm)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--shakh-blue)]/20 hover:shadow-[var(--shakh-shadow-md)]">
              {post.images?.[0]?.storage_path ? (
                <img src={getPostImageUrl(post.images[0].storage_path)} alt={post.title} className="aspect-[3/2] w-full bg-[var(--shakh-surface-soft)] object-cover transition duration-300 group-hover:scale-[1.015]" loading="lazy" />
              ) : (
                <div className="grid aspect-[3/2] w-full place-items-center bg-[var(--shakh-surface-soft)] text-[var(--shakh-muted)]"><ImageIcon size={26} strokeWidth={1.6} /><span className="mt-2 text-[11px] font-bold">وێنە بەردەست نییە</span></div>
              )}
              <div className="flex flex-1 flex-col p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2 text-[11px] font-black">
                  <span className="max-w-[65%] truncate rounded-full bg-[var(--shakh-orange)]/[0.09] px-2.5 py-1 text-[var(--shakh-orange)]">{postCategoryLabels[post.category]}</span>
                  <span className="text-black/30">{postRoleLabels[post.publisher_role]}</span>
                </div>
                <h2 className="mt-3 line-clamp-2 min-h-11 text-base font-black leading-6 text-[var(--shakh-ink)] transition-colors group-hover:text-[var(--shakh-blue)] sm:text-lg">{post.title}</h2>
                <p className="mt-2 line-clamp-3 min-h-0 text-sm leading-7 text-[var(--shakh-muted)]">{post.content || '—'}</p>
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
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--shakh-border)] pt-3.5">
                  <span className="min-w-0 truncate text-xs font-bold text-[var(--shakh-muted)]">{post.location || '—'}</span>
                  <span className="shrink-0 font-black tabular-nums text-[var(--shakh-navy)]">{post.price_iqd !== null ? Number(post.price_iqd).toLocaleString('en-US') + ' IQD' : '—'}</span>
                </div>
                <div className="mt-3 text-xs font-black text-[var(--shakh-blue)]">بینینی وردەکاری و ڕەنگ/قەبارە ←</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
