import { Bell, Heart, Menu, Search, ShoppingBag, UserRound, LogOut, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useNotifications } from '@/features/notifications/hooks/NotificationContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';

type AppShellProps = { children: ReactNode };

const mobileLinks = [
  { label: 'سەرەکی', href: '/' },
  { label: 'گەڕان و بازاڕ', href: '/search' },
  { label: 'پۆستەکان', href: '/posts' },
  { label: 'داواکارییەکان', href: '/orders' },
  { label: 'هەژمار', href: '/account' },
];

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { hasPermission } = useAuthorization();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const onLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-[var(--shakh-bg)] text-[var(--shakh-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--shakh-border)]/80 bg-white/90 shadow-[0_2px_12px_rgba(16,34,61,.025)] backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-3 sm:h-[72px] sm:px-6">
          <button type="button" onClick={() => setMobileMenuOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl text-black/65 hover:bg-black/[0.05] lg:hidden" aria-label="کردنەوەی مینۆ" aria-expanded={mobileMenuOpen}>
            <Menu size={21} />
          </button>
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex min-w-0 items-center gap-2" aria-label="SHAKH Delivery home">
            <span className="grid size-10 shrink-0 place-items-center rounded-[15px] bg-[var(--shakh-navy)] text-sm font-black text-white shadow-[0_5px_14px_rgba(16,34,61,.2)] ring-1 ring-white/10">S</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-black tracking-[.08em]">SHAKH</div>
              <div className="truncate text-[11px] font-medium text-[var(--shakh-muted)]">Delivery</div>
            </div>
          </Link>

          <nav className="ms-auto flex items-center gap-1 sm:gap-1.5" aria-label="Main navigation">
            <Link className="hidden rounded-xl px-3 py-2 text-sm font-bold text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)] sm:inline-flex" to="/search">گەڕان</Link>
            {isAuthenticated && hasPermission("posts.create") ? <Link className="hidden rounded-xl bg-[var(--shakh-orange)]/10 px-3.5 py-2 text-sm font-black text-[var(--shakh-orange)] transition hover:bg-[var(--shakh-orange)]/15 md:inline-flex" to="/dashboard/posts/new">پۆستی نوێ</Link> : null}
            <Link className="grid size-10 place-items-center rounded-xl text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)]" to="/search" aria-label="گەڕان"><Search size={20} /></Link>
            {isAuthenticated ? (
              <>
                <Link className="relative grid size-10 place-items-center rounded-xl text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)]" to="/notifications" aria-label="ئاگادارکردنەوەکان">
                  <Bell size={20} />
                  {unreadCount > 0 ? <span className="absolute -end-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--shakh-orange)] px-1 text-center text-[9px] font-black leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
                </Link>
                <Link className="hidden size-10 items-center justify-center rounded-xl text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)] sm:inline-flex" to="/wishlist" aria-label="دڵخوازەکان"><Heart size={20} /></Link>
                <Link className="grid size-10 place-items-center rounded-xl text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)]" to="/cart" aria-label="سەبەتە"><ShoppingBag size={20} /></Link>
                <Link className="hidden max-w-44 truncate rounded-xl border border-[var(--shakh-border)] px-3 py-2 text-xs font-bold text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] lg:inline-flex" to="/account" dir="ltr">{user?.email}</Link>
                <button className="hidden size-10 items-center justify-center rounded-xl text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)] sm:inline-flex" onClick={() => void onLogout()} aria-label="دەرچوون"><LogOut size={19} /></button>
              </>
            ) : (
              <Link className="grid size-10 place-items-center rounded-xl text-[var(--shakh-muted)] transition hover:bg-[var(--shakh-bg)] hover:text-[var(--shakh-ink)]" to="/login" aria-label="چوونە ژوورەوە"><UserRound size={20} /></Link>
            )}
          </nav>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setMobileMenuOpen(false)} aria-label="داخستنی مینۆ" />
          <aside role="dialog" aria-modal="true" aria-label="مینۆی سەرەکی" className="absolute inset-y-0 start-0 flex w-[min(88vw,22rem)] flex-col overflow-y-auto border-e border-[var(--shakh-border)] bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/5 pb-4">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[15px] bg-[var(--shakh-navy)] font-black text-white shadow-[0_5px_14px_rgba(16,34,61,.18)]">S</span>
                <span><span className="block font-black">SHAKH</span><span className="block text-xs text-black/45">Delivery</span></span>
              </Link>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="grid size-10 place-items-center rounded-xl hover:bg-black/5" aria-label="داخستن"><X size={20} /></button>
            </div>
            {isAuthenticated && user?.email ? <div className="my-4 truncate rounded-xl bg-[#f5f7fb] p-3 text-xs text-black/60" dir="ltr">{user.email}</div> : null}
            <nav className="mt-3 space-y-1" aria-label="مینۆی مۆبایل">
              {mobileLinks.filter((item) => item.href !== '/orders' || isAuthenticated).map((item) => (
                <Link key={item.href} to={item.href} onClick={() => setMobileMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-black/70 hover:bg-[var(--shakh-orange)]/10 hover:text-[var(--shakh-orange)]">{item.label}</Link>
              ))}
              {isAuthenticated ? (
                <>
                  <Link to="/wishlist" onClick={() => setMobileMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-black/70 hover:bg-black/5">دڵخوازەکان</Link>
                  <Link to="/notifications" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-black/70 hover:bg-black/5"><span>ئاگادارکردنەوەکان</span>{unreadCount > 0 ? <span className="rounded-full bg-[var(--shakh-orange)] px-2 py-0.5 text-xs text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}</Link>
                  {hasPermission('posts.create') ? <Link to="/dashboard/posts/new" onClick={() => setMobileMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-[var(--shakh-orange)] hover:bg-[var(--shakh-orange)]/10">پۆستی نوێ</Link> : null}
                  <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-bold text-black/70 hover:bg-black/5">داشبۆرد</Link>
                  <button type="button" onClick={() => void onLogout()} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-start text-sm font-bold text-black/65 hover:bg-black/5"><LogOut size={18} /> دەرچوون</button>
                </>
              ) : <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="mt-3 block rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-center text-sm font-bold text-white">چوونە ژوورەوە / خۆتۆمارکردن</Link>}
            </nav>
          </aside>
        </div>
      ) : null}

      <main className="min-h-[calc(100dvh-12rem)]">{children}</main>

      <footer className="mt-6 border-t border-[var(--shakh-border)] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-[var(--shakh-muted)] sm:px-6 sm:py-10">
          <div className="font-black text-[var(--shakh-ink)]">SHAKH Delivery</div>
          <div className="mt-2">پلاتفۆڕمی Kurdish-first ـی SHAKH Delivery؛ data و دەسەڵاتەکان لە Supabase ـی تایبەتی ئەم پڕۆژەیەن.</div>
        </div>
      </footer>
    </div>
  );
}
