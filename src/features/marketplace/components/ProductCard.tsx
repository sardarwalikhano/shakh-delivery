import { Heart, Plus, Store } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Product } from '../types';
import { getProductImageUrl } from '@/lib/storage/catalogMedia';

type Props = {
  product: Product;
  wishlisted?: boolean;
  onToggleWishlist?: (product: Product) => void;
  onAdd?: (product: Product) => void;
};

export function ProductCard({ product, wishlisted = false, onToggleWishlist, onAdd }: Props) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const soldOut = product.stock_quantity <= 0;

  const add = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/product/${product.slug}` } });
      return;
    }
    onAdd?.(product);
  };

  const toggleWishlist = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/product/${product.slug}` } });
      return;
    }
    onToggleWishlist?.(product);
  };

  return (
    <article className="group overflow-hidden rounded-[26px] border border-black/[0.06] bg-white shadow-[0_10px_30px_rgba(16,22,35,.035)] transition hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(16,22,35,.09)]">
      <div className="relative aspect-[4/4.5] overflow-hidden bg-[var(--shakh-bg)]">
        <Link to={`/product/${product.slug}`} className="absolute inset-0" aria-label={product.name_ku}>
          {product.images[0] ? (
            <img src={getProductImageUrl(product.images[0].storage_path)} alt={product.images[0].alt_ku ?? product.name_ku} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <span className="text-xs font-bold text-black/25">وێنەی بەرهەم بەردەست نییە</span>
            </div>
          )}
        </Link>
        <div className="absolute start-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black shadow-sm">
          {product.category?.name_ku ?? 'بازاڕ'}
        </div>
        <button onClick={toggleWishlist} className={`absolute end-3 top-3 grid size-10 place-items-center rounded-full border border-white/80 bg-white/90 shadow-sm transition ${wishlisted ? 'text-[var(--shakh-orange)]' : 'text-black/55 hover:text-[var(--shakh-orange)]'}`} aria-label={wishlisted ? 'لابردن لە دڵخوازەکان' : 'زیادکردن بۆ دڵخوازەکان'}>
          <Heart size={18} fill={wishlisted ? 'currentColor' : 'none'} />
        </button>
        {product.compare_at_price_iqd && product.compare_at_price_iqd > product.base_price_iqd ? (
          <div className="absolute bottom-3 start-3 rounded-full bg-[var(--shakh-orange)] px-2.5 py-1 text-[10px] font-black text-white">
            {Math.round((1 - product.base_price_iqd / product.compare_at_price_iqd) * 100)}٪ داشکاندن
          </div>
        ) : null}
      </div>

      <div className="p-4">
        <Link to={`/product/${product.slug}`} className="block">
          <h3 className="line-clamp-2 min-h-12 text-sm font-black leading-6 text-[var(--shakh-ink)]">{product.name_ku}</h3>
        </Link>
        {product.store ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-black/40">
            <Store size={13} /> <span className="truncate">{product.store.name_ku}</span>
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-black tabular-nums">{product.base_price_iqd.toLocaleString('en-US')} <span className="text-xs text-black/40">د.ع</span></div>
            {product.compare_at_price_iqd && product.compare_at_price_iqd > product.base_price_iqd ? <div className="mt-0.5 text-xs text-black/35 line-through">{product.compare_at_price_iqd.toLocaleString('en-US')} د.ع</div> : null}
          </div>
          <button disabled={soldOut} onClick={add} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30" aria-label="زیادکردن بۆ سەبەتە">
            {soldOut ? <span className="text-[10px] font-black">نەماوە</span> : <Plus size={20} />}
          </button>
        </div>
      </div>
    </article>
  );
}
