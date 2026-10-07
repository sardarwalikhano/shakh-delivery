import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { useAuth } from '@/lib/auth/AuthContext';

function authErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'هەڵەیەکی نەناسراو ڕوویدا.';
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('دوو وشەی نهێنییەکە وەک یەک نین.');
      return;
    }
    setBusy(true);
    try {
      const result = await register(email.trim(), password);
      if (result.session) {
        navigate('/dashboard', { replace: true });
      } else {
        setSuccess(true);
      }
    } catch (nextError) {
      setError(authErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="دروستکردنی هەژمار" description="هەژمارێکی نوێی SHAKH Delivery دروست بکە. پاش تۆمارکردن، ئیمەیڵەکەت پشتڕاست بکەرەوە.">
        {success ? (
          <div className="space-y-5">
            <AuthSuccess>ئیمەیڵی پشتڕاستکردنەوە نێردرا. inbox ـەکەت بپشکنە و لینکەکە بکەرەوە.</AuthSuccess>
            <Link className={primaryButtonClass} to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            <AuthFeedback error={error} />
            <Field label="ئیمەیڵ">
              <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" />
            </Field>
            <Field label="وشەی نهێنی" hint="لانیکەم 8 پیت. پاش قۆناغی Auth ـدا policy ـی وردتر جێگیر دەکەین.">
              <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
            </Field>
            <Field label="دووبارەکردنەوەی وشەی نهێنی">
              <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
            </Field>
            <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'دروستکردن...' : 'دروستکردنی هەژمار'}</button>
            <p className="text-center text-sm text-black/50">هەژمارت هەیە؟ <Link className="font-bold text-[var(--shakh-blue)]" to="/login">بچۆ ژوورەوە</Link></p>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
