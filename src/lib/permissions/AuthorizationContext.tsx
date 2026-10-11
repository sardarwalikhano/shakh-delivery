import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthContext';

export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'customer'
  | 'captain'
  | 'restaurant_vendor'
  | 'fashion_vendor'
  | 'supermarket_vendor'
  | 'car_dealer'
  | 'umrah_agency'
  | 'support';

type AuthorizationContextValue = {
  role: AppRole | null;
  roles: AppRole[];
  permissions: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<void>;
};

const AuthorizationContext = createContext<AuthorizationContextValue | null>(null);

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    const userId = user?.id ?? null;

    setIsLoading(true);
    setResolvedUserId(null);
    setError(null);
    setRoles([]);
    setPermissions(new Set());

    if (!userId) {
      if (currentRequestId === requestId.current) setIsLoading(false);
      return;
    }

    try {
      const roleResult = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (currentRequestId !== requestId.current) return;
      if (roleResult.error) throw roleResult.error;

      const nextRoles = (roleResult.data ?? []).map((item) => item.role as AppRole);
      if (nextRoles.length === 0) {
        // An empty result is a real authorization result only after Supabase has
        // successfully completed the query for the current authenticated user.
        setRoles([]);
        setPermissions(new Set());
        setResolvedUserId(userId);
        return;
      }

      const permissionResult = await supabase
        .from('role_permissions')
        .select('permission_code')
        .in('role', nextRoles);

      if (currentRequestId !== requestId.current) return;
      if (permissionResult.error) throw permissionResult.error;

      setRoles(nextRoles);
      setPermissions(new Set((permissionResult.data ?? []).map((item) => item.permission_code)));
      setResolvedUserId(userId);
    } catch {
      if (currentRequestId !== requestId.current) return;
      // A failed permission query must not be treated as a confirmed lack of
      // permission; show a recoverable error in RequirePermission instead of 403.
      setRoles([]);
      setPermissions(new Set());
      setError('نەتوانرا زانیاری Role و Permission لە Supabase بخوێندرێتەوە. پەیوەندیی ئینتەرنێت بپشکنە و دووبارە هەوڵ بدەوە.');
      setResolvedUserId(userId);
    } finally {
      if (currentRequestId === requestId.current) setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('user-roles:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles', filter: 'user_id=eq.' + user.id }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, user]);

  // Derive readiness from the current auth user, not only from an effect-driven
  // loading flag. This prevents a brief empty-permissions render after sign-in or
  // hard refresh from redirecting a valid user to /403 before their roles load.
  const loading = authLoading || (Boolean(user) && (isLoading || resolvedUserId !== user?.id));

  const value = useMemo<AuthorizationContextValue>(() => ({
    role: roles[0] ?? null,
    roles,
    permissions,
    loading,
    error,
    refresh,
    hasPermission: (permission) => permissions.has(permission),
  }), [error, loading, permissions, refresh, roles]);

  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization(): AuthorizationContextValue {
  const context = useContext(AuthorizationContext);
  if (!context) throw new Error('useAuthorization must be used inside AuthorizationProvider.');
  return context;
}
