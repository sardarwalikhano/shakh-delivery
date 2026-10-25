import { useCallback, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Clock3, Database, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';

type FindingStatus = 'verified' | 'review' | 'failed';
type ScanResult = { id: string; label: string; ok: boolean; detail: string };

function StatusIcon({ status }: { status: FindingStatus }) {
  if (status === 'verified') return <CheckCircle2 className="text-emerald-600" size={20} />;
  if (status === 'failed') return <ShieldAlert className="text-red-600" size={20} />;
  return <AlertTriangle className="text-amber-600" size={20} />;
}

export function SystemAuditorPage() {
  const { user } = useAuth();
  const { roles, permissions, refresh: refreshAuthorization } = useAuthorization();
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [checks, setChecks] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setRunning(true);
    setError(null);
    const results: ScanResult[] = [];
    const startedAt = new Date().toISOString();

    results.push({
      id: 'auth-session',
      label: 'هەژمار و Session',
      ok: Boolean(user?.id),
      detail: user?.id ? 'Session ـی بەکارهێنەر بەردەستە.' : 'هیچ Session ـێکی بەکارهێنەری پشتڕاستکراو نەدۆزرایەوە.',
    });

    const hasSuperAdmin = roles.includes('super_admin');
    results.push({
      id: 'super-admin-role',
      label: 'ڕۆڵی سوپەر ئەدمین',
      ok: hasSuperAdmin,
      detail: hasSuperAdmin ? 'ڕۆڵی super_admin لە AuthorizationContext هەیە.' : 'ڕۆڵی super_admin پشتڕاست نەکراوەتەوە.',
    });

    const hasAuditPermission = permissions.has('audit.view');
    results.push({
      id: 'audit-permission',
      label: 'مۆڵەتی بینینی Audit',
      ok: hasAuditPermission,
      detail: hasAuditPermission ? 'Permission ـی audit.view هەیە.' : 'Permission ـی audit.view لە لیستی مۆڵەتەکانی هەژماردا نییە.',
    });

    try {
      if (!user?.id) throw new Error('Session ـی بەکارهێنەر بەردەست نییە.');
      const roleResult = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      if (roleResult.error) throw roleResult.error;
      results.push({
        id: 'user-roles-query',
        label: 'خوێندنەوەی user_roles',
        ok: true,
        detail: `پەیوەندی بە Supabase سەرکەوتوو بوو؛ ${roleResult.data?.length ?? 0} ڕۆڵ بۆ هەژمارەکە خوێندرایەوە.`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'هەڵەی نەناسراو';
      results.push({ id: 'user-roles-query', label: 'خوێندنەوەی user_roles', ok: false, detail: message });
      setError('پشکنینی پەیوەندی یان ڕۆڵ سەرکەوتوو نەبوو. وردەکاری لە ئەنجامی پشکنین ببینە.');
    }

    try {
      if (!user?.id) throw new Error('Session ـی بەکارهێنەر بەردەست نییە.');
      const permissionResult = await supabase.from('role_permissions').select('permission_code').in('role', roles);
      if (permissionResult.error) throw permissionResult.error;
      const codes = new Set((permissionResult.data ?? []).map((item) => item.permission_code));
      const mismatch = [...permissions].filter((permission) => !codes.has(permission));
      results.push({
        id: 'permissions-consistency',
        label: 'یەکگرتوویی Permission ـەکان',
        ok: mismatch.length === 0,
        detail: mismatch.length === 0 ? 'Permission ـەکانی UI لەگەڵ داتای role_permissions هاوتان.' : `جیاوازی لە ${mismatch.length} permission دۆزرایەوە.`,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'هەڵەی نەناسراو';
      results.push({ id: 'permissions-consistency', label: 'یەکگرتوویی Permission ـەکان', ok: false, detail: message });
    }

    // Read-only schema/API reachability probes. These do not read business records.
    const tableProbes = [
      { id: 'profiles-access', label: 'دەستگەیشتن بە profiles', table: 'profiles', column: 'id' },
      { id: 'permissions-access', label: 'دەستگەیشتن بە permissions', table: 'permissions', column: 'code' },
      { id: 'orders-access', label: 'دەستگەیشتن بە orders', table: 'orders', column: 'id' },
      { id: 'deliveries-access', label: 'دەستگەیشتن بە deliveries', table: 'deliveries', column: 'id' },
      { id: 'products-access', label: 'دەستگەیشتن بە products', table: 'products', column: 'id' },
      { id: 'posts-access', label: 'دەستگەیشتن بە posts', table: 'posts', column: 'id' },
    ] as const;

    const probeResults = await Promise.all(tableProbes.map(async (probe) => {
      try {
        const response = await supabase.from(probe.table).select(probe.column, { head: true, count: 'exact' }).limit(0);
        if (response.error) throw response.error;
        return {
          id: probe.id,
          label: probe.label,
          ok: true,
          detail: 'API و schema ـی خشتەکە وەڵامی سەرکەوتوویان دایەوە. هیچ تۆمارێکی بازرگانی نەخوێندرایەوە.',
        };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'هەڵەی نەناسراو';
        return {
          id: probe.id,
          label: probe.label,
          ok: false,
          detail: `پشکنینی دەستگەیشتن سەرکەوتوو نەبوو: ${message}`,
        };
      }
    }));
    results.push(...probeResults);

    const passCount = results.filter((item) => item.ok).length;
    for (const item of results) {
      if (item.ok) continue;
    }

    setChecks(results);
    setLastRun(startedAt);
    setRunning(false);
    void refreshAuthorization();
    // This first release performs read-only checks only. It intentionally does not
    // write audit records or change database/security settings.
    return passCount;
  }, [permissions, refreshAuthorization, roles, user?.id]);

  const failedCount = checks.filter((item) => !item.ok).length;
  const successCount = checks.filter((item) => item.ok).length;
  const criticalCount = checks.filter((item) => !item.ok && (item.id === 'super-admin-role' || item.id === 'audit-permission')).length;

  if (!roles.includes('super_admin')) {
    return <main className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" dir="rtl"><h1 className="text-xl font-black">دەستگەیشتن ڕەتکرایەوە</h1><p className="mt-2 text-sm leading-7">ئەم بەشە تەنها بۆ سوپەر ئەدمینە. ئەگەر ئەم هەژمارە ڕۆڵی super_admin ـی نییە، بەڕێوەبەری دەسەڵاتدار پەیوەندی پێوە بکە.</p></main>;
  }

  return (
    <main className="space-y-6" dir="rtl">
      <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,#102641_0%,#153d69_58%,#225cff_100%)] p-5 text-white shadow-[0_22px_55px_rgba(16,38,65,.16)] sm:p-7">
        <div className="pointer-events-none absolute -end-12 -top-16 size-48 rounded-full bg-orange-400/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold"><Activity size={15} /> SHAKH SYSTEM HEALTH</div>
            <h1 className="mt-4 text-2xl font-black sm:text-3xl">پشکنینی سیستەمی شاخ</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">پشکنینی Session، ڕۆڵ، مۆڵەت و دەستگەیشتنی API ـی خشتە سەرەکییەکان؛ بە شێوەی read-only و بەبێ خوێندنەوەی تۆمارە بازرگانییەکان.</p>
          </div>
          <button type="button" onClick={() => void runScan()} disabled={running} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60">
            <RefreshCw size={17} className={running ? 'animate-spin' : ''} /> {running ? 'پشکنین دەکرێت...' : 'پشکنینی نوێ ئەنجام بدە'}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<CheckCircle2 size={20} />} label="پشکنینی سەرکەوتوو" value={String(successCount)} tone="green" />
        <Metric icon={<ShieldAlert size={20} />} label="کێشەی دۆزراوە" value={String(failedCount)} tone={failedCount ? 'red' : 'green'} />
        <Metric icon={<AlertTriangle size={20} />} label="مەترسیی بەرز" value={String(criticalCount)} tone={criticalCount ? 'red' : 'neutral'} />
        <Metric icon={<Clock3 size={20} />} label="دوایین پشکنین" value={lastRun ? new Date(lastRun).toLocaleTimeString('ckb-IQ', { hour: '2-digit', minute: '2-digit' }) : '—'} tone="neutral" />
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-7 text-red-800">{error}</div> : null}

      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck size={22} /></div>
          <div>
            <h2 className="font-black text-slate-900">ئەنجامی پشکنین</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">پشکنین تەنها دوای کلیکی سوپەر ئەدمین دەست پێدەکات. نیشانەی سەوز واتە ئەم تاقیکردنەوە دیاریکراوەیە سەرکەوتووە، نەک ئەوەی تەواوی سیستەم بێ کێشەیە.</p>
          </div>
        </div>
        {checks.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <CircleDashed className="mx-auto text-slate-400" size={30} />
            <p className="mt-3 font-bold text-slate-700">هێشتا پشکنینێک ئەنجام نەدراوە</p>
            <p className="mt-1 text-sm text-slate-500">دوگمەی «پشکنینی نوێ ئەنجام بدە» هەڵبژێرە.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {checks.map((check) => (
              <article key={check.id} className={`rounded-xl border p-4 ${check.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'}`}>
                <div className="flex items-start gap-3">
                  <StatusIcon status={check.ok ? 'verified' : 'failed'} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-slate-900">{check.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{check.detail}</p>
                    {!check.ok ? <p className="mt-3 rounded-lg bg-white/80 p-3 text-sm leading-6 text-slate-700"><strong>هەنگاوی دواتر:</strong> {check.id === 'super-admin-role' ? 'ڕۆڵی super_admin و مێژووی ڕۆڵەکان لە Supabase بپشکنە.' : check.id === 'audit-permission' ? 'پۆلیسی مۆڵەتەکان بپشکنە و تەنها بە پەسەندی دەسەڵاتدار چاکی بکە.' : 'هۆکاری هەڵەکە بپشکنە، پاش چاکسازی دووبارە scan بکە.'}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${check.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{check.ok ? 'پشتڕاستکراوە' : 'پێویستی بە چارەسەر'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <div className="flex gap-3">
          <Database className="mt-0.5 shrink-0 text-amber-700" size={21} />
          <div>
            <h2 className="font-black text-amber-950">سنوری ئەم وەشانە</h2>
            <p className="mt-1 text-sm leading-7 text-amber-900">ئەم وەشانە دەستگەیشتنی API/schema ـی هەندێک خشتە دەپشکنێت، بەڵام ناوەڕۆکی پۆلیسی RLS، دەقی SECURITY DEFINER، تەواوی مامەڵە داراییەکان، ڕێڕەوەکان و build بە شێوەی سەرتاسەری هێشتا ناو پشکنینەکەدا نین. مێژووی scan هێشتا لە داتابەیس پاشەکەوت ناکرێت. بۆ ئەوانە RPC ـی پارێزراو، migration و تاقیکردنەوەی CI پێویستن؛ هیچ بەشێک بەبێ بەڵگە وەک سەرکەوتوو نیشان نادرێت.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'green' | 'red' | 'neutral' }) {
  const toneClass = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700';
  return <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm"><div className={`grid size-10 place-items-center rounded-xl ${toneClass}`}>{icon}</div><div className="mt-3 text-sm font-bold text-slate-500">{label}</div><div className="mt-1 text-2xl font-black text-slate-900">{value}</div></div>;
}
