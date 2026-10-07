import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWishlist, toggleWishlist, addToCart } from '../api';
import type { Product } from '../types';
import { ProductGrid } from '../components/ProductGrid';
import { useAuth } from '@/lib/auth/AuthContext';

export function WishlistPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void getWishlist(user.id).then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  }, [user]);

  const handleWishlist = async (product: Product) => {
    if (!user) return;
    try { await toggleWishlist(user.id, product.id, true); setProducts((items) => items.filter((item) => item.id !== product.id)); } catch { /* keep view stable */ }
  };

  const handleAdd = async (product: Product) => {
    if (!user || product.stock_quantity <= 0) return;
    try { await addToCart(user.id, product.id, null, 1, product.base_price_iqd); } catch { /* database is authoritative */ }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[var(--shakh-orange)]"><Heart size={19} fill="currentColor" /><span className="text-xs font-black">دڵخوازەکان</span></div><h1 className="mt-2 text-3xl font-black">لیستی دڵخوازەکان</h1></div><Link to="/search" className="rounded-2xl bg-white px-4 py-3 text-sm font-black ring-1 ring-black/[0.05]">گەڕانی بەرهەم</Link></div>
        <div className="mt-6"><ProductGrid products={products} loading={loading} emptyTitle="هێشتا هیچ دڵخوازێکت نییە" emptyText="لە هەر بەرهەمێکەوە نیشانی دڵ بکە تا لێرە بیبینیت." onToggleWishlist={handleWishlist} onAdd={handleAdd} /></div>
      </div>
    </section>
  );
}
