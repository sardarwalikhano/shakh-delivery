import { CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { listPendingRoleRequests, reviewRoleRequest, type RoleRequest } from '../api';
import { roleLabelsKu } from '../roleLabels';
import { AuthFeedback, AuthSuccess } from '@/features/auth/components/AuthFeedback';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';

export function RoleRequestsPage() {
  const { hasPermission } = useAuthorization();
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await listPendingRoleRequests());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا داواکارییەکانی Role بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!hasPermission('role_requests.review')) return null;

  const review = async (request: RoleRequest, status: 'approved' | 'rejected') => {
    if (busyId) return;
    setBusyId(request.id);
    setError(null);
    setSuccess(null);
    try {
      await reviewRoleRequest(request.id, status);
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setSuccess(
        status === 'approved'
          ? 'Role ـی ' + roleLabelsKu[request.requested_role] + ' بۆ ' + (request.full_name || request.email || 'بەکارهێنەر') + ' ڤەریفای کرا.'
          : 'داواکاریی Role ـی ' + roleLabelsKu[request.requested_role] + ' ڕەتکرایەوە.',
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پشکنین/ڤەریفای داواکاری سەرکەوتوو نەبوو.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[30px] bg-[var(--shakh-navy)] p-6 text-white shadow-[0_18px_60px_rgba(11,18,32,.12)] sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/10"><ShieldCheck size={22} /></div>
            <div>
              <div className="text-xs font-black text-[var(--shakh-orange)]">Role verification</div>
              <h1 className="mt-1 text-3xl font-black">داواکارییەکانی Role</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/55">هەر role ـێک پێش چالاککردنی دەسەڵاتەکانی پێویستی بە ڤەریفای Super Admin هەیە.</p>
            </div>
          </div>
        </header>

        <AuthFeedback error={error} />
        {success ? <AuthSuccess>{success}</AuthSuccess> : null}

        {loading ? (
          <div className="rounded-[28px] bg-white p-12 text-center text-sm font-bold text-black/45">بارکردن...</div>
        ) : requests.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-black/10 bg-white p-12 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={34} />
            <h2 className="mt-4 text-xl font-black">هیچ داواکارییەکی چاوەڕوان نییە</h2>
            <p className="mt-2 text-sm leading-7 text-black/45">کاتێک user ـێک role داوا بکات، لێرەدا بۆ پشکنین دەردەکەوێت.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)] sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1 text-[11px] font-black text-[var(--shakh-orange)]">{roleLabelsKu[request.requested_role]}</span>
                      <span className="flex items-center gap-1 text-[11px] font-bold text-black/35"><Clock3 size={13} /> {new Date(request.requested_at).toLocaleString('ku-IQ')}</span>
                    </div>
                    <h2 className="mt-3 text-lg font-black">{request.full_name || 'بێ ناو'}</h2>
                    <div className="mt-1 text-sm font-bold text-black/50" dir="ltr">{request.email || '—'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busyId === request.id} onClick={() => void review(request, 'rejected')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-red-500/15 bg-red-500/[0.06] px-4 text-xs font-black text-red-700 disabled:opacity-40">
                      <XCircle size={17} /> ڕەتکردنەوە
                    </button>
                    <button disabled={busyId === request.id} onClick={() => void review(request, 'approved')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 text-xs font-black text-white disabled:opacity-40">
                      <CheckCircle2 size={17} /> {busyId === request.id ? 'پشکنین...' : 'ڤەریفای و پەسەندکردن'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
