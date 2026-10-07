import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="grid min-h-[45dvh] place-items-center p-8 text-sm font-bold text-black/50">پشکنینی session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  return children;
}
