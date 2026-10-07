import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { AuthCard, AuthPageShell, primaryButtonClass } from '@/features/auth/components/AuthCard';

export function AccountPage() {
  const { user, logout } = useAuth();
  const { role } = useAuthorization();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AuthPageShell>
      <AuthCard title="هەژمارەکەت" description="ئەم لاپەڕەیە بە شێوەی سەلامەت بە session ـی Supabase پارێزراوە.">
        <div className="space-y-4">
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
          <button className={primaryButtonClass} onClick={onLogout}>دەرچوون</button>
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
