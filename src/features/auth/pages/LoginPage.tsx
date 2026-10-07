import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, PasswordField, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback } from '@/features/auth/components/AuthFeedback';
import { useAuth } from '@/lib/auth/AuthContext';
import { authErrorMessage } from '@/lib/auth/auth';
import { getRememberMePreference } from '@/lib/auth/storage';
import { rememberAuthRedirect, sanitizeInternalPath } from '@/lib/auth/redirect';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(getRememberMePreference());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stateFrom = (location.state as { from?: string } | null)?.from;
  const from = sanitizeInternalPath(stateFrom);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(email, password, rememberMe);
      navigate(from, { replace: true });
    } catch (nextError) {
      const message = authErrorMessage(nextError);
      setError(message);
      if (message.includes('پشتڕاست نەکراوەتەوە')) {
        rememberAuthRedirect(from);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="چوونە ژوورەوە" description="بۆ بەردەوامبوون لەگەڵ هەژماری SHAKH Delivery بچۆ ژوورەوە.">
        <form className="space-y-5" onSubmit={submit} noValidate>
          <AuthFeedback error={error} />
          <label className="block">
            <span className="mb-2 block text-sm font-bold">ئیمەیڵ</span>
            <input
              className={inputClass}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              dir="ltr"
              aria-label="ئیمەیڵ"
            />
          </label>
          <PasswordField label="وشەی نهێنی" value={password} onChange={setPassword} autoComplete="current-password" />
          <label className="flex cursor-pointer items-center gap-3 text-sm text-black/60">
            <input
              className="size-4 rounded border-black/20 accent-[var(--shakh-blue)]"
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>لەسەر ئەم ئامێرە بمێنەوە</span>
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <Link className="font-bold text-[var(--shakh-blue)]" to="/forgot-password">وشەی نهێنیت لەبیر کردووە؟</Link>
            <Link className="font-bold text-black/50" to="/register">هەژمارت نییە؟</Link>
          </div>
          <button className={primaryButtonClass} disabled={busy} type="submit">
            {busy ? 'چوونەژوورەوە...' : 'چوونە ژوورەوە'}
          </button>
        </form>
      </AuthCard>
    </AuthPageShell>
  );
}
