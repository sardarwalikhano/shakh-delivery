import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

export type PostWizardStep = {
  title: string;
  description: string;
};

type PostWizardStepperProps = {
  steps: readonly PostWizardStep[];
  activeStep: number;
  onStepChange: (step: number) => void;
};

type PostWizardNavigationProps = {
  activeStep: number;
  stepCount: number;
  onBack: () => void;
  onNext: () => void;
  busy?: boolean;
};

export function PostWizardStepper({ steps, activeStep, onStepChange }: PostWizardStepperProps) {
  const current = steps[Math.min(Math.max(activeStep, 0), steps.length - 1)];

  return (
    <section className="mb-5 space-y-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5" dir="rtl" aria-label="هەنگاوەکانی پۆستکردن">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black tracking-wide text-[var(--shakh-orange)]">هەنگاوی {activeStep + 1} لە {steps.length}</div>
          <h2 className="mt-1 text-lg font-black leading-7 text-[var(--shakh-navy)] sm:text-xl">{current?.title}</h2>
          <p className="mt-1 text-xs leading-6 text-black/50 sm:text-sm">{current?.description}</p>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]">
          {activeStep === steps.length - 1 ? <Check size={21} /> : <span className="text-base font-black">{String(activeStep + 1).padStart(2, '0')}</span>}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--shakh-bg)]" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={activeStep + 1} aria-label="پێشکەوتنی فۆڕم">
        <div className="h-full rounded-full bg-gradient-to-l from-[var(--shakh-orange)] to-[var(--shakh-blue)] transition-[width] duration-300" style={{ width: ((activeStep + 1) / steps.length) * 100 + '%' }} />
      </div>

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="هەڵبژاردنی هەنگاو">
        {steps.map((step, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;
          return (
            <button
              key={step.title}
              type="button"
              onClick={() => { if (index < activeStep) onStepChange(index); }}
              disabled={index >= activeStep}
              aria-current={active ? 'step' : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition ${active ? 'border-[var(--shakh-orange)] bg-[var(--shakh-orange)]/[0.07] text-[var(--shakh-navy)] shadow-sm' : complete ? 'border-emerald-600/20 bg-emerald-600/[0.04] text-emerald-800' : 'border-black/[0.06] bg-[var(--shakh-bg)] text-black/35'}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${active ? 'bg-[var(--shakh-orange)] text-white' : complete ? 'bg-emerald-600 text-white' : 'bg-white text-black/35'}`}>
                {complete ? <Check size={14} /> : index + 1}
              </span>
              <span className="min-w-0 truncate text-xs font-black sm:text-sm">{step.title}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}

export function PostWizardNavigation({ activeStep, stepCount, onBack, onNext, busy = false }: PostWizardNavigationProps) {
  const isFirst = activeStep === 0;
  const isLast = activeStep === stepCount - 1;

  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-4" dir="rtl">
      <button
        type="button"
        onClick={onBack}
        disabled={isFirst || busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-black text-[var(--shakh-navy)] transition hover:border-black/20 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronRight size={17} />
        پێشوو
      </button>
      <span className="text-xs font-bold tabular-nums text-black/45">{activeStep + 1} / {stepCount}</span>
      {!isLast ? (
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          هەنگاوی دواتر
          <ChevronLeft size={17} />
        </button>
      ) : <span className="text-xs font-bold text-[var(--shakh-orange)]">پێداچوونەوەی کۆتایی</span>}
    </div>
  );
}
