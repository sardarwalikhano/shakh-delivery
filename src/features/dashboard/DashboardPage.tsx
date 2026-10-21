import {
  ArrowUpLeft,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  Gift,
  LayoutDashboard,
  Package,
  PlusCircle,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  WalletCards,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { roleLabelsKu } from '@/features/role-requests/roleLabels';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization, type AppRole } from '@/lib/permissions/AuthorizationContext';

type DashboardIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

type RolePresentation = {
  title: string;
  description: string;
  eyebrow: string;
  accent: string;
};

const rolePresentation: Record<AppRole, RolePresentation> = {
  super_admin: {
    eyebrow: 'SUPER ADMIN WORKSPACE',
    title: 'ناوەندی بەڕێوەبردنی شاخ',
    description: 'لەوێوە داواکاریی ڕۆڵەکان، پۆست و ئۆردەرەکان، گەیاندن و جزدانەکان بەڕێوەببە. هەر بەشێک بەپێی دەسەڵاتی ڕاستەقینەی Supabase دەردەکەوێت.',
    accent: 'ڕێکخستن و چاودێری سەرتاسەری پلاتفۆرم',
  },
  admin: {
    eyebrow: 'ADMIN WORKSPACE',
    title: 'داشبۆردی بەڕێوەبەر',
    description: 'بەشەکانی بەڕێوەبردن و چاودێریی پلاتفۆرم لێرە کۆکراونەتەوە؛ تەنها ئەو کارانە دەردەکەون کە مۆڵەتیان هەیە.',
    accent: 'بەڕێوەبردنی بەشە ڕێگەپێدراوەکان',
  },
  customer: {
    eyebrow: 'CUSTOMER WORKSPACE',
    title: 'بازاڕ و داواکارییەکانت',
    description: 'بگەڕێ لە پۆستەکان، داواکارییەکانت بەدواداچوون بۆ بکە و بەشەکانی جزدان و خەڵات بەکاربهێنە.',
    accent: 'کڕین، داواکاری و خزمەتگوزاری',
  },
  captain: {
    eyebrow: 'CAPTAIN WORKSPACE',
    title: 'داشبۆردی کاپتن',
    description: 'بەشەکانی گەیاندن و داواکارییە پەیوەندیدارەکان بەکاربهێنە. زانیارییەکان لە Supabase وەرگیراون، نەک لە داتای نموونەیی.',
    accent: 'گەیاندن و پێشکەوتنی ئۆردەر',
  },
  restaurant_vendor: {
    eyebrow: 'RESTAURANT WORKSPACE',
    title: 'داشبۆردی خاوەنی چێشتخانە',
    description: 'بەڕێوەبردنی فرۆشگا، پۆست و ئۆردەرەکانت لە یەک شوێنەوە بکە.',
    accent: 'فرۆشگا، ئۆردەر و بەرهەم',
  },
  fashion_vendor: {
    eyebrow: 'FASHION VENDOR WORKSPACE',
    title: 'داشبۆردی فرۆشیاری جل‌وبەرگ',
    description: 'پۆست و بەرهەمەکانت بەڕێوەببە و داواکارییەکان و هەڵبژاردەکانی ڕەنگ و قەبارە چاودێری بکە.',
    accent: 'پۆست، کۆگا و ئۆردەر',
  },
  supermarket_vendor: {
    eyebrow: 'SUPERMARKET WORKSPACE',
    title: 'داشبۆردی سوپەرمارکێت',
    description: 'بەشەکانی بەڕێوەبردنی بەرهەم و داواکارییە بەردەستەکان بە پێی دەسەڵاتی هەژمارەکەت بکەرەوە.',
    accent: 'بەرهەم، ستۆک و ئۆردەر',
  },
  car_dealer: {
    eyebrow: 'CAR DEALER WORKSPACE',
    title: 'داشبۆردی فرۆشیاری ئۆتۆمبێل',
    description: 'پۆست و بەشە بازرگانییە ڕێگەپێدراوەکانت بەڕێوەببە. پۆستی ئۆتۆمبێل لە فلووی ئۆردەری ڕاستەوخۆ جیاوازە.',
    accent: 'پۆست و بەڕێوەبردنی بازرگانی',
  },
  umrah_agency: {
    eyebrow: 'UMRAH AGENCY WORKSPACE',
    title: 'داشبۆردی نووسینگەی حەج و عومرە',
    description: 'بەشەکانی پۆست و بەڕێوەبردنی بازرگانی بە پێی مۆڵەتی نووسینگەکەت بەکاربهێنە.',
    accent: 'پۆست و بەڕێوەبردنی نووسینگە',
  },
  support: {
    eyebrow: 'SUPPORT WORKSPACE',
    title: 'داشبۆردی پشتیوانی',
    description: 'بەشە ڕێگەپێدراوەکانی ئۆردەر، ئاگادارکردنەوە و پشتیوانی بۆ یارمەتیدانی بەکارهێنەران بەکاربهێنە.',
    accent: 'خزمەتگوزاری و چاودێری',
  },
};

type DashboardAction = {
  title: string;
  description: string;
  href: string;
  permission: string;
  icon: DashboardIcon;
};

const dashboardActions: DashboardAction[] = [
  { title: 'پۆستی نوێ', description: 'زیادکردنی پۆست بەپێی کاتەگۆری و ڕۆڵی ڕێگەپێدراو.', href: '/dashboard/posts/new', permission: 'posts.create', icon: PlusCircle },
  { title: 'پۆستەکان', description: 'بینین و گەڕان لە پۆستە چالاکەکانی بازاڕ.', href: '/posts', permission: 'posts.view', icon: Package },
  { title: 'بەڕێوەبردنی پۆستەکان', description: 'دەستکاری و چاودێری پۆستەکانی خۆت و بەشە ڕێگەپێدراوەکان.', href: '/dashboard/posts/manage', permission: 'posts.update_own', icon: ClipboardList },
  { title: 'فرۆشگا', description: 'بینین و بەڕێوەبردنی خزمەتگوزاریی فرۆشگا.', href: '/dashboard/store', permission: 'vendors.view', icon: Store },
  { title: 'بەرهەمەکان', description: 'کردنەوەی بەشی بەرهەم و بەڕێوەبردنی کۆگا.', href: '/dashboard/products', permission: 'products.manage', icon: Boxes },
  { title: 'داواکارییەکانم', description: 'بینین و بەدواداچوونی ئۆردەرەکانی خۆت.', href: '/orders', permission: 'orders.view', icon: ShoppingBag },
  { title: 'ئۆردەری فرۆشیار', description: 'پشکنین و بەڕێوەبردنی داواکارییە پەیوەندیدارەکان.', href: '/dashboard/orders', permission: 'orders.view', icon: ShoppingCart },
  { title: 'گەیاندنەکان', description: 'بینین و بەڕێوەبردنی گەیاندنە بەردەستەکان.', href: '/dashboard/deliveries', permission: 'deliveries.view', icon: Truck },
  { title: 'جزدان و داواکاریی زیادکردنی باڵانس', description: 'بینینی باڵانس، مێژووی مامەڵەکان و داواکاریی زیادکردنی پریپەید.', href: '/dashboard/wallet', permission: 'wallets.view_own', icon: WalletCards },
  { title: 'زیادکردنی باڵانسی سوپەر ئەدمین', description: 'چالاکیی زیادکردنی باڵانس بە پشتڕاستکردنەوە و تۆماری audit.', href: '/dashboard/wallet/admin-credit', permission: 'wallets.manage', icon: WalletCards },
  { title: 'شێر و قازانج', description: 'بینینی خەڵات و مامەڵەکانی شێرکردن.', href: '/dashboard/referral-wallet', permission: 'posts.view', icon: Gift },
  { title: 'داواکاریی ڕۆڵەکان', description: 'پشکنین و بڕیاردان لەسەر داواکاریی ڕۆڵ.', href: '/dashboard/role-requests', permission: 'role_requests.review', icon: ShieldCheck },
  { title: 'ئاگادارکردنەوەکان', description: 'بینین و بەدواداچوونی ئاگادارکردنەوەکان.', href: '/dashboard/notifications', permission: 'notifications.view_own', icon: Bell },
  { title: 'ڕاپۆرتەکان', description: 'کردنەوەی بەشی ڕاپۆرت بەپێی دەسەڵاتی هەژمارەکەت.', href: '/dashboard/reports', permission: 'reports.view', icon: BarChart3 },
];

export function DashboardPage() {
  const { user } = useAuth();
  const { roles, permissions } = useAuthorization();
  const displayRole = roles.find((item) => item !== 'customer') ?? roles[0] ?? null;
  const presentation = displayRole ? rolePresentation[displayRole] : null;
  const visibleActions = dashboardActions.filter((action) => permissions.has(action.permission));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,#102641_0%,#153d69_56%,#225cff_100%)] p-5 text-white shadow-[0_22px_55px_rgba(16,38,65,.16)] sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute -end-14 -top-20 size-56 rounded-full bg-[var(--shakh-orange)]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 start-1/4 size-64 rounded-full bg-blue-300/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black tracking-wider text-white/75">{presentation?.eyebrow ?? 'SHAKH WORKSPACE'}</span>
              {displayRole ? <span className="rounded-full bg-[var(--shakh-orange)] px-3 py-1 text-xs font-black text-white">{roleLabelsKu[displayRole] ?? displayRole}</span> : null}
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">{presentation?.title ?? 'بەخێربێیتە داشبۆردی شاخ'}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75">{presentation?.description ?? 'داشبۆردەکە بەپێی مۆڵەتە پشتڕاستکراوەکانی هەژمارەکەت ڕێکدەخرێت.'}</p>
          </div>
          <div className="w-full shrink-0 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm lg:w-72">
            <div className="text-[11px] font-bold text-white/55">SIGNED IN AS</div>
            <div className="mt-1 truncate text-sm font-bold text-white" dir="ltr">{user?.email ?? '—'}</div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-xs text-white/65">بەشە دەستگەیشتووەکان</span>
              <span className="rounded-lg bg-white/15 px-2.5 py-1 text-sm font-black tabular-nums">{visibleActions.length}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-wide text-[var(--shakh-orange)]">{presentation?.accent ?? 'دەستگەیشتنی ڕۆڵ'}</p>
            <h2 className="mt-1 text-xl font-black text-[var(--shakh-ink)]">دەستگەیشتنی خێرا</h2>
          </div>
          <p className="text-xs leading-6 text-black/45">بەشەکان بە مۆڵەتی Supabase فلتەر دەکرێن؛ زانیاری و ژمارەی ساختە بەکارنەهاتووە.</p>
        </div>

        {visibleActions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleActions.map((action) => (
              <Link
                key={action.href}
                to={action.href}
                className="group flex min-h-36 items-start gap-4 rounded-2xl border border-[var(--shakh-border)] bg-white p-4 shadow-[0_8px_24px_rgba(16,38,65,.035)] transition duration-150 hover:-translate-y-0.5 hover:border-[var(--shakh-orange)]/40 hover:shadow-[0_15px_30px_rgba(16,38,65,.08)] sm:p-5"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)] transition group-hover:bg-[var(--shakh-orange)] group-hover:text-white">
                  <action.icon size={21} strokeWidth={2.1} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-black text-[var(--shakh-ink)]">{action.title}</span>
                  <span className="mt-2 block text-xs leading-6 text-black/50">{action.description}</span>
                </span>
                <ArrowUpLeft size={17} className="mt-1 shrink-0 text-black/25 transition group-hover:text-[var(--shakh-orange)]" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-black/15 bg-white p-6 text-sm leading-7 text-black/55">
            بۆ ئەم هەژمارە هێشتا هیچ بەشێکی داشبۆرد دیاری نەکراوە. تکایە لەگەڵ سوپەر ئەدمین پشکنینی مۆڵەتەکان بکە.
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--shakh-border)] bg-white p-4 sm:p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-700"><LayoutDashboard size={19} /></span>
          <div>
            <h2 className="font-black">داشبۆردی بەپێی ڕۆڵ</h2>
            <p className="mt-1 text-xs leading-6 text-black/50">کارت و بەشەکان تەنها کاتێک پیشان دەدرێن کە مۆڵەتی پێویست بۆ ئەو هەژمارە هەبێت.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--shakh-border)] bg-white p-4 sm:p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700"><ShieldCheck size={19} /></span>
          <div>
            <h2 className="font-black">پاراستنی دەسەڵات</h2>
            <p className="mt-1 text-xs leading-6 text-black/50">ڕێنماییەکانی UI جێگرەوەی RLS و پشتڕاستکردنەوەی لای داتابەیس نین؛ بڕیارە سەرەکییەکان هەر لە Supabase پشتڕاست دەکرێنەوە.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
