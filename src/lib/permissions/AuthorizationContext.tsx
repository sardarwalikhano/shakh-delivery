import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  permissions: ReadonlySet<string>;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
};

const AuthorizationContext = createContext<AuthorizationContextValue | null>(null);

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAuthorization = async () => {
      setLoading(true);
      setRole(null);
      setPermissions(new Set());

      if (!user) {
        setLoading(false);
        return;
      }

      const roleResult = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleResult.error || !roleResult.data) {
        if (!cancelled) setLoading(false);
        return;
      }

      const nextRole = roleResult.data.role as AppRole;
      const permissionResult = await supabase
        .from('role_permissions')
        .select('permission_code')
        .eq('role', nextRole);

      if (!cancelled) {
        setRole(nextRole);
        setPermissions(new Set((permissionResult.data ?? []).map((item) => item.permission_code)));
        setLoading(false);
      }
    };

    void loadAuthorization();
    return () => { cancelled = true; };
  }, [user]);

  const value = useMemo<AuthorizationContextValue>(() => ({
    role,
    permissions,
    loading,
    hasPermission: (permission) => permissions.has(permission),
  }), [loading, permissions, role]);

  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization(): AuthorizationContextValue {
  const context = useContext(AuthorizationContext);
  if (!context) throw new Error('useAuthorization must be used inside AuthorizationProvider.');
  return context;
}
