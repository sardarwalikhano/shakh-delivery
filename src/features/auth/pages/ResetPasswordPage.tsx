import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { supabase } from '@/lib/supabase/client';
import { updatePassword } from '@/lib/auth/auth';

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
    void supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
      setChecked(true);
    });
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('دوو وشەی نهێنییەکە وەک یەک نین.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      await supabase.auth.signOut({ scope: 'local' });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نوێکردنەوەی وشەی نهێنی سەرنەکەوت.');
    } finally {
      setBusy(false);
    }
  };

  if (!checked && !success) {
    return <AuthPageShell><div className="mx-auto max-w-md text-center text-sm font-bold text-black/50">پشکنینی لینکی reset...</div></AuthPageShell>;
  }

  return (
    <AuthPageShell>
      <AuthCard title="دانانی وشەی نهێنیی نوێ" description="وشەی نهێنیی نوێ دابنێ بۆ ئەوەی بتوانیت دووبارە بچیتە ژوورەوە.">
        {success ? (
          <div className="space-y-5">
            <AuthSuccess>وشەی نهێنیت بە سەرکەوتوویی نوێکرایەوە.</AuthSuccess>
            <button className={primaryButtonClass} onClick={() => navigate('/login', { replace: true })}>چوونە ژوورەوە</button>
          </div>
        ) : !ready ? (
          <div className="space-y-5">
            <AuthFeedback error="ئەم لینکی reset ـە بەردەست نییە یان session ـی reset نەدروست بوو." />
            <Link className={primaryButtonClass} to="/forgot-password">داوای لینکی نوێ بکە</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            <AuthFeedback error={error} />
            <Field label="وشەی نهێنیی نوێ">
              <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
            </Field>
            <Field label="دووبارەکردنەوە">
              <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" dir="ltr" />
            </Field>
            <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'نوێکردنەوە...' : 'نوێکردنەوەی وشەی نهێنی'}</button>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
