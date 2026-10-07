import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { rememberAuthRedirect, sanitizeInternalPath } from '@/lib/auth/redirect';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated, isEmailVerified } = useAuth();
  const location = useLocation();
  const currentPath = sanitizeInternalPath(`${location.pathname}${location.search}${location.hash}`);

  if (loading) {
    return <div className="grid min-h-[45dvh] place-items-center p-8 text-sm font-bold text-black/50">پشکنینی session...</div>;
  }

  if (!isAuthenticated) {
    rememberAuthRedirect(currentPath);
    return <Navigate to="/login" replace state={{ from: currentPath }} />;
  }

  if (!isEmailVerified) {
    rememberAuthRedirect(currentPath);
    return <Navigate to="/verify-email" replace state={{ from: currentPath }} />;
  }

  return children;
}
