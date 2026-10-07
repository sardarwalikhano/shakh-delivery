import { Heart, LoaderCircle, SearchX } from 'lucide-react';
import type { Product } from '../types';
import { ProductCard } from './ProductCard';

type Props = {
  products: Product[];
  loading: boolean;
  emptyTitle?: string;
  emptyText?: string;
  wishlistIds?: ReadonlySet<string>;
  onToggleWishlist?: (product: Product) => void;
  onAdd?: (product: Product) => void;
};

export function ProductGrid({ products, loading, emptyTitle = 'هیچ بەرهەمێک نەدۆزرایەوە', emptyText = 'بەرهەمی چالاک لەم بەشەدا نییە.', wishlistIds = new Set(), onToggleWishlist, onAdd }: Props) {
  if (loading) {
    return <div className="grid min-h-80 place-items-center rounded-[30px] border border-dashed border-black/10 bg-white"><LoaderCircle className="animate-spin text-[var(--shakh-blue)]" size={28} /></div>;
  }

  if (!products.length) {
    return (
      <div className="grid min-h-80 place-items-center rounded-[30px] border border-dashed border-black/10 bg-white px-6 text-center">
        <div>
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--shakh-bg)] text-black/35"><SearchX size={24} /></div>
          <h3 className="mt-4 text-lg font-black">{emptyTitle}</h3>
          <p className="mt-2 text-sm leading-7 text-black/45">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product) => <ProductCard key={product.id} product={product} wishlisted={wishlistIds.has(product.id)} onToggleWishlist={onToggleWishlist} onAdd={onAdd} />)}
    </div>
  );
}
