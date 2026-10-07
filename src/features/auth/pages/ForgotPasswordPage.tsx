import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { authErrorMessage, sendPasswordReset } from '@/lib/auth/auth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSuccess(true);
    } catch (nextError) {
      setError(authErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="گەڕانەوەی وشەی نهێنی" description="ئیمەیڵەکەت بنووسە تا ئەگەر هەژمارەکە هەبێت لینکێکی reset بۆت بنێردرێت.">
        {success ? (
          <div className="space-y-5">
            <AuthSuccess>ئەگەر ئەم ئیمەیڵە پەیوەندیدار بە هەژمارێک بێت، لینکێکی نوێکردنەوەی وشەی نهێنی بۆ نێردراوە. inbox و spam/junk ـیش بپشکنە.</AuthSuccess>
            <Link className={primaryButtonClass} to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit} noValidate>
            <AuthFeedback error={error} />
            <Field label="ئیمەیڵ">
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
              />
            </Field>
            <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'ناردن...' : 'ناردنی لینکی نوێکردنەوە'}</button>
            <p className="text-center text-sm"><Link className="font-bold text-[var(--shakh-blue)]" to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link></p>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
