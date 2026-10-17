import { ChevronLeft, LayoutDashboard, Package, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { roleLabelsKu } from '@/features/role-requests/roleLabels';
import { useAuth } from '@/lib/auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();
  const { roles } = useAuthorization();
  const displayRole = roles.find((item) => item !== 'customer') ?? roles[0] ?? null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-[var(--shakh-border)] bg-white p-5 shadow-[var(--shakh-shadow-sm)] sm:p-7 lg:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-20 -z-10 size-64 rounded-full bg-[var(--shakh-blue)]/[0.07] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 start-1/3 -z-10 size-56 rounded-full bg-[var(--shakh-orange)]/[0.07] blur-3xl" />
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shakh-eyebrow"><LayoutDashboard size={14} /> داشبۆردی شاخ</span>
              {displayRole ? <span className="rounded-full border border-[var(--shakh-orange)]/15 bg-[var(--shakh-orange)]/[0.08] px-3 py-1 text-xs font-black text-[var(--shakh-orange)]">ڕۆڵ: {roleLabelsKu[displayRole] ?? displayRole}</span> : null}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--shakh-ink)] sm:text-4xl">بەخێربێیتەوە</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--shakh-muted)]">بەشەکانی داشبۆرد بەپێی ڕۆڵ و دەسەڵاتەکانی هەژمارەکەت پیشان دەدرێن. هەموو داتای بازرگانی لە Supabase وەردەگیرێت و هیچ ژمارەی ساختە بۆ ئەم پەڕەیە زیاد نەکراوە.</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-[var(--shakh-border)] bg-[var(--shakh-surface-soft)] px-4 py-3 text-sm md:max-w-[18rem]">
            <div className="text-xs font-bold text-[var(--shakh-muted)]">هەژماری چالاک</div>
            <div className="mt-1 truncate font-bold text-[var(--shakh-ink)]" dir="ltr">{user?.email}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="دەسەڵاتی پارێزراو" text="هەر بەشێک تەنها بۆ ڕۆڵە مۆڵەتپێدراوەکان پیشان دەدرێت؛ پاراستنی کۆتایی لە داتابەیس و RLS جێبەجێ دەکرێت." icon={<ShieldCheck size={20} />} />
        <DashboardCard title="پێڕستی یەکگرتوو" text="ناڤیگەیشن و شێوازی بەکارهێنان لە مۆبایل، تابلێت و کۆمپیوتەر هاوشێوەن." icon={<LayoutDashboard size={20} />} />
        <DashboardCard title="داتای ڕاستەقینە" text="بەرهەم، ئۆردەر، گەیاندن و هەژمارەکان لە خشتە و API ـە ڕاستەقینەکانەوە دەخوێندرێنەوە." icon={<Package size={20} />} />
      </section>

      <section className="rounded-[1.75rem] border border-dashed border-[var(--shakh-border)] bg-white p-5 sm:p-7">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h2 className="text-lg font-black text-[var(--shakh-ink)] sm:text-xl">دەستگەیشتن بە هەژمار و کارەکانت</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--shakh-muted)]">لەم پێڕستەوە دەتوانیت بۆ بەشە مۆڵەتپێدراوەکان بچیت. هەر پەڕەیەک زانیاریی پەیوەندیدار بە ڕۆڵەکەت پیشان دەدات.</p>
          </div>
          <Link to="/account" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white transition hover:bg-[var(--shakh-blue)]">ڕێکخستنی هەژمار <ChevronLeft size={17} /></Link>
        </div>
      </section>
    </div>
  );
}

function DashboardCard({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--shakh-border)] bg-white p-4 shadow-[var(--shakh-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shakh-shadow-md)] sm:p-5">
      <div className="grid size-11 place-items-center rounded-[15px] bg-[var(--shakh-blue)]/[0.08] text-[var(--shakh-blue)]">{icon}</div>
      <h2 className="mt-4 text-base font-black text-[var(--shakh-ink)]">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-[var(--shakh-muted)]">{text}</p>
    </div>
  );
}
