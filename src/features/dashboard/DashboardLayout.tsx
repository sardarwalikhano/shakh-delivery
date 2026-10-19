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
  { label: 'جزدانی پریپەید', href: '/dashboard/wallet', icon: WalletCards, permission: 'wallets.view_own' },
  { label: 'زیادکردنی باڵانسی سوپەر ئەدمین', href: '/dashboard/wallet/admin-credit', icon: WalletCards, permission: 'wallets.manage' },
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
      <div className="shakh-dashboard__brand p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--shakh-orange)] text-lg font-black text-[var(--shakh-navy)]">S</div>
          <div className="min-w-0">
            <div className="truncate font-black">SHAKH Delivery</div>
            <div className="mt-0.5 truncate text-xs text-white/50">{displayRole ? roleLabelsKu[displayRole] ?? displayRole : '...'}</div>
          </div>
          {mobile ? <button type="button" onClick={() => setMenuOpen(false)} className="ms-auto grid size-10 place-items-center rounded-xl text-white/75 hover:bg-white/10" aria-label="داخستنی مینۆ"><X size={20} /></button> : null}
        </div>
        {user?.email ? <div className="mt-3 truncate text-xs text-white/60" dir="ltr">{user.email}</div> : null}
      </div>
      <nav className="mt-4 space-y-1" aria-label="Dashboard navigation">
        {visibleItems.map((item) => (
          <NavLink key={item.href} to={item.href} end={item.href === '/dashboard'} onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `shakh-dashboard__navlink group flex items-center gap-3 px-3.5 py-2.5 text-sm font-bold ${isActive ? 'text-[var(--shakh-orange)]' : 'text-black/60 hover:bg-black/[0.035] hover:text-[var(--shakh-ink)]'}`}>
            <item.icon size={18} strokeWidth={2.2} />
            <span className="min-w-0 flex-1">{item.label}</span>
            <ChevronLeft className="opacity-40" size={15} />
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <div className="shakh-dashboard shakh-dashboard-v3 min-h-[calc(100dvh-4rem)]">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1600px]">
        <aside className="shakh-dashboard__sidebar sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 self-start overflow-y-auto p-4 lg:block lg:p-5">
          {renderNavigation()}
        </aside>
        {menuOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setMenuOpen(false)} aria-label="داخستنی مینۆ" />
            <aside id="dashboard-mobile-menu" role="dialog" aria-modal="true" aria-label="پێڕستی داشبۆرد" className="absolute inset-y-0 end-0 w-[min(86vw,20rem)] overflow-y-auto bg-white p-4 shadow-2xl">
              {renderNavigation(true)}
            </aside>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <button type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="dashboard-mobile-menu" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold shadow-sm ring-1 ring-black/5 lg:hidden">
              <Menu size={18} /> مینۆی داشبۆرد
            </button>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
