import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { getMyRoleRequests, requestRole, type RoleRequest } from '@/features/role-requests/api';
import { roleLabelsKu } from '@/features/role-requests/roleLabels';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { authErrorMessage, signOutEverywhere, updatePassword, validatePassword } from '@/lib/auth/auth';
import { AuthCard, AuthPageShell, PasswordField, PasswordStrength, primaryButtonClass } from '@/features/auth/components/AuthCard';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';

export function AccountPage() {
  const { user, logout } = useAuth();
  const { role, roles } = useAuthorization();
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);

  const loadRoleRequests = useCallback(async () => {
    try { setRoleRequests(await getMyRoleRequests()); }
    catch (nextError) { setRoleError(nextError instanceof Error ? nextError.message : 'نەتوانرا داواکارییەکانی Role بخوێندرێنەوە.'); }
  }, []);

  useEffect(() => { void loadRoleRequests(); }, [loadRoleRequests]);

  const requestableRoles = useMemo(() => (Object.keys(roleLabelsKu) as typeof roles).filter((candidate) => candidate !== 'super_admin' && !roles.includes(candidate)), [roles]);
  const pendingRequestedRoles = useMemo(() => new Set(roleRequests.filter((item) => item.status === 'pending').map((item) => item.requested_role)), [roleRequests]);

  const onRequestRole = async () => {
    if (!selectedRole || selectedRole === 'super_admin' || roleBusy) return;
    setRoleBusy(true); setRoleError(null); setRoleSuccess(null);
    try {
      const request = await requestRole(selectedRole as typeof roles[number]);
      setRoleRequests((current) => [request, ...current]);
      setSelectedRole('');
      setRoleSuccess('داواکاریی Role ـەکەت نێردرا بۆ Super Admin. تا ڤەریفای نەکرێت هیچ دەسەڵاتێکی ئەو Role ـە چالاک نابێت.');
    } catch (nextError) {
      setRoleError(nextError instanceof Error ? nextError.message : 'نەتوانرا داواکاریی Role بنێردرێت.');
    } finally { setRoleBusy(false); }
  };

  const roleStatus = (status: RoleRequest['status']) => status === 'pending'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-black text-amber-700"><Clock3 size={13} /> چاوەڕوانی ڤەریفای</span>
    : status === 'approved'
      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-700"><CheckCircle2 size={13} /> پەسەندکرا</span>
      : <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-black text-red-700"><XCircle size={13} /> ڕەتکراوە</span>;
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
              <div className="text-xs font-bold text-black/40">Role ـە چالاکەکان</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.length ? roles.map((item) => <span key={item} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black/65">{roleLabelsKu[item]}</span>) : <span>{role ?? '—'}</span>}
              </div>
            </div>
            <div className="border-t border-black/[0.07] pt-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[var(--shakh-orange)]" />
                <h2 className="font-black">داواکردنی Role</h2>
              </div>
              <p className="mt-2 text-sm leading-7 text-black/45">Role ـێک هەڵبژێرە. داواکارییەکە بۆ Super Admin دەنێردرێت و تەنها دوای ڤەریفای هەموو permission ـەکانی ئەو Role ـە چالاک دەبن.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <select className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-[var(--shakh-blue)]" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} disabled={roleBusy || requestableRoles.length === 0}>
                  <option value="">Role هەڵبژێرە</option>
                  {requestableRoles.map((candidate) => <option key={candidate} value={candidate} disabled={pendingRequestedRoles.has(candidate)}>{roleLabelsKu[candidate]}{pendingRequestedRoles.has(candidate) ? ' — چاوەڕوانی ڤەریفای' : ''}</option>)}
                </select>
                <button type="button" className="min-h-12 rounded-2xl bg-[var(--shakh-navy)] px-5 text-sm font-black text-white disabled:opacity-40" disabled={!selectedRole || roleBusy} onClick={() => void onRequestRole()}>
                  {roleBusy ? 'ناردن...' : 'ناردنی داواکاری'}
                </button>
              </div>
              {roleError ? <div className="mt-3"><AuthFeedback error={roleError} /></div> : null}
              {roleSuccess ? <div className="mt-3"><AuthSuccess>{roleSuccess}</AuthSuccess></div> : null}
              <div className="mt-4 space-y-2">
                {roleRequests.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-black/[0.06] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-black">{roleLabelsKu[item.requested_role]}</span>
                      {roleStatus(item.status)}
                    </div>
                    {item.review_note ? <p className="mt-2 text-xs leading-6 text-black/45">تێبینی: {item.review_note}</p> : null}
                  </div>
                ))}
                {roleRequests.length === 0 ? <div className="rounded-2xl bg-white p-4 text-xs font-bold text-black/40">هێشتا هیچ داواکارییەکی Role نییە.</div> : null}
              </div>
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
