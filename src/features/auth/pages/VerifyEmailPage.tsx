import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { resendVerification } from '@/lib/auth/auth';
import { supabase } from '@/lib/supabase/client';

export function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const userEmail = data.session?.user.email ?? '';
      setEmail(userEmail);
      setVerified(Boolean(data.session?.user.email_confirmed_at));
    });
  }, []);

  const resend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resendVerification(email.trim());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'دووبارە ناردن سەرنەکەوت.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="پشتڕاستکردنەوەی ئیمەیڵ" description="ئیمەیڵەکەت پشتڕاست بکەرەوە تا هەژمارەکەت بتوانێت بە شێوەی production بەکاربهێنرێت.">
        <div className="space-y-5">
          {verified ? <AuthSuccess>ئیمەیڵەکەت پشتڕاست کراوەتەوە.</AuthSuccess> : <AuthSuccess>لینکی پشتڕاستکردنەوە بۆ ئیمەیڵەکەت نێردراوە. inbox ـەکەت بپشکنە.</AuthSuccess>}
          <AuthFeedback error={error} />
          <form className="space-y-4" onSubmit={resend}>
            <Field label="ئیمەیڵ">
              <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" />
            </Field>
            {!verified ? <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'ناردن...' : 'دووبارە ناردنی ئیمەیڵ'}</button> : null}
          </form>
          <Link className={primaryButtonClass} to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link>
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
