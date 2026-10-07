import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthContext';

export type AppRole =
  | 'super_admin'
  | 'admin'
  | 'customer'
  | 'captain'
  | 'restaurant_vendor'
  | 'fashion_vendor'
  | 'car_dealer'
  | 'umrah_agency'
  | 'support';

type AuthorizationContextValue = {
  role: AppRole | null;
  roles: AppRole[];
  permissions: ReadonlySet<string>;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<void>;
};

const AuthorizationContext = createContext<AuthorizationContextValue | null>(null);

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRoles([]);
    setPermissions(new Set());
    if (!user) { setLoading(false); return; }

    const roleResult = await supabase.from('user_roles').select('role').eq('user_id', user.id).order('created_at', { ascending: true });
    if (roleResult.error) { setLoading(false); return; }

    const nextRoles = (roleResult.data ?? []).map((item) => item.role as AppRole);
    if (nextRoles.length === 0) { setLoading(false); return; }

    const permissionResult = await supabase.from('role_permissions').select('permission_code').in('role', nextRoles);
    setRoles(nextRoles);
    setPermissions(new Set((permissionResult.data ?? []).map((item) => item.permission_code)));
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('user-roles:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles', filter: 'user_id=eq.' + user.id }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, user]);

  const value = useMemo<AuthorizationContextValue>(() => ({
    role: roles[0] ?? null, roles, permissions, loading, refresh, hasPermission: (permission) => permissions.has(permission),
  }), [loading, permissions, refresh, roles]);

  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization(): AuthorizationContextValue {
  const context = useContext(AuthorizationContext);
  if (!context) throw new Error('useAuthorization must be used inside AuthorizationProvider.');
  return context;
}