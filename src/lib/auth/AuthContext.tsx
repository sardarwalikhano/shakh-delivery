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
  isPasswordRecovery: boolean;
  login: typeof signIn;
  register: typeof signUp;
  logout: typeof signOut;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;

    // Subscribe before reading the stored session. Supabase emits INITIAL_SESSION
    // after its auth storage has been initialized; that event is the authoritative
    // startup state and avoids a late getSession() result overwriting a newer event.
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      authEventReceived = true;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
      setLoading(false);
    });

    // Fallback for an initialization failure so protected routes do not stay loading
    // forever. Ignore this result once Supabase has delivered any auth state event.
    void supabase.auth.getSession()
      .then(({ data: sessionData }) => {
        if (!mounted || authEventReceived) return;
        setSession(sessionData.session);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted || authEventReceived) return;
        setSession(null);
        setLoading(false);
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
    isPasswordRecovery,
    login: signIn,
    register: signUp,
    logout: signOut,
  }), [isPasswordRecovery, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

