import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { loading, hasPermission } = useAuthorization();
  const location = useLocation();

  if (loading) {
    return <div className="grid min-h-[45dvh] place-items-center p-8 text-sm font-bold text-black/50">پشکنینی دەسەڵات...</div>;
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/403" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  return children;
}
