import { Plus, Search, Tag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { listActivePosts } from '../api';
import { getPostImageUrl } from '@/lib/storage/postMedia';
import { supabase } from '@/lib/supabase/client';
import { postCategoryLabels, postRoleLabels } from '../labels';
import type { Post, PostCategory } from '../types';

export function PostsPage() {
  const { permissions } = useAuthorization();
  const canCreate = permissions.has('posts.create');
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState<PostCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPosts(await listActivePosts()); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'نەتوانرا پۆستەکان بخوێندرێنەوە.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('posts-list-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const visible = useMemo(() => posts.filter((post) => {
    const textMatch = !query.trim() || (post.title + ' ' + post.content).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return (category === 'all' || post.category === category) && textMatch;
  }), [category, posts, query]);

  const categories = useMemo(() => [...new Set(posts.map((post) => post.category))], [posts]);

  return (
    <section className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[30px] bg-[var(--shakh-orange)] p-6 text-white shadow-[0_18px_60px_rgba(255,122,26,.18)] sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black text-white/70">SHAKH Posts</div>
              <h1 className="mt-1 text-3xl font-black">پۆستەکان</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/80">پۆستە چالاکەکان لێرەدا پیشان دەدرێن؛ دەسەڵاتی publish لە database ـدا enforce کراوە.</p>
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
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button className={`min-h-12 shrink-0 rounded-2xl px-4 text-sm font-black ${category === 'all' ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/55'}`} onClick={() => setCategory('all')}>هەموو</button>
            {categories.map((item) => <button key={item} className={`min-h-12 shrink-0 rounded-2xl px-4 text-sm font-black ${category === item ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/55'}`} onClick={() => setCategory(item)}><Tag className="me-1 inline" size={14} />{postCategoryLabels[item]}</button>)}
          </div>
        </div>

        {loading ? <div className="rounded-[28px] bg-white p-12 text-center text-sm font-bold text-black/45">بارکردن...</div> : null}
        {!loading && visible.length === 0 ? <div className="rounded-[28px] border border-dashed border-black/10 bg-white p-12 text-center text-sm font-bold text-black/45">هیچ پۆستێک نەدۆزرایەوە.</div> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((post) => (
            <Link key={post.id} to={`/posts/${post.id}`} className="group overflow-hidden rounded-[28px] border border-black/[0.06] bg-white shadow-[0_12px_35px_rgba(16,22,35,.04)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,22,35,.09)]">
              {post.images?.[0]?.storage_path ? (
                <img src={getPostImageUrl(post.images[0].storage_path)} alt={post.title} className="aspect-[4/3] w-full bg-[var(--shakh-bg)] object-cover" loading="lazy" />
              ) : null}
              <div className="p-5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-black">
                  <span className="rounded-full bg-[var(--shakh-orange)]/10 px-2.5 py-1 text-[var(--shakh-orange)]">{postCategoryLabels[post.category]}</span>
                  <span className="text-black/30">{postRoleLabels[post.publisher_role]}</span>
                </div>
                <h2 className="mt-4 line-clamp-2 text-lg font-black group-hover:text-[var(--shakh-blue)]">{post.title}</h2>
                <p className="mt-2 line-clamp-4 text-sm leading-7 text-black/50">{post.content || '—'}</p>
                {post.category === 'fashion' && post.discount_percent > 0 ? <span className="mt-3 inline-flex rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-600">{post.discount_percent}٪ داشکاندن</span> : null}
                <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-4">
                  <span className="text-xs font-bold text-black/35">{post.location || '—'}</span>
                  <span className="font-black text-[var(--shakh-navy)]">{post.price_iqd !== null ? Number(post.price_iqd).toLocaleString('en-US') + ' IQD' : '—'}</span>
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
