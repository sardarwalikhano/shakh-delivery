import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategories, getChildCategories, getProducts, toggleWishlist, isWishlisted, addToCart } from '../api';
import type { Category, Product } from '../types';
import { CategoryIcon } from '../components/CategoryIcon';
import { ProductGrid } from '../components/ProductGrid';
import { useAuth } from '@/lib/auth/AuthContext';

export function MarketplacePage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const query = params.get('q') ?? '';
  const categorySlug = params.get('category') ?? '';
  const subcategorySlug = params.get('subcategory') ?? '';
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [wishlistIds, setWishlistIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(query);

  const selectedCategory = useMemo(() => categories.find((item) => item.slug === categorySlug) ?? null, [categories, categorySlug]);
  const selectedSubcategory = useMemo(() => subcategories.find((item) => item.slug === subcategorySlug) ?? null, [subcategories, subcategorySlug]);

  useEffect(() => { void getCategories().then(setCategories).catch(() => setCategories([])); }, []);

  useEffect(() => {
    if (!selectedCategory) { setSubcategories([]); return; }
    let cancelled = false;
    void getChildCategories(selectedCategory.id).then((items) => { if (!cancelled) setSubcategories(items); }).catch(() => { if (!cancelled) setSubcategories([]); });
    return () => { cancelled = true; };
  }, [selectedCategory?.id]);

  useEffect(() => {
    setSearch(query);
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const items = await getProducts({ search: query, categoryId: selectedSubcategory?.id ?? selectedCategory?.id, limit: 48 }).catch(() => [] as Product[]);
      if (!cancelled) { setProducts(items); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [query, selectedCategory?.id, selectedSubcategory?.id]);

  useEffect(() => {
    if (!user || !products.length) { setWishlistIds(new Set()); return; }
    let cancelled = false;
    void Promise.all(products.map(async (product) => [product.id, await isWishlisted(user.id, product.id)] as const)).then((pairs) => {
      if (!cancelled) setWishlistIds(new Set(pairs.filter(([, active]) => active).map(([id]) => id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [products, user]);

  const applySearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams(params);
    if (search.trim()) next.set('q', search.trim()); else next.delete('q');
    setParams(next);
  };

  const setCategory = (slug: string) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug); else next.delete('category');
    next.delete('subcategory');
    setParams(next);
  };

  const setSubcategory = (slug: string) => {
    const next = new URLSearchParams(params);
    if (slug) next.set('subcategory', slug); else next.delete('subcategory');
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

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-6 sm:py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-[30px] bg-[var(--shakh-navy)] p-5 text-white shadow-[0_24px_70px_rgba(11,18,32,.12)] sm:p-8">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[.18em] text-white/45">SHAKH MARKET</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">چی دەگەڕێیت؟</h1>
            <form onSubmit={applySearch} className="mt-6 flex max-w-2xl items-center gap-2 rounded-[20px] bg-white p-2 shadow-lg">
              <Search className="ms-2 shrink-0 text-black/35" size={20} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-black outline-none" placeholder="بەرهەم، براند، فرۆشگا..." aria-label="گەڕانی بەرهەم" />
              <button className="rounded-2xl bg-[var(--shakh-orange)] px-4 py-3 text-sm font-black text-white">گەڕان</button>
            </form>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            <button onClick={() => setCategory('')} className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${!categorySlug ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/60 ring-1 ring-black/[0.05]'}`}><SlidersHorizontal size={17} /> هەموو</button>
            {categories.map((category) => <button key={category.id} onClick={() => setCategory(category.slug)} className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${categorySlug === category.slug ? 'bg-[var(--shakh-orange)] text-white' : 'bg-white text-black/60 ring-1 ring-black/[0.05]'}`}><CategoryIcon iconKey={category.icon_key} size={17} /> {category.name_ku}</button>)}
          </div>
        </div>

        {selectedCategory && subcategories.length ? <div className="mt-4 rounded-3xl border border-black/[0.05] bg-white p-3 sm:p-4">
          <div className="mb-3 px-1 text-xs font-black text-black/40">بەشی لاوەکیی {selectedCategory.name_ku}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSubcategory('')} className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${!subcategorySlug ? 'bg-[var(--shakh-blue)] text-white' : 'bg-[var(--shakh-bg)] text-black/60'}`}>هەموو {selectedCategory.name_ku}</button>
            {subcategories.map((item) => <button key={item.id} onClick={() => setSubcategory(item.slug)} className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${subcategorySlug === item.slug ? 'bg-[var(--shakh-orange)] text-white' : 'bg-[var(--shakh-bg)] text-black/60'}`}>{item.name_ku}</button>)}
          </div>
        </div> : null}

        <div className="mt-8 flex items-end justify-between gap-3">
          <div><p className="text-xs font-black text-[var(--shakh-blue)]">{selectedSubcategory?.name_ku ?? selectedCategory?.name_ku ?? 'بازاڕ'}</p><h2 className="mt-1 text-2xl font-black">{query ? `ئەنجامی گەڕان بۆ «${query}»` : 'بەرهەمە نوێ و چالاکەکان'}</h2></div>
          <div className="hidden text-xs font-bold text-black/35 sm:block">{products.length} بەرهەم</div>
        </div>

        <div className="mt-5">
          <ProductGrid products={products} loading={loading} wishlistIds={wishlistIds} onToggleWishlist={handleWishlist} onAdd={handleAdd} />
        </div>
      </div>
    </section>
  );
}
