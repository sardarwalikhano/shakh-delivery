import {
  ArrowUpLeft,
  Bell,
  Boxes,
  ClipboardList,
  Gift,
  FileText,
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
  { title: 'وەسڵەکانی فرۆشتن', description: 'بینین، پرینت/PDF و دووبارە ناردنی وەسڵی فرۆشتنی تەواوبوو.', href: '/receipts', permission: 'orders.view', icon: FileText },
  { title: 'گەیاندنەکان', description: 'بینین و بەڕێوەبردنی گەیاندنە بەردەستەکان.', href: '/dashboard/deliveries', permission: 'deliveries.view', icon: Truck },
  { title: 'جزدان و داواکاریی زیادکردنی باڵانس', description: 'بینینی باڵانس، مێژووی مامەڵەکان و داواکاریی زیادکردنی پریپەید.', href: '/dashboard/wallet', permission: 'wallets.view_own', icon: WalletCards },
  { title: 'زیادکردنی باڵانسی سوپەر ئەدمین', description: 'چالاکیی زیادکردنی باڵانس بە پشتڕاستکردنەوە و تۆماری audit.', href: '/dashboard/wallet/admin-credit', permission: 'wallets.manage', icon: WalletCards },
  { title: 'شێر و قازانج', description: 'بینینی خەڵات و مامەڵەکانی شێرکردن.', href: '/dashboard/referral-wallet', permission: 'posts.view', icon: Gift },
  { title: 'داواکاریی ڕۆڵەکان', description: 'پشکنین و بڕیاردان لەسەر داواکاریی ڕۆڵ.', href: '/dashboard/role-requests', permission: 'role_requests.review', icon: ShieldCheck },
  { title: 'ئاگادارکردنەوەکان', description: 'بینین و بەدواداچوونی ئاگادارکردنەوەکان.', href: '/dashboard/notifications', permission: 'notifications.view_own', icon: Bell },
];

export function DashboardPage() {
  const { user } = useAuth();
  const { roles, permissions, loading, error, refresh } = useAuthorization();
  const displayRole = roles.find((item) => item !== 'customer') ?? roles[0] ?? null;
  const presentation = displayRole ? rolePresentation[displayRole] : null;
  const visibleActions = dashboardActions.filter((action) => permissions.has(action.permission));

  const groupedActions = [
    { title: 'بازاڕ و بەرهەم', description: 'پۆست، بەرهەم و فرۆشگا', items: visibleActions.filter((item) => ['posts.create','posts.view','posts.update_own','vendors.view','products.manage'].includes(item.permission)) },
    { title: 'ئۆردەر و گەیاندن', description: 'داواکاری و ڕێڕەوی گەیاندن', items: visibleActions.filter((item) => ['orders.view','deliveries.view'].includes(item.permission)) },
    { title: 'دارایی و جزدان', description: 'باڵانس، وەسڵ و مامەڵەکان', items: visibleActions.filter((item) => ['wallets.view_own','wallets.manage'].includes(item.permission)) },
    { title: 'بەڕێوەبردن و چاودێری', description: 'ڕۆڵ، ئاگادارکردنەوە و چاودێری', items: visibleActions.filter((item) => ['role_requests.review','notifications.view_own','audit.view'].includes(item.permission)) },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6" dir="rtl">
      <section className="relative isolate overflow-hidden rounded-[30px] border border-[#1c3850] bg-[linear-gradient(125deg,#0a1d2b_0%,#12384a_58%,#17645a_100%)] p-5 text-white shadow-[0_24px_65px_rgba(7,29,43,.18)] sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute -end-16 -top-24 -z-10 size-72 rounded-full bg-[#d8a64c]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 start-1/4 -z-10 size-72 rounded-full bg-[#6bd2b0]/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black tracking-wider text-white/75">SHAKH • CONTROL CENTER</span>
              {displayRole ? <span className="rounded-full bg-[#d8a64c] px-3 py-1 text-xs font-black text-[#182b31]">{roleLabelsKu[displayRole] ?? displayRole}</span> : null}
            </div>
            <h1 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">{presentation?.title ?? 'بەخێربێیتە داشبۆردی شاخ'}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-8 text-white/75">{presentation?.description ?? 'داشبۆردەکە بەپێی مۆڵەتە پشتڕاستکراوەکانی هەژمارەکەت ڕێکدەخرێت.'}</p>
          </div>
          <div className="w-full shrink-0 rounded-2xl border border-white/15 bg-white/[.09] p-4 backdrop-blur-md lg:w-80">
            <div className="text-[11px] font-bold text-white/55">بەکارهێنەری ئێستا</div>
            <div className="mt-1 truncate text-sm font-bold text-white" dir="ltr">{user?.email ?? '—'}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
              <div><div className="text-xs text-white/60">بەشە بەردەستەکان</div><div className="mt-1 text-2xl font-black tabular-nums">{visibleActions.length}</div></div>
              <div><div className="text-xs text-white/60">ڕۆڵە چالاکەکان</div><div className="mt-1 text-2xl font-black tabular-nums">{roles.length}</div></div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
          <span>نەتوانرا مۆڵەتەکان نوێ بکرێنەوە. بۆ پاراستنی هەژمار، بەشەکان تا پشتڕاستکردنەوە پیشان نادرێن.</span>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-rose-300 px-4 py-2 font-bold hover:bg-rose-100">هەوڵدانەوە</button>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#d8e2df] bg-white p-4 shadow-sm"><div className="text-xs font-bold text-[#60746f]">دۆخی دەستگەیشتن</div><div className="mt-2 flex items-center gap-2 text-sm font-black text-[#176b53]"><span className="size-2 rounded-full bg-[#23966e]" />{loading ? 'پشکنین...' : error ? 'پێویستی بە پشکنین هەیە' : 'پشتڕاستکراوە'}</div></div>
        <div className="rounded-2xl border border-[#d8e2df] bg-white p-4 shadow-sm"><div className="text-xs font-bold text-[#60746f]">کۆی بەشە ڕێگەپێدراوەکان</div><div className="mt-2 text-2xl font-black tabular-nums text-[#183b43]">{loading ? '—' : visibleActions.length}</div></div>
        <div className="rounded-2xl border border-[#d8e2df] bg-white p-4 shadow-sm"><div className="text-xs font-bold text-[#60746f]">ڕۆڵە چالاکەکان</div><div className="mt-2 text-2xl font-black tabular-nums text-[#183b43]">{loading ? '—' : roles.length}</div></div>
        <div className="rounded-2xl border border-[#d8e2df] bg-white p-4 shadow-sm"><div className="text-xs font-bold text-[#60746f]">خزمەتگوزاری</div><div className="mt-2 text-sm font-black text-[#176b53]">Supabase • Live authorization</div></div>
      </section>

      {groupedActions.length > 0 ? groupedActions.map((group, index) => (
        <section key={group.title} className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black tracking-wide text-[#98712e]">{String(index + 1).padStart(2, '0')} / WORKSPACE</p><h2 className="mt-1 text-xl font-black text-[#183b43]">{group.title}</h2></div>
            <p className="text-xs text-[#687d78]">{group.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((action) => (
              <Link key={action.href} to={action.href} className="group flex min-h-32 items-start gap-4 rounded-2xl border border-[#dce6e2] bg-white p-4 shadow-[0_8px_24px_rgba(12,43,38,.04)] transition duration-200 hover:-translate-y-1 hover:border-[#c8a45c] hover:shadow-[0_18px_36px_rgba(12,43,38,.10)] sm:p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eaf3ef] text-[#176b53] transition group-hover:bg-[#176b53] group-hover:text-white"><action.icon size={21} strokeWidth={2.1} /></span>
                <span className="min-w-0 flex-1"><span className="block font-black text-[#183b43]">{action.title}</span><span className="mt-2 block text-xs leading-6 text-[#687d78]">{action.description}</span></span>
                <ArrowUpLeft size={17} className="mt-1 shrink-0 text-[#a0b0aa] transition group-hover:text-[#98712e]" />
              </Link>
            ))}
          </div>
        </section>
      )) : (
        <section className="rounded-2xl border border-dashed border-[#cbd9d4] bg-white p-7 text-center">
          <ShieldCheck size={32} className="mx-auto text-[#8d9f99]" />
          <h2 className="mt-3 font-black text-[#183b43]">{loading ? 'مۆڵەتەکان دەخوێندرێنەوە' : 'هیچ بەشێکی بۆ ئەم هەژمارە دیاری نەکراوە'}</h2>
          <p className="mt-2 text-sm leading-7 text-[#687d78]">تەنها بەشە پشتڕاستکراوەکان دەردەکەون. بۆ زیادکردنی دەسەڵات، پەیوەندی بە بەڕێوەبەری پلاتفۆرم بکە.</p>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-[#dce6e2] bg-white p-4 sm:p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf3ef] text-[#176b53]"><LayoutDashboard size={19} /></span><div><h2 className="font-black text-[#183b43]">داشبۆردی بەپێی ڕۆڵ</h2><p className="mt-1 text-xs leading-6 text-[#687d78]">کارت و بەشەکان لە مۆڵەتی Supabase دروست دەبن؛ هیچ ژمارە یان داتای ساختە بەکارناهێنرێت.</p></div></div>
        <div className="flex items-start gap-3 rounded-2xl border border-[#dce6e2] bg-white p-4 sm:p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fbf3e3] text-[#98712e]"><ShieldCheck size={19} /></span><div><h2 className="font-black text-[#183b43]">پاراستنی دەسەڵات</h2><p className="mt-1 text-xs leading-6 text-[#687d78]">ڕێنمایی UI جێگرەوەی RLS نییە. بڕیاری کۆتایی دەسەڵات و مامەڵەکان لە PostgreSQL پشتڕاست دەکرێنەوە.</p></div></div>
      </section>
    </div>
  );
}
