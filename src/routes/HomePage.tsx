import { ArrowLeft, Download, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--shakh-navy)] text-white">
        <div className="absolute -left-24 -top-24 size-80 rounded-full bg-[var(--shakh-orange)]/25 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-[var(--shakh-blue)]/30 blur-3xl" />
        <div className="relative mx-auto grid min-h-[62dvh] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_.8fr]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/75">
              <Sparkles size={14} /> بناغەی SHAKH Delivery ئامادەیە
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              پلاتفۆڕمی نوێی<br />
              <span className="text-[var(--shakh-orange)]">بازاڕ و گەیاندن</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/65 sm:text-lg">
              Kurdish-first، mobile-first و PWA-ready؛ بە architecture ـێکی جیاواز لە SHAKH2027 و بنەمای پاراستنی role و data لە backend.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[var(--shakh-navy)] hover:bg-white/90">
                دەستپێکردن <ArrowLeft size={18} />
              </Link>
              <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white hover:bg-white/10">
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
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
      <div className="mb-4 grid size-10 place-items-center rounded-2xl bg-white/10 text-[var(--shakh-orange)]">{icon}</div>
      <div className="font-black">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/55">{text}</div>
    </div>
  );
}
