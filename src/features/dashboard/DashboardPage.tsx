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
    <div className="space-y-6">
      <section className="shakh-surface p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="shakh-eyebrow">DASHBOARD</div>
              {displayRole ? <span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1 text-xs font-black text-[var(--shakh-orange)]">ڕۆڵ: {roleLabelsKu[displayRole] ?? displayRole}</span> : null}
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">بەخێربێیتەوە</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-black/50">ئەم workspace ـە بەپێی role و permission ـەکانی هەژمارەکەت ڕێکخراوە. data ـی ڕاستەقینە لە module ـەکاندا دێت؛ لەم بناغەیەدا هیچ KPI ـی ساختە نین.</p>
          </div>
          <div className="rounded-xl border border-[var(--shakh-border)] bg-slate-50 px-4 py-3 text-sm">
            <div className="text-xs font-bold text-black/35">Signed in as</div>
            <div className="mt-1 max-w-[280px] truncate font-bold" dir="ltr">{user?.email}</div>
          </div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="Permission-aware" text="هەر module ـێک تەنها کاتێک دەردەکەوێت کە permission ـی گونجاو هەبێت." icon={<ShieldCheck size={20} />} />
        <DashboardCard title="Unified shell" text="هەمان header، sidebar، spacing و interaction pattern بۆ هەموو role ـەکان." icon={<LayoutDashboard size={20} />} />
        <DashboardCard title="Database-first" text="دەسەڵات لە database و RLS پشتڕاست دەکرێتەوە؛ UI guard جێگرەوەی security نییە." icon={<Package size={20} />} />
      </section>
      <section className="shakh-surface p-5 sm:p-7">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black">Module ـەکان ئامادەن بۆ قۆناغەکانی دواتر</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-black/50">ئەم dashboard ـە UI shell ـی production ـە. CRUD و metrics تەنها کاتێک زیاد دەکرێن کە table، RLS و business logic ـی واقعییەکەیان ئامادە بێت.</p>
          </div>
          <Link to="/account" className="inline-flex items-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white hover:opacity-90">بینینی هەژمار <ChevronLeft size={17} /></Link>
        </div>
      </section>
    </div>
  );
}

function DashboardCard({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="shakh-surface p-5">
      <div className="grid size-10 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]">{icon}</div>
      <h2 className="mt-4 text-base font-black">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-black/50">{text}</p>
    </div>
  );
}
