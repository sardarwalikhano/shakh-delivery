import { Bell, Heart, Search, ShoppingBag, UserRound, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useNotifications } from '@/features/notifications/hooks/NotificationContext';
  import { useAuthorization } from '@/lib/permissions/AuthorizationContext';

type AppShellProps = { children: ReactNode };

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { hasPermission } = useAuthorization();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-[var(--shakh-bg)] text-[var(--shakh-ink)]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="SHAKH Delivery home">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-sm font-black text-white shadow-lg shadow-black/10">S</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-black tracking-wide">SHAKH</div>
              <div className="truncate text-[11px] text-black/45">Delivery</div>
            </div>
          </Link>

          <nav className="ms-auto flex items-center gap-1" aria-label="Main navigation">
            <Link className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-black/60 hover:bg-black/[0.04] sm:inline-flex" to="/search">گەڕان</Link>
            {isAuthenticated && hasPermission("posts.create") ? <Link className="hidden rounded-xl px-3 py-2 text-sm font-black text-[var(--shakh-orange)] hover:bg-[var(--shakh-orange)]/10 md:inline-flex" to="/dashboard/posts/new">پۆستی نوێ</Link> : null}
            <Link className="rounded-xl p-2 text-black/60 hover:bg-black/[0.04]" to="/search" aria-label="گەڕان"><Search size={20} /></Link>
            {isAuthenticated ? (
              <>
                <Link className="relative rounded-xl p-2 text-black/60 hover:bg-black/[0.04]" to="/notifications" aria-label="ئاگادارکردنەوەکان">
                  <Bell size={20} />
                  {unreadCount > 0 ? <span className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--shakh-orange)] px-1 text-center text-[9px] font-black leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
                </Link>
                <Link className="rounded-xl p-2 text-black/60 hover:bg-black/[0.04]" to="/wishlist" aria-label="دڵخوازەکان"><Heart size={20} /></Link>
                <Link className="rounded-xl p-2 text-black/60 hover:bg-black/[0.04]" to="/cart" aria-label="سەبەتە"><ShoppingBag size={20} /></Link>
                <Link className="hidden max-w-40 truncate rounded-xl px-3 py-2 text-xs font-bold text-black/55 hover:bg-black/[0.04] lg:inline-flex" to="/account" dir="ltr">{user?.email}</Link>
                <button className="rounded-xl p-2 text-black/60 hover:bg-black/[0.04]" onClick={() => void onLogout()} aria-label="دەرچوون"><LogOut size={19} /></button>
              </>
            ) : (
              <Link className="rounded-xl p-2 text-black/60 hover:bg-black/[0.04]" to="/login" aria-label="چوونە ژوورەوە"><UserRound size={20} /></Link>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-black/45 sm:px-6">
          <div className="font-black text-black/70">SHAKH Delivery</div>
          <div className="mt-2">پلاتفۆڕمی Kurdish-first ـی SHAKH Delivery؛ data و دەسەڵاتەکان لە Supabase ـی تایبەتی ئەم پڕۆژەیەن.</div>
        </div>
      </footer>
    </div>
  );
}
