import { ArrowLeft, Download, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';

export function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div>
      <section className="shakh-home-hero">
        <div className="relative mx-auto grid min-h-[min(720px,72dvh)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.12fr_.88fr] lg:gap-14">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3.5 py-2 text-xs font-extrabold text-[var(--shakh-orange)] shadow-sm">
              <Sparkles size={14} /> بناغەی SHAKH Delivery ئامادەیە
            </div>
            <h1 className="text-4xl font-black leading-[1.15] tracking-tight text-[var(--shakh-navy)] sm:text-5xl lg:text-6xl">
              پلاتفۆڕمی نوێی<br />
              <span className="text-[var(--shakh-orange)]">بازاڕ و گەیاندن</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--shakh-muted)] sm:text-lg">
              Kurdish-first، mobile-first و PWA-ready؛ بە architecture ـێکی جیاواز لە SHAKH2027 و بنەمای پاراستنی role و data لە backend.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={isAuthenticated ? '/search' : '/login'} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--shakh-orange)] px-5 py-3 font-black text-white shadow-sm transition hover:-translate-y-px hover:shadow-md">
                دەستپێکردن <ArrowLeft size={18} />
              </Link>
              <Link to="/dashboard" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--shakh-border)] bg-white px-5 py-3 font-bold text-[var(--shakh-navy)] shadow-sm transition hover:border-black/15 hover:bg-slate-50">
                بینینی dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Feature icon={<Smartphone size={20} />} title="PWA" text="Install بۆ مۆبایل و لاپتۆپ، deep-link و update management." />
            <Feature icon={<ShieldCheck size={20} />} title="Security" text="Auth + permissions + RLS؛ frontend check جێگرەوەی security نییە." />
            <Feature icon={<Download size={20} />} title="Production foundation" text="Vite + React + TypeScript + Tailwind + Supabase-ready." />
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="shakh-home-feature p-4 sm:p-5">
      <div className="mb-4 grid size-10 place-items-center rounded-xl bg-orange-50 text-[var(--shakh-orange)]">{icon}</div>
      <div className="font-black">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--shakh-muted)]">{text}</div>
    </div>
  );
}
