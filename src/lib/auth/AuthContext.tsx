import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { signIn, signOut, signUp, syncPendingProfile } from '@/lib/auth/auth';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  login: typeof signIn;
  register: typeof signUp;
  logout: typeof signOut;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) await syncPendingProfile(data.session.user);
    };

    void initialize();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user) void syncPendingProfile(session.user);
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    isAuthenticated: Boolean(session?.user),
    isEmailVerified: Boolean(session?.user?.email_confirmed_at),
    login: signIn,
    register: signUp,
    logout: signOut,
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
