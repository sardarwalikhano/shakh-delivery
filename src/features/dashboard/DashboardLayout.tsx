import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, Boxes, ChevronLeft, CircleHelp, Gift, LayoutDashboard, Menu, Package, ShieldCheck, ShoppingCart, Store, Truck, Users, WalletCards, X } from 'lucide-react';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { roleLabelsKu } from '@/features/role-requests/roleLabels';
import { useAuth } from '@/lib/auth/AuthContext';

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
type NavItem = { label: string; href: string; icon: Icon; permission: string };

const navItems: NavItem[] = [
  { label: 'سەرەکی', href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { label: 'بەرهەمەکان', href: '/dashboard/products', icon: Boxes, permission: 'products.view' },
  { label: 'پۆستەکان', href: '/posts', icon: Package, permission: 'posts.view' },
  { label: 'بەڕێوەبردنی پۆستەکان', href: '/dashboard/posts/manage', icon: Package, permission: 'posts.update_own' },
  { label: 'شێر و قازانج', href: '/dashboard/referral-wallet', icon: Gift, permission: 'posts.view' },
  { label: 'داواکاریی جل‌وبەرگ', href: '/post-orders', icon: ShoppingCart, permission: 'posts.view' },
  { label: 'فرۆشگا', href: '/dashboard/store', icon: Store, permission: 'vendors.view' },
  { label: 'داواکارییەکان', href: '/dashboard/orders', icon: ShoppingCart, permission: 'orders.view' },
  { label: 'گەیاندنەکان', href: '/dashboard/deliveries', icon: Truck, permission: 'deliveries.view' },
  { label: 'پارەدان', href: '/dashboard/payments', icon: WalletCards, permission: 'payments.view' },
  { label: 'بەکارهێنەران', href: '/dashboard/users', icon: Users, permission: 'users.view' },
  { label: 'ڕاپۆرتەکان', href: '/dashboard/reports', icon: BarChart3, permission: 'reports.view' },
  { label: 'ئاگادارکردنەوەکان', href: '/dashboard/notifications', icon: Bell, permission: 'notifications.view_own' },
  { label: 'پشتیوانی', href: '/dashboard/support', icon: CircleHelp, permission: 'support.manage' },
  { label: 'داواکارییەکانی Role', href: '/dashboard/role-requests', icon: ShieldCheck, permission: 'role_requests.review' },
  { label: 'Audit Logs', href: '/dashboard/audit', icon: ShieldCheck, permission: 'audit.view' },
];

export function DashboardLayout() {
  const { roles, permissions } = useAuthorization();
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const displayRole = roles.find((item) => item !== 'customer') ?? roles[0] ?? null;
  const visibleItems = navItems.filter((item) => permissions.has(item.permission));

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const renderNavigation = (mobile = false) => (
    <>
      <div className="rounded-[22px] bg-[var(--shakh-navy)] p-4 text-white shadow-[0_10px_24px_rgba(16,34,61,.14)] ring-1 ring-white/5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-[15px] border border-white/10 bg-white/[0.08] text-lg font-black">S</div>
          <div className="min-w-0">
            <div className="truncate font-black">SHAKH Delivery</div>
            <div className="mt-0.5 truncate text-xs font-medium text-white/55">{displayRole ? roleLabelsKu[displayRole] ?? displayRole : '...'}</div>
          </div>
          {mobile ? <button type="button" onClick={() => setMenuOpen(false)} className="ms-auto grid size-10 place-items-center rounded-xl text-white/75 hover:bg-white/10" aria-label="داخستنی مینۆ"><X size={20} /></button> : null}
        </div>
        {user?.email ? <div className="mt-3 truncate text-xs text-white/60" dir="ltr">{user.email}</div> : null}
      </div>
      <nav className="mt-5 space-y-1.5" aria-label="Dashboard navigation">
        {visibleItems.map((item) => (
          <NavLink key={item.href} to={item.href} end={item.href === '/dashboard'} onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `group flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${isActive ? 'border-[var(--shakh-blue)]/10 bg-[var(--shakh-blue)]/[0.07] text-[var(--shakh-blue)] shadow-[inset_-3px_0_0_var(--shakh-blue)]' : 'border-transparent text-[var(--shakh-muted)] hover:border-[var(--shakh-border)] hover:bg-[var(--shakh-surface-soft)] hover:text-[var(--shakh-ink)]'}`}>
            <item.icon size={18} strokeWidth={2.2} />
            <span className="min-w-0 flex-1">{item.label}</span>
            <ChevronLeft className="opacity-40" size={15} />
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--shakh-bg)]">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1600px]">
        <aside className="sticky top-[72px] hidden h-[calc(100dvh-72px)] w-[17.5rem] shrink-0 self-start overflow-y-auto border-e border-[var(--shakh-border)] bg-white p-4 lg:block lg:p-5">
          {renderNavigation()}
        </aside>
        {menuOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setMenuOpen(false)} aria-label="داخستنی مینۆ" />
            <aside id="dashboard-mobile-menu" role="dialog" aria-modal="true" aria-label="پێڕستی داشبۆرد" className="absolute inset-y-0 end-0 w-[min(86vw,20rem)] overflow-y-auto border-s border-[var(--shakh-border)] bg-white p-4 shadow-2xl">
              {renderNavigation(true)}
            </aside>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 p-3 sm:p-5 lg:p-7">
          <div className="mx-auto max-w-[1320px]">
            <button type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="dashboard-mobile-menu" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--shakh-border)] bg-white px-4 text-sm font-bold text-[var(--shakh-ink)] shadow-[var(--shakh-shadow-sm)] lg:hidden">
              <Menu size={18} /> مینۆی داشبۆرد
            </button>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
