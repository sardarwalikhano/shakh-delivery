import { ArrowLeft, ArrowUpLeft, Download, ShieldCheck, Smartphone, Sparkles, Store, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';

export function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="pb-10 sm:pb-14">
      <section className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 sm:pt-7">
        <div className="relative isolate overflow-hidden rounded-[2rem] bg-[var(--shakh-navy)] text-white shadow-[var(--shakh-shadow-lg)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-0 hidden w-[48%] border-s border-white/[0.06] lg:block" />
          <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-28 size-80 rounded-full bg-[var(--shakh-blue)]/20 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 start-1/3 size-72 rounded-full bg-[var(--shakh-orange)]/15 blur-3xl" />

          <div className="relative grid gap-10 px-5 py-9 sm:px-9 sm:py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.75fr)] lg:items-center lg:px-12 lg:py-14">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3.5 py-2 text-xs font-bold text-white/75">
                <Sparkles size={14} className="text-[var(--shakh-orange)]" />
                بازاڕ و گەیاندن لە یەک شوێندا
              </div>
              <h1 className="mt-6 max-w-xl text-4xl font-black leading-[1.2] tracking-tight sm:text-5xl lg:text-6xl">
                هەموو پێویستییەکانت
                <span className="mt-2 block text-[var(--shakh-orange)]">نزیکتر لە تۆ</span>
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/70 sm:text-base sm:leading-8">
                بەرهەم بدۆزەرەوە، فرۆشگا ببینە، و بە ئاسانی داواکارییەکانت بەڕێوەببە. شاخ بۆ مۆبایل و کۆمپیوتەر ڕێکخراوە و زانیارییە ڕاستەقینەکان لە سیستەمەکەوە وەردەگرێت.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={isAuthenticated ? '/search' : '/login'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-orange)] px-5 py-3 text-sm font-black text-white shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#e96919] focus-visible:outline-white">
                  دەستپێکردن <ArrowLeft size={17} />
                </Link>
                <Link to="/posts" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.11]">
                  بینینی پۆستەکان <ArrowUpLeft size={17} />
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs font-semibold text-white/55">
                <span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-300" /> پاراستنی دەسەڵات و داتا</span>
                <span className="inline-flex items-center gap-2"><Smartphone size={15} className="text-sky-300" /> گونجاو بۆ مۆبایل</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <Feature icon={<Store size={19} />} title="بازاڕی فرۆشگا" text="بەرهەم و فرۆشگاکان بگەڕێ و زانیاریی بەردەستبوون ببینە." />
              <Feature icon={<Truck size={19} />} title="گەیاندنی ڕێکخراو" text="زانیاریی داواکاری و مەودای گەیاندن لە شوێنی خۆی ببینە." />
              <Feature icon={<Download size={19} />} title="دەتوانیت دایبمەزرێنیت" text="ئەگەر browser ـەکەت پشتیوانی بکات، Shakh وەک ئەپ زیاد بکە." />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl px-4 sm:mt-10 sm:px-6">
        <div className="flex flex-col gap-4 rounded-[1.75rem] border border-[var(--shakh-border)] bg-white p-5 shadow-[var(--shakh-shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="max-w-2xl">
            <span className="shakh-eyebrow">SHAKH DELIVERY</span>
            <h2 className="mt-2 text-xl font-black tracking-tight text-[var(--shakh-ink)] sm:text-2xl">بە سادەیی بدۆزەوە، بە ئاسانی بەڕێوەی ببە</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--shakh-muted)]">بۆ گەڕان، دڵخوازەکان، سەبەتە، داواکاری و داشبۆرد، هەمان ڕووکار و ڕێگای بەکارهێنانت چاوەڕوان دەکات.</p>
          </div>
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white transition hover:bg-[var(--shakh-blue)]">
            {isAuthenticated ? 'چوونە داشبۆرد' : 'چوونە ژوورەوە'} <ArrowLeft size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-white/[0.055] p-4 transition hover:border-white/[0.16] hover:bg-white/[0.08] sm:p-5">
      <div className="mb-3 grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.07] text-[var(--shakh-orange)]">{icon}</div>
      <div className="font-black text-white">{title}</div>
      <div className="mt-1.5 text-xs leading-6 text-white/60 sm:text-sm">{text}</div>
    </div>
  );
}
