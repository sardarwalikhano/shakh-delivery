import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { sendPasswordReset } from '@/lib/auth/auth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
      setSuccess(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ناردنی لینک سەرنەکەوت.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="گەڕانەوەی وشەی نهێنی" description="ئیمەیڵەکەت بنووسە تا لینکێکی نوێکردنەوە بۆت بنێردرێت.">
        {success ? (
          <div className="space-y-5">
            <AuthSuccess>ئەگەر ئەم ئیمەیڵە بە هەژمارێک پەیوەندیدار بێت، لینکێکی reset ـی بۆ نێردراوە. spam/junk ـیش بپشکنە.</AuthSuccess>
            <Link className={primaryButtonClass} to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            <AuthFeedback error={error} />
            <Field label="ئیمەیڵ">
              <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" />
            </Field>
            <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'ناردن...' : 'ناردنی لینکی نوێکردنەوە'}</button>
            <p className="text-center text-sm"><Link className="font-bold text-[var(--shakh-blue)]" to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link></p>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
