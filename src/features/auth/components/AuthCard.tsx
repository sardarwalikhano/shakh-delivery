import { Eye, EyeOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="shakh-auth-mark mx-auto mb-5 grid size-14 place-items-center rounded-2xl text-lg font-black">
          S
        </div>
        <h1 className="text-3xl font-black tracking-tight text-[var(--shakh-ink)]">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-black/50">{description}</p>
      </div>
      <div className="shakh-auth-panel shakh-auth-panel-v3 p-5 sm:p-7">
        {children}
      </div>
    </div>
  );
}

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <section className="shakh-auth-shell px-4 py-10 sm:px-6 sm:py-14 lg:py-20">
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

export const inputClass = 'w-full rounded-xl border border-[var(--shakh-border)] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-black/35 focus:border-[var(--shakh-blue)] focus:ring-4 focus:ring-[var(--shakh-blue)]/10';
export const primaryButtonClass = 'inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

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
