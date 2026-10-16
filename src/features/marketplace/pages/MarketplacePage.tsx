import { Search, SlidersHorizontal, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCategories, getProducts, toggleWishlist, isWishlisted, addToCart } from '../api';
import type { Category, Product } from '../types';
import { CategoryIcon } from '../components/CategoryIcon';
import { ProductGrid } from '../components/ProductGrid';
import { useAuth } from '@/lib/auth/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { listActivePosts } from '@/features/posts/api';
import type { Post, PostCategory } from '@/features/posts/types';
import { postCategoryLabels, postRoleLabels } from '@/features/posts/labels';
import { getPostImageUrl } from '@/lib/storage/postMedia';

const postCategorySlugs: Record<PostCategory, string> = {
  general: 'general',
  food: 'food',
  fashion: 'fashion',
  electronics: 'electronics',
  home_living: 'home-living',
  beauty: 'beauty',
  kids: 'kids',
  online_stores: 'online-stores',
  cars: 'cars',
  umrah: 'umrah',
  delivery: 'delivery',
};

type CategoryOption = Pick<Category, 'id' | 'slug' | 'name_ku' | 'icon_key'>;

export function MarketplacePage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const query = params.get('q') ?? '';
  const categorySlug = params.get('category') ?? '';
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postError, setPostError] = useState<string | null>(null);
  const [postsLoading, setPostsLoading] = useState(true);
  const [wishlistIds, setWishlistIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(query);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [postsRevision, setPostsRevision] = useState(0);

  const selectedCategory = useMemo(() => categories.find((item) => item.slug === categorySlug) ?? null, [categories, categorySlug]);
  const selectedCategoryLabel = useMemo(() => {
    if (selectedCategory) return selectedCategory.name_ku;
    const matchedPostCategory = (Object.keys(postCategorySlugs) as PostCategory[])
      .find((postCategory) => postCategorySlugs[postCategory] === categorySlug);
    return matchedPostCategory ? postCategoryLabels[matchedPostCategory] : 'بازاڕ';
  }, [categorySlug, selectedCategory]);

  const categoryOptions = useMemo(() => {
    const bySlug = new Map<string, CategoryOption>();
    categories.forEach((category) => bySlug.set(category.slug, {
      id: category.id,
      slug: category.slug,
      name_ku: category.name_ku,
      icon_key: category.icon_key,
    }));
    (Object.keys(postCategorySlugs) as PostCategory[]).forEach((postCategory) => {
      const slug = postCategorySlugs[postCategory];
      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          id: 'post-category-' + postCategory,
          slug,
          name_ku: postCategoryLabels[postCategory],
          icon_key: null,
        });
      }
    });
    return [...bySlug.values()];
  }, [categories]);

  useEffect(() => {
    let cancelled = false;
    void getCategories()
      .then((nextCategories) => { if (!cancelled) setCategories(nextCategories); })
      .catch(() => { if (!cancelled) setCategories([]); })
      .finally(() => { if (!cancelled) setCategoriesLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const channel = supabase.channel('marketplace-live-content')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => setCatalogRevision((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => setCatalogRevision((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, () => setCatalogRevision((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_details' }, () => setCatalogRevision((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_option_groups' }, () => setCatalogRevision((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_menu_options' }, () => setCatalogRevision((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => setPostsRevision((value) => value + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    setSearch(query);
    let cancelled = false;

    // A post-only category (cars, Umrah, or delivery, for example) must not
    // accidentally fall back to showing every product in the catalogue.
    if (categorySlug && !categoriesLoaded) {
      setLoading(true);
      return () => { cancelled = true; };
    }
    if (categorySlug && !selectedCategory) {
      setProducts([]);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    void getProducts({ search: query, categoryId: selectedCategory?.id, limit: 48 })
      .catch(() => [] as Product[])
      .then((items) => { if (!cancelled) setProducts(items); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, selectedCategory?.id, catalogRevision, categoriesLoaded, categorySlug, selectedCategory]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setPosts([]);
      setPostError(null);
      setPostsLoading(false);
      return () => { cancelled = true; };
    }

    setPostsLoading(true);
    setPostError(null);
    void listActivePosts()
      .then((items) => { if (!cancelled) setPosts(items); })
      .catch((error) => {
        if (!cancelled) setPostError(error instanceof Error ? error.message : 'نەتوانرا پۆستە چالاکەکان بخوێندرێنەوە.');
      })
      .finally(() => { if (!cancelled) setPostsLoading(false); });

    return () => { cancelled = true; };
  }, [user, postsRevision]);

  useEffect(() => {
    if (!user || !products.length) { setWishlistIds(new Set()); return; }
    let cancelled = false;
    void Promise.all(products.map(async (product) => [product.id, await isWishlisted(user.id, product.id)] as const)).then((pairs) => {
      if (!cancelled) setWishlistIds(new Set(pairs.filter(([, active]) => active).map(([id]) => id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [products, user]);

  const visiblePosts = useMemo(() => posts.filter((post) => {
    const matchesCategory = !categorySlug || postCategorySlugs[post.category] === categorySlug;
    const postText = (post.title + ' ' + post.content).toLocaleLowerCase();
    const matchesSearch = !query.trim() || postText.includes(query.trim().toLocaleLowerCase());
    return matchesCategory && matchesSearch;
  }), [categorySlug, posts, query]);

  const applySearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    if (search.trim()) next.set('q', search.trim()); else next.delete('q');
    setParams(next);
  };

  const setCategory = (slug: string) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug); else next.delete('category');
    setParams(next);
  };

  const handleWishlist = async (product: Product) => {
    if (!user) return;
    const active = wishlistIds.has(product.id);
    try {
      await toggleWishlist(user.id, product.id, active);
      setWishlistIds((current) => {
        const next = new Set(current);
        if (active) next.delete(product.id); else next.add(product.id);
        return next;
      });
    } catch { /* UI remains stable when request fails. */ }
  };

  const handleAdd = async (product: Product) => {
    if (!user || product.stock_quantity <= 0) return;
    try { await addToCart(user.id, product.id, null, 1, product.base_price_iqd); } catch { /* authoritative DB trigger protects price/stock */ }
  };

  const showPostSection = Boolean(user && (postsLoading || postError || visiblePosts.length > 0));

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-6 sm:py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-[30px] bg-[var(--shakh-navy)] p-5 text-white shadow-[0_24px_70px_rgba(11,18,32,.12)] sm:p-8">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[.18em] text-white/45">SHAKH MARKET</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">چی دەگەڕێیت؟</h1>
            <form onSubmit={applySearch} className="mt-6 flex max-w-2xl items-center gap-2 rounded-[20px] bg-white p-2 shadow-lg">
              <Search className="ms-2 shrink-0 text-black/35" size={20} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-black outline-none" placeholder="بەرهەم، براند، فرۆشگا..." aria-label="گەڕانی بەرهەم و پۆست" />
              <button className="rounded-2xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white">گەڕان</button>
            </form>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            <button onClick={() => setCategory('')} className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${!categorySlug ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/60 ring-1 ring-black/[0.05]'}`}><SlidersHorizontal size={17} /> هەموو</button>
            {categoryOptions.map((category) => <button key={category.id} onClick={() => setCategory(category.slug)} className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${categorySlug === category.slug ? 'bg-[var(--shakh-orange)] text-white' : 'bg-white text-black/60 ring-1 ring-black/[0.05]'}`}><CategoryIcon iconKey={category.icon_key} size={17} /> {category.name_ku}</button>)}
          </div>
        </div>

        {showPostSection ? (
          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-xs font-black text-[var(--shakh-blue)]">SHAKH POSTS</p><h2 className="mt-1 text-2xl font-black">{selectedCategoryLabel === 'بازاڕ' ? 'پۆستە نوێ و چالاکەکان' : 'پۆستەکانی ' + selectedCategoryLabel}</h2></div>
              <span className="text-xs font-bold text-black/35">{visiblePosts.length} پۆست</span>
            </div>
            {postError ? <div role="alert" className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-50 p-4 text-sm font-bold text-amber-800">{postError}</div> : null}
            {postsLoading ? <div className="mt-4 rounded-2xl bg-white p-8 text-center text-sm font-bold text-black/45">بارکردنی پۆستەکان...</div> : null}
            {!postsLoading && !postError && visiblePosts.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
                {visiblePosts.map((post) => (
                  <Link key={post.id} to={`/posts/${post.id}`} className="group min-w-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_6px_20px_rgba(16,22,35,.035)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(16,22,35,.08)]">
                    {post.images?.[0]?.storage_path ? <img src={getPostImageUrl(post.images[0].storage_path)} alt={post.title} className="aspect-[3/2] w-full bg-[var(--shakh-bg)] object-cover" loading="lazy" /> : null}
                    <div className="p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-1.5 text-[10px] font-black sm:text-[11px]">
                        <span className="rounded-full bg-[var(--shakh-orange)]/10 px-2 py-1 text-[var(--shakh-orange)]">{postCategoryLabels[post.category]}</span>
                        <span className="text-black/30">{postRoleLabels[post.publisher_role]}</span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 min-h-10 break-words text-sm font-black leading-5 group-hover:text-[var(--shakh-blue)] sm:mt-3 sm:text-base sm:leading-6">{post.title}</h3>
                      <p className="mt-1 line-clamp-2 min-h-10 break-words text-xs leading-5 text-black/50 sm:text-sm sm:leading-6">{post.content || '—'}</p>
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2 sm:mt-3 sm:pt-3">
                        <span className="text-xs font-bold text-black/35">{post.location || '—'}</span>
                        <span className="shrink-0 text-xs font-black text-[var(--shakh-navy)] sm:text-sm">{post.price_iqd !== null ? Number(post.price_iqd).toLocaleString('en-US') + ' د.ع' : '—'}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-black text-[var(--shakh-blue)] sm:text-xs"><Tag size={12} /> بینینی پۆست ←</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
            {!postsLoading && !postError && visiblePosts.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white p-8 text-center text-sm font-bold text-black/45">لەو کاتەگۆرییەدا پۆستی چالاک نییە.</div> : null}
          </section>
        ) : null}

        <div className="mt-8 flex items-end justify-between gap-3">
          <div><p className="text-xs font-black text-[var(--shakh-blue)]">{selectedCategoryLabel}</p><h2 className="mt-1 text-2xl font-black">{query ? `ئەنجامی گەڕان بۆ «${query}»` : 'بەرهەمە نوێ و چالاکەکان'}</h2></div>
          <div className="hidden text-xs font-bold text-black/35 sm:block">{products.length} بەرهەم</div>
        </div>

        <div className="mt-5">
          <ProductGrid products={products} loading={loading} wishlistIds={wishlistIds} onToggleWishlist={handleWishlist} onAdd={handleAdd} />
        </div>
      </div>
    </section>
  );
}

