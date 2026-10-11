import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { loading, error, refresh, hasPermission } = useAuthorization();
  const location = useLocation();

  if (loading) {
    return <div className="grid min-h-[45dvh] place-items-center p-8 text-sm font-bold text-black/50">پشکنینی دەسەڵات...</div>;
  }

  if (error) {
    return (
      <section className="grid min-h-[45dvh] place-items-center px-4 py-10">
        <div role="alert" className="w-full max-w-lg rounded-3xl border border-amber-500/20 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-black text-[var(--shakh-ink)]">نەتوانرا دەسەڵاتەکان پشتڕاست بکرێنەوە</h1>
          <p className="mt-3 text-sm leading-7 text-black/55">{error}</p>
          <button
            type="button"
            onClick={() => { void refresh(); }}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white hover:opacity-90"
          >
            دووبارە هەوڵ بدەوە
          </button>
        </div>
      </section>
    );
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/403" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  return children;
}
