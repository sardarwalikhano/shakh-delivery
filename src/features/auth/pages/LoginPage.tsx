import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { useAuth } from '@/lib/auth/AuthContext';

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const text = error.message.toLowerCase();
    if (text.includes('invalid login credentials')) return 'ئیمەیڵ یان وشەی نهێنی هەڵەیە.';
    if (text.includes('email not confirmed')) return 'ئیمەیڵەکەت هێشتا پشتڕاست نەکراوەتەوە.';
    return error.message;
  }
  return 'هەڵەیەکی نەناسراو ڕوویدا. دووبارە هەوڵ بدەوە.';
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (nextError) {
      setError(authErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="چوونە ژوورەوە" description="بۆ بەردەوامبوون لەگەڵ هەژماری SHAKH Delivery بچۆ ژوورەوە.">
        <form className="space-y-5" onSubmit={submit}>
          <AuthFeedback error={error} />
          <Field label="ئیمەیڵ">
            <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" />
          </Field>
          <Field label="وشەی نهێنی">
            <input className={inputClass} type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
          </Field>
          <div className="flex items-center justify-between gap-3 text-sm">
            <Link className="font-bold text-[var(--shakh-blue)]" to="/forgot-password">وشەی نهێنیت لەبیر کردووە؟</Link>
            <Link className="font-bold text-black/50" to="/register">هەژمارت نییە؟</Link>
          </div>
          <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'چوونەژوورەوە...' : 'چوونە ژوورەوە'}</button>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
