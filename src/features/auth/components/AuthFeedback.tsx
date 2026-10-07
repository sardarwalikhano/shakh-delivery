export function AuthFeedback({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-2xl border border-red-500/15 bg-red-500/[0.07] px-4 py-3 text-sm leading-6 text-red-700">
      {error}
    </div>
  );
}

export function AuthSuccess({ children }: { children: string }) {
  return (
    <div role="status" className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.07] px-4 py-3 text-sm leading-6 text-emerald-700">
      {children}
    </div>
  );
}
