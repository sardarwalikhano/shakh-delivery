import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { authErrorMessage, signOutEverywhere, updatePassword, validatePassword } from '@/lib/auth/auth';
import { AuthCard, AuthPageShell, PasswordField, PasswordStrength, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';

export function AccountPage() {
  const { user, logout } = useAuth();
  const { role } = useAuthorization();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const onChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(false);

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('دوو وشەی نهێنییەکە وەک یەک نین.');
      return;
    }

    setBusy(true);
    try {
      await updatePassword(newPassword, currentPassword);
      await signOutEverywhere();
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (nextError) {
      setError(authErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageShell>
      <AuthCard title="هەژمارەکەت" description="زانیاری هەژمار و پاراستنی password ـەکەت بە session ـی Supabase بەڕێوەدەبرێت.">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
              <div className="text-xs font-bold text-black/40">ئیمەیڵ</div>
              <div className="mt-1 break-all font-bold" dir="ltr">{user?.email ?? '—'}</div>
            </div>
            <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
              <div className="text-xs font-bold text-black/40">Role</div>
              <div className="mt-1 font-bold" dir="ltr">{role ?? '—'}</div>
            </div>
            <div className="rounded-2xl bg-[var(--shakh-bg)] p-4">
              <div className="text-xs font-bold text-black/40">دۆخی پشتڕاستکردنەوە</div>
              <div className="mt-1 font-bold">{user?.email_confirmed_at ? 'پشتڕاستکراوە' : 'پشتڕاست نەکراوەتەوە'}</div>
            </div>
          </div>

          <div className="border-t border-black/[0.07] pt-6">
            <h2 className="text-lg font-black">گۆڕینی وشەی نهێنی</h2>
            <p className="mt-2 text-sm leading-6 text-black/45">وشەی نهێنیی ئێستا بنووسە، پاشان وشەی نوێ دابنێ. دوای گۆڕان، session ـەکان داخراون و پێویستە دووبارە بچیتە ژوورەوە.</p>
            <form className="mt-5 space-y-5" onSubmit={onChangePassword} noValidate>
              <AuthFeedback error={error} />
              {success ? <AuthSuccess>وشەی نهێنی نوێکرایەوە.</AuthSuccess> : null}
              <PasswordField label="وشەی نهێنیی ئێستا" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
              <PasswordField label="وشەی نهێنیی نوێ" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
              <PasswordStrength password={newPassword} />
              <PasswordField label="دووبارەکردنەوەی وشەی نوێ" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
              <button className={primaryButtonClass} disabled={busy} type="submit">{busy ? 'گۆڕین...' : 'گۆڕینی وشەی نهێنی'}</button>
            </form>
          </div>

          <button className={primaryButtonClass} onClick={onLogout}>دەرچوون</button>
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
