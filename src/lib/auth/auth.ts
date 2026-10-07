import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { env } from '@/lib/config/env';

export type AuthResult = {
  user: User | null;
  session: Session | null;
};

const absoluteUrl = (path: string) => new URL(path, env.publicAppUrl).toString();

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: absoluteUrl('/verify-email'),
    },
  });

  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: data.user, session: data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: absoluteUrl('/reset-password'),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function resendVerification(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: absoluteUrl('/verify-email'),
    },
  });
  if (error) throw error;
}

export function getAuthRedirect(path = '/'): string {
  return new URL(path, env.publicAppUrl).toString();
}
