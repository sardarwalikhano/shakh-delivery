import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, PasswordField, PasswordStrength, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { authErrorMessage, signOutEverywhere, updatePassword, validatePassword } from '@/lib/auth/auth';
import { supabase } from '@/lib/supabase/client';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setReady(Boolean(data.session));
      setChecked(true);
      if (data.session) window.history.replaceState({}, document.title, '/reset-password');
    };

    void checkRecoverySession();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setReady(Boolean(session));
        setChecked(true);
        if (event === 'PASSWORD_RECOVERY' && session) {
          window.history.replaceState({}, document.title, '/reset-password');
        }
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('دوو وشەی نهێنییەکە وەک یەک نین.');
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      await signOutEverywhere();
      setSuccess(true);
    } catch (nextError) {
      setError(authErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  if (!checked && !success) {
    return <AuthPageShell><div className="mx-auto max-w-md text-center text-sm font-bold text-black/50">پشکنینی لینکی reset...</div></AuthPageShell>;
  }

  return (
    <AuthPageShell>
      <AuthCard title="دانانی وشەی نهێنیی نوێ" description="وشەی نهێنییەکی نوێ و بەهێز دابنێ.">
        {success ? (
          <div className="space-y-5">
            <AuthSuccess>وشەی نهێنیت بە سەرکەوتوویی نوێکرایەوە و session ـەکانت داخراون.</AuthSuccess>
            <button className={primaryButtonClass} onClick={() => navigate('/login', { replace: true })}>چوونە ژوورەوە</button>
          </div>
        ) : !ready ? (
          <div className="space-y-5">
            <AuthFeedback error="ئەم لینکی reset ـە بەردەست نییە یان session ـی reset نەدروست بوو." />
            <Link className={primaryButtonClass} to="/forgot-password">داوای لینکی نوێ بکە</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit} noValidate>
            <AuthFeedback error={error} />
            <PasswordField label="وشەی نهێنیی نوێ" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordStrength password={password} />
            <PasswordField label="دووبارەکردنەوە" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'نوێکردنەوە...' : 'نوێکردنەوەی وشەی نهێنی'}</button>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
