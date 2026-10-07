import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-xl place-items-center px-6 py-20 text-center">
      <div>
        <div className="text-7xl font-black tracking-tighter text-[var(--shakh-navy)]">404</div>
        <h1 className="mt-4 text-2xl font-black">لاپەڕەکە نەدۆزرایەوە</h1>
        <p className="mt-3 text-black/50">لینکەکە هەڵەیە یان ئەم بەشە هێشتا دروست نەکراوە.</p>
        <Link className="mt-6 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 font-bold text-white" to="/">گەڕانەوە بۆ سەرەکی</Link>
      </div>
    </div>
  );
}
