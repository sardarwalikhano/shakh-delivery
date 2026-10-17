import { LoaderCircle, SearchX } from 'lucide-react';
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
    return (
      <section aria-label="بارکردنی بەرهەمەکان">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[var(--shakh-muted)]" role="status">
          <LoaderCircle className="animate-spin text-[var(--shakh-blue)]" size={15} />
          بارکردنی بەرهەمەکان...
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} aria-hidden="true" className="overflow-hidden rounded-[1.4rem] border border-[var(--shakh-border)] bg-white p-0 shadow-[var(--shakh-shadow-sm)]">
              <div className="aspect-[4/4] animate-pulse bg-[var(--shakh-surface-soft)]" />
              <div className="space-y-3 p-3 sm:p-4">
                <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
                <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
                <div className="mt-4 h-8 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!products.length) {
    return (
      <div className="grid min-h-72 place-items-center rounded-[1.6rem] border border-dashed border-[var(--shakh-border)] bg-white px-6 py-10 text-center">
        <div className="max-w-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--shakh-blue)]/[0.07] text-[var(--shakh-blue)]"><SearchX size={24} /></div>
          <h3 className="mt-4 text-lg font-black text-[var(--shakh-ink)]">{emptyTitle}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--shakh-muted)]">{emptyText}</p>
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
