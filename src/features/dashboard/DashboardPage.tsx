import { BarChart3, Bell, Boxes, ChevronLeft, CircleHelp, LayoutDashboard, Package, ShieldCheck, ShoppingCart, Store, Truck, Users, WalletCards } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { useAuth } from '@/lib/auth/AuthContext';

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

type NavItem = {
  label: string;
  href: string;
  icon: Icon;
  permission: string;
};

const navItems: NavItem[] = [
  { label: 'سەرەکی', href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { label: 'بەرهەمەکان', href: '/dashboard/products', icon: Boxes, permission: 'products.view' },
  { label: 'فرۆشگا', href: '/dashboard/store', icon: Store, permission: 'vendors.view' },
  { label: 'داواکارییەکان', href: '/dashboard/orders', icon: ShoppingCart, permission: 'orders.view' },
  { label: 'گەیاندنەکان', href: '/dashboard/deliveries', icon: Truck, permission: 'deliveries.view' },
  { label: 'پارەدان', href: '/dashboard/payments', icon: WalletCards, permission: 'payments.view' },
  { label: 'بەکارهێنەران', href: '/dashboard/users', icon: Users, permission: 'users.view' },
  { label: 'ڕاپۆرتەکان', href: '/dashboard/reports', icon: BarChart3, permission: 'reports.view' },
  { label: 'ئاگادارکردنەوەکان', href: '/dashboard/notifications', icon: Bell, permission: 'notifications.manage' },
  { label: 'پشتیوانی', href: '/dashboard/support', icon: CircleHelp, permission: 'support.manage' },
  { label: 'Audit Logs', href: '/dashboard/audit', icon: ShieldCheck, permission: 'audit.view' },
];

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  customer: 'Customer',
  captain: 'Captain',
  restaurant_vendor: 'Restaurant Vendor',
  fashion_vendor: 'Fashion Vendor',
  car_dealer: 'Car Dealer',
  umrah_agency: 'Umrah Agency',
  support: 'Support',
};

export function DashboardPage() {
  const { user } = useAuth();
  const { role, permissions } = useAuthorization();
  const visibleItems = navItems.filter((item) => permissions.has(item.permission));

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb]">
      <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-black/[0.06] bg-white lg:min-h-[calc(100dvh-4rem)] lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-s">
          <div className="sticky top-16 p-4 sm:p-5 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto">
            <div className="rounded-[24px] bg-[var(--shakh-navy)] p-4 text-white shadow-[0_14px_38px_rgba(11,18,32,.12)]">
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-lg font-black">S</div>
                <div className="min-w-0">
                  <div className="truncate font-black">SHAKH Delivery</div>
                  <div className="mt-0.5 truncate text-xs text-white/50">{role ? roleLabels[role] ?? role : '...'}</div>
                </div>
              </div>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1" aria-label="Dashboard navigation">
              {visibleItems.map((item) => (
                <Link key={item.href} to={item.href} className="group flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold text-black/60 transition hover:bg-black/[0.04] hover:text-black">
                  <item.icon size={18} strokeWidth={2.2} />
                  <span className="whitespace-nowrap">{item.label}</span>
                  <ChevronLeft className="ms-auto hidden opacity-0 transition group-hover:opacity-40 lg:block" size={15} />
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_14px_50px_rgba(16,22,35,.05)] sm:p-7">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <div className="text-sm font-bold text-[var(--shakh-orange)]">Dashboard</div>
                  <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">بەخێربێیتەوە</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-black/50">ئەم workspace ـە بەپێی role و permission ـەکانی هەژمارەکەت ڕێکخراوە. data ـی ڕاستەقینە لە module ـەکاندا دێت؛ لەم بناغەیەدا هیچ KPI ـی ساختە نین.</p>
                </div>
                <div className="rounded-2xl bg-[var(--shakh-bg)] px-4 py-3 text-sm">
                  <div className="text-xs font-bold text-black/35">Signed in as</div>
                  <div className="mt-1 max-w-[280px] truncate font-bold" dir="ltr">{user?.email}</div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <DashboardCard title="Permission-aware" text="هەر module ـێک تەنها کاتێک دەردەکەوێت کە permission ـی گونجاو هەبێت." icon={<ShieldCheck size={20} />} />
              <DashboardCard title="Unified shell" text="هەمان header، sidebar، spacing و interaction pattern بۆ هەموو role ـەکان." icon={<LayoutDashboard size={20} />} />
              <DashboardCard title="Database-first" text="دەسەڵات لە database و RLS پشتڕاست دەکرێتەوە؛ UI guard جێگرەوەی security نییە." icon={<Package size={20} />} />
            </section>

            <section className="rounded-[30px] border border-dashed border-black/10 bg-white p-6 sm:p-8">
              <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-black">Module ـەکان ئامادەن بۆ قۆناغەکانی دواتر</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-black/50">ئەم dashboard ـە UI shell ـی production ـە. CRUD و metrics تەنها کاتێک زیاد دەکرێن کە table، RLS و business logic ـی واقعییەکەیان ئامادە بێت.</p>
                </div>
                <Link to="/account" className="inline-flex items-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white hover:opacity-90">بینینی هەژمار <ChevronLeft size={17} /></Link>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardCard({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)]">
      <div className="grid size-10 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]">{icon}</div>
      <h2 className="mt-4 text-base font-black">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-black/50">{text}</p>
    </div>
  );
}
