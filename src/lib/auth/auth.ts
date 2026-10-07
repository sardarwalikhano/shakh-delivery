import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { env } from '@/lib/config/env';
import { clearAuthStorage, getRememberMePreference, setRememberMePreference } from './storage';

export type AuthResult = {
  user: User | null;
  session: Session | null;
};

const PENDING_FULL_NAME_KEY = 'shakh.pending_full_name';

const absoluteUrl = (path: string) => new URL(path, env.publicAppUrl).toString();

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'وشەی نهێنی دەبێت لانیکەم 8 پیت بێت.';
  if (!/[a-z]/.test(password)) return 'وشەی نهێنی دەبێت لانیکەم یەک پیتی بچووک هەبێت.';
  if (!/[A-Z]/.test(password)) return 'وشەی نهێنی دەبێت لانیکەم یەک پیتی گەورە هەبێت.';
  if (!/\d/.test(password)) return 'وشەی نهێنی دەبێت لانیکەم یەک ژمارەی تێدا بێت.';
  return null;
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'هەڵەیەکی نەناسراو ڕوویدا. دووبارە هەوڵ بدەوە.';
  const message = error.message.toLowerCase();
  if (message.includes('invalid login credentials')) return 'ئیمەیڵ یان وشەی نهێنی هەڵەیە.';
  if (message.includes('email not confirmed')) return 'ئیمەیڵەکەت هێشتا پشتڕاست نەکراوەتەوە.';
  if (message.includes('user already registered') || message.includes('already been registered')) return 'ئەم ئیمەیڵە پێشتر تۆمارکراوە.';
  if (message.includes('rate limit') || message.includes('too many')) return 'ژمارەی هەوڵدان زۆر بووە. تکایە دوای کەمێک دووبارە هەوڵ بدەوە.';
  if (message.includes('password')) return 'وشەی نهێنی پێداویستییەکانی security پڕ ناکات.';
  return 'هەڵەیەکی authentication ڕوویدا. دووبارە هەوڵ بدەوە.';
}

export async function signUp(email: string, password: string, fullName: string): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();
  const passwordError = validatePassword(password);
  if (!normalizedName) throw new Error('ناوی تەواو پێویستە.');
  if (passwordError) throw new Error(passwordError);

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { full_name: normalizedName },
      emailRedirectTo: absoluteUrl('/verify-email'),
    },
  });

  if (error) throw error;

  window.sessionStorage.setItem(PENDING_FULL_NAME_KEY, normalizedName);

  if (data.user && data.session) {
    await syncPendingProfile(data.user);
  }

  return { user: data.user, session: data.session };
}

export async function signIn(email: string, password: string, rememberMe = getRememberMePreference()): Promise<AuthResult> {
  setRememberMePreference(rememberMe);
  clearAuthStorage();

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) throw error;
  if (data.user) await syncPendingProfile(data.user);
  return { user: data.user, session: data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  clearAuthStorage();
  if (error) throw error;
}

export async function signOutEverywhere(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  clearAuthStorage();
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: absoluteUrl('/reset-password'),
  });
  if (error) throw error;
}

export async function updatePassword(password: string, currentPassword?: string): Promise<void> {
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const payload = currentPassword
    ? { password, current_password: currentPassword }
    : { password };

  const { error } = await supabase.auth.updateUser(payload);
  if (error) throw error;
}

export async function resendVerification(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizedEmail,
    options: {
      emailRedirectTo: absoluteUrl('/verify-email'),
    },
  });
  if (error) throw error;
}

export async function syncPendingProfile(user: User): Promise<void> {
  const pendingName = window.sessionStorage.getItem(PENDING_FULL_NAME_KEY)?.trim();
  let fullName = pendingName;

  if (!fullName) {
    const metadataName = user.user_metadata?.full_name;
    fullName = typeof metadataName === 'string' ? metadataName.trim() : '';
  }

  if (!fullName) return;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) return;
  if (profile?.full_name && !pendingName) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email ?? null, full_name: fullName },
      { onConflict: 'id' },
    );

  if (!error) window.sessionStorage.removeItem(PENDING_FULL_NAME_KEY);
}

export function getAuthRedirect(path = '/'): string {
  return new URL(path, env.publicAppUrl).toString();
}
