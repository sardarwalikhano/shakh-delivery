import { Eye, EyeOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-[20px] bg-[var(--shakh-navy)] text-lg font-black text-white shadow-[0_18px_45px_rgba(11,18,32,.18)]">
          S
        </div>
        <h1 className="text-3xl font-black tracking-tight text-[var(--shakh-ink)]">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-black/50">{description}</p>
      </div>
      <div className="rounded-[28px] border border-black/[0.07] bg-white p-5 shadow-[0_18px_60px_rgba(16,22,35,.06)] sm:p-7">
        {children}
      </div>
    </div>
  );
}

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[radial-gradient(circle_at_top_left,rgba(255,122,26,.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(30,99,255,.11),transparent_30%)] px-4 py-12 sm:px-6 lg:py-20">
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}</span>
      {children}
      {hint ? <span className="mt-2 block text-xs leading-5 text-black/40">{hint}</span> : null}
    </label>
  );
}

export const inputClass = 'w-full rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 py-3.5 text-sm outline-none transition placeholder:text-black/30 focus:border-[var(--shakh-blue)] focus:bg-white focus:ring-4 focus:ring-[var(--shakh-blue)]/10';
export const primaryButtonClass = 'inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 disabled:cursor-not-allowed disabled:opacity-50';

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder = '••••••••',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <input
          className={inputClass}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          dir="ltr"
          aria-label={label}
        />
        <button
          type="button"
          className="absolute inset-y-0 end-2 my-1.5 grid w-10 place-items-center rounded-xl text-black/45 hover:bg-black/[0.05] hover:text-black/70"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'شاردنەوەی وشەی نهێنی' : 'پیشاندانی وشەی نهێنی'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </Field>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const rules = [
    { ok: password.length >= 8, label: '8+ پیت' },
    { ok: /[a-z]/.test(password), label: 'پیتی بچووک' },
    { ok: /[A-Z]/.test(password), label: 'پیتی گەورە' },
    { ok: /\d/.test(password), label: 'ژمارە' },
  ];
  const score = rules.filter((rule) => rule.ok).length;
  return (
    <div aria-live="polite" className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold">
      {rules.map((rule) => (
        <div key={rule.label} className={`rounded-xl px-3 py-2 ${rule.ok ? 'bg-emerald-500/[0.08] text-emerald-700' : 'bg-black/[0.035] text-black/40'}`}>
          {rule.ok ? '✓' : '•'} {rule.label}
        </div>
      ))}
      <div className="col-span-2 text-xs text-black/40">هێزی وشەی نهێنی: {score}/4</div>
    </div>
  );
}
