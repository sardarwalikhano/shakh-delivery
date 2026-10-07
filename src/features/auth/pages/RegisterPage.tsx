import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard, AuthPageShell, Field, PasswordField, PasswordStrength, inputClass, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { authErrorMessage, validatePassword, validatePhone } from '@/lib/auth/auth';
import { useAuth } from '@/lib/auth/AuthContext';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (!fullName.trim()) {
      setError('ناوی تەواو پێویستە.');
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('دوو وشەی نهێنییەکە وەک یەک نین.');
      return;
    }
    if (!acceptedTerms) {
      setError('تکایە مەرج و یاساکانی بەکارهێنان قبوڵ بکە.');
      return;
    }

    setBusy(true);
    try {
      const result = await register(email, password, fullName, phone);
      if (result.session && result.user?.email_confirmed_at) {
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
            <AuthSuccess>تۆمارکردن تەواو بوو. ئیمەیڵەکەت بپشکنە و لینکی پشتڕاستکردنەوە بکەرەوە، پاشان دەتوانیت بچیتە ناو هەژمارەکەت.</AuthSuccess>
            <Link className={primaryButtonClass} to="/login">گەڕانەوە بۆ چوونە ژوورەوە</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit} noValidate>
            <AuthFeedback error={error} />
            <Field label="ناوی تەواو">
              <input
                className={inputClass}
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="ناوی تەواوت"
                dir="auto"
              />
            </Field>
            <Field label="ژمارەی مۆبایل" hint="ژمارەکەت بۆ پەیوەندی لە کاتی گەیاندنی order ـەکان بەکاردهێنرێت.">
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+9647501234567"
                dir="ltr"
              />
            </Field>
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
            <PasswordField label="وشەی نهێنی" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordStrength password={password} />
            <PasswordField label="دووبارەکردنەوەی وشەی نهێنی" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            <label className="flex items-start gap-3 text-sm leading-6 text-black/60">
              <input
                className="mt-1 size-4 shrink-0 rounded border-black/20 accent-[var(--shakh-blue)]"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                required
              />
              <span>مەرج و یاساکانی بەکارهێنانم خوێندووەتەوە و قبوڵم کردووە.</span>
            </label>
            <button className={primaryButtonClass} disabled={busy} type="submit">
              {busy ? 'دروستکردن...' : 'دروستکردنی هەژمار'}
            </button>
            <p className="text-center text-sm text-black/50">هەژمارت هەیە؟ <Link className="font-bold text-[var(--shakh-blue)]" to="/login">بچۆ ژوورەوە</Link></p>
          </form>
        )}
      </AuthCard>
    </AuthPageShell>
  );
}
