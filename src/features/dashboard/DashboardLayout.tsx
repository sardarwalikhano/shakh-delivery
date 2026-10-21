import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, Boxes, ChevronLeft, CircleHelp, Gift, LayoutDashboard, Menu, Package, ShieldCheck, ShoppingCart, Store, Truck, Users, WalletCards, X } from 'lucide-react';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { roleLabelsKu } from '@/features/role-requests/roleLabels';
import { useAuth } from '@/lib/auth/AuthContext';

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
type NavSection = 'overview' | 'marketplace' | 'operations' | 'finance' | 'management';
type NavItem = { label: string; href: string; icon: Icon; permission: string; section: NavSection };

const navItems: NavItem[] = [
  { label: 'سەرەکی', href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view', section: 'overview' },
  { label: 'بەرهەمەکان', href: '/dashboard/products', icon: Boxes, permission: 'products.manage', section: 'marketplace' },
  { label: 'پۆستەکان', href: '/posts', icon: Package, permission: 'posts.view', section: 'marketplace' },
  { label: 'بەڕێوەبردنی پۆستەکان', href: '/dashboard/posts/manage', icon: Package, permission: 'posts.update_own', section: 'marketplace' },
  { label: 'شێر و قازانج', href: '/dashboard/referral-wallet', icon: Gift, permission: 'posts.view', section: 'finance' },
  { label: 'جزدان و داواکاریی زیادکردنی باڵانس', href: '/dashboard/wallet', icon: WalletCards, permission: 'wallets.view_own', section: 'finance' },
  { label: 'زیادکردنی باڵانسی سوپەر ئەدمین', href: '/dashboard/wallet/admin-credit', icon: WalletCards, permission: 'wallets.manage', section: 'finance' },
  { label: 'داواکاریی جل‌وبەرگ', href: '/post-orders', icon: ShoppingCart, permission: 'posts.view', section: 'operations' },
  { label: 'فرۆشگا', href: '/dashboard/store', icon: Store, permission: 'vendors.view', section: 'marketplace' },
  { label: 'داواکارییەکان', href: '/dashboard/orders', icon: ShoppingCart, permission: 'orders.view', section: 'operations' },
  { label: 'گەیاندنەکان', href: '/dashboard/deliveries', icon: Truck, permission: 'deliveries.view', section: 'operations' },
  { label: 'پارەدان', href: '/dashboard/payments', icon: WalletCards, permission: 'payments.view', section: 'finance' },
  { label: 'بەکارهێنەران', href: '/dashboard/users', icon: Users, permission: 'users.view', section: 'management' },
  { label: 'ڕاپۆرتەکان', href: '/dashboard/reports', icon: BarChart3, permission: 'reports.view', section: 'management' },
  { label: 'ئاگادارکردنەوەکان', href: '/dashboard/notifications', icon: Bell, permission: 'notifications.view_own', section: 'management' },
  { label: 'پشتیوانی', href: '/dashboard/support', icon: CircleHelp, permission: 'support.manage', section: 'management' },
  { label: 'داواکارییەکانی Role', href: '/dashboard/role-requests', icon: ShieldCheck, permission: 'role_requests.review', section: 'management' },
  { label: 'Audit Logs', href: '/dashboard/audit', icon: ShieldCheck, permission: 'audit.view', section: 'management' },
];

export function DashboardLayout() {
  const { roles, permissions } = useAuthorization();
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const displayRole = roles.find((item) => item !== 'customer') ?? roles[0] ?? null;
  const visibleItems = navItems.filter((item) => permissions.has(item.permission));
  const sectionLabels: Record<NavSection, string> = {
    overview: 'گشتی',
    marketplace: 'بازاڕ و فرۆشتن',
    operations: 'ئۆردەر و گەیاندن',
    finance: 'پارە و جزدان',
    management: 'بەڕێوەبردن',
  };
  const visibleSections = (Object.keys(sectionLabels) as NavSection[])
    .map((section) => ({ section, items: visibleItems.filter((item) => item.section === section) }))
    .filter((group) => group.items.length > 0);

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
      <nav className="mt-3 space-y-3 pb-5" aria-label="Dashboard navigation">
        {visibleSections.map(({ section, items }) => (
          <section key={section} aria-label={sectionLabels[section]}>
            <h2 className="px-3.5 pb-1.5 pt-2 text-[10px] font-black tracking-wide text-white/45">{sectionLabels[section]}</h2>
            <div className="space-y-1">
              {items.map((item) => (
                <NavLink key={item.href} to={item.href} end={item.href === '/dashboard'} onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `shakh-dashboard__navlink group flex items-center gap-3 px-3.5 py-2.5 text-sm font-bold ${isActive ? 'text-white' : 'text-white/70'}`}>
                  <item.icon size={18} strokeWidth={2.2} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <ChevronLeft className="opacity-40" size={15} />
                </NavLink>
              ))}
            </div>
          </section>
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
            <aside id="dashboard-mobile-menu" role="dialog" aria-modal="true" aria-label="پێڕستی داشبۆرد" className="shakh-dashboard__sidebar shakh-dashboard__sidebar--mobile absolute inset-y-0 end-0 w-[min(90vw,22rem)] overflow-y-auto p-4 shadow-2xl">
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
