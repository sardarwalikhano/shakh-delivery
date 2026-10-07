import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { authErrorMessage, resendVerification } from '@/lib/auth/auth';
import { consumeAuthRedirect, sanitizeInternalPath } from '@/lib/auth/redirect';
import { supabase } from '@/lib/supabase/client';

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const processSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session;
      setEmail(session?.user.email ?? '');
      const isVerified = Boolean(session?.user.email_confirmed_at);
      setVerified(isVerified);

      if (isVerified) {
        window.history.replaceState({}, document.title, '/verify-email');
        const stateFrom = (location.state as { from?: string } | null)?.from;
        const target = stateFrom ? sanitizeInternalPath(stateFrom) : consumeAuthRedirect();
        navigate(target, { replace: true });
      }
    };

    void processSession();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setEmail(session?.user.email ?? '');
      const isVerified = Boolean(session?.user.email_confirmed_at);
      setVerified(isVerified);

      if (isVerified && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
        const stateFrom = (location.state as { from?: string } | null)?.from;
        const target = stateFrom ? sanitizeInternalPath(stateFrom) : consumeAuthRedirect();
        window.history.replaceState({}, document.title, '/verify-email');
        navigate(target, { replace: true });
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [location.state, navigate]);

  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await resendVerification(email);
      setInfo('ئیمەیڵی پشتڕاستکردنەوە دووبارە نێردراوە. inbox و spam/junk ـیش بپشکنە.');
    } catch (nextError) {
      setError(authErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="پشتڕاستکردنەوەی ئیمەیڵ" description="بۆ دەستگەیشتن بە dashboard و بەشە پارێزراوەکان، سەرەتا ئیمەیڵەکەت پشتڕاست بکەرەوە.">
        <div className="space-y-5">
          {verified
            ? <AuthSuccess>ئیمەیڵەکەت پشتڕاست کراوەتەوە. لەبەر دەستگەیشتن بە بەشی داواکراو دەگەڕێیتەوە.</AuthSuccess>
            : <AuthSuccess>لینکی پشتڕاستکردنەوە بۆ ئیمەیڵەکەت نێردراوە. inbox ـەکەت بپشکنە.</AuthSuccess>}
          <AuthFeedback error={error} />
          {info ? <AuthSuccess>{info}</AuthSuccess> : null}
          {!verified ? (
            <form className="space-y-4" onSubmit={resend} noValidate>
              <Field label="ئیمەیڵ">
                <input className={inputClass} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" dir="ltr" />
              </Field>
              <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'ناردن...' : 'دووبارە ناردنی ئیمەیڵ'}</button>
            </form>
          ) : null}
          <Link className={primaryButtonClass} to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link>
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
