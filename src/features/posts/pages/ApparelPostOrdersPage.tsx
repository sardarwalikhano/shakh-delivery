import { Check, PackageCheck, RefreshCw, Truck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { listApparelPostOrders, updateApparelPostOrderStatus, type ApparelPostOrder, type ApparelPostOrderStatus } from '../apparelOrders';
import { supabase } from '@/lib/supabase/client';

const labels: Record<ApparelPostOrderStatus,string> = { pending:'لە چاوەڕوانیدایە', confirmed:'پەسەندکرا', rejected:'ڕەتکرایەوە', delivered:'گەیەنراوە', cancelled:'هەڵوەشێنراوەتەوە' };

export function ApparelPostOrdersPage() {
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const location = useLocation();
  const [orders, setOrders] = useState<ApparelPostOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try { setOrders(await listApparelPostOrders()); }
    catch (err) { setError(err instanceof Error ? err.message : 'نەتوانرا داواکارییەکان بخوێندرێنەوە.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, user]);
  useEffect(() => {
    const channel = supabase.channel('apparel-post-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apparel_post_orders' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const setStatus = async (order: ApparelPostOrder, status: ApparelPostOrderStatus) => {
    setBusyId(order.id);
    setError(null);
    setMessage(null);
    try {
      await updateApparelPostOrderStatus(order.id, status);
      setMessage('دۆخی داواکاری نوێ کرایەوە و کۆگا بەپێی پێویست نوێکرایەوە.');
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'گۆڕینی دۆخی داواکاری سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">SHAKH Apparel orders</div><h1 className="mt-1 text-3xl font-black">داواکارییەکانی جل‌وبەرگ</h1><p className="mt-2 text-sm leading-6 text-black/50">داواکارییەکانی کڕین و فرۆشتنی پۆستەکانی جل‌وبەرگ؛ کڕین و کۆگا بە RPC ـی پارێزراوی Supabase بەڕێوەدەچن.</p></div><button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-black"><RefreshCw size={16}/> نوێکردنەوە</button></div>
        {location.state?.orderCreated ? <div role="status" className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">داواکارییەکەت تۆمارکرا؛ فرۆشیار دەتوانێت پەسەندی بکات.</div> : null}
        {error ? <div role="alert" className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {loading ? <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : orders.length === 0 ? <div className="mt-6 rounded-[28px] bg-white p-12 text-center"><PackageCheck size={30} className="mx-auto text-black/25"/><h2 className="mt-3 text-xl font-black">هێشتا داواکاریی جل‌وبەرگ نییە</h2><Link to="/posts" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕان بۆ کاڵاکان</Link></div> : (
          <div className="mt-6 space-y-3">{orders.map((order) => {
            const seller = order.seller_id === user?.id || permissions.has('posts.manage');
            const buyer = order.buyer_id === user?.id;
            return <article key={order.id} className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black text-[var(--shakh-blue)]" dir="ltr">{order.order_number}</div><h2 className="mt-1 text-lg font-black">{order.post_title}</h2><div className="mt-1 text-xs font-bold text-black/45">{order.color_name} / {order.size_label} · {order.quantity} دانە</div></div><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{labels[order.status]}</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div className="text-xs text-black/40">کۆی نرخ</div><strong className="mt-1 block">{Number(order.line_total_iqd).toLocaleString('en-US')} د.ع</strong></div><div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div className="text-xs text-black/40">{seller ? 'زانیاریی کڕیار' : 'ناونیشانی گەیاندن'}</div><div className="mt-1 font-bold">{seller ? order.buyer_phone : order.delivery_address}</div>{seller ? <div className="mt-1 text-xs text-black/45">{order.delivery_address}</div> : null}</div></div>
              {order.customer_note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/55">{order.customer_note}</p> : null}
              {seller && order.status === 'pending' ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'confirmed')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={15}/>پەسەندکردن</button><button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50"><XCircle size={15}/>ڕەتکردنەوە</button></div> : null}
              {seller && order.status === 'confirmed' ? <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'delivered')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Truck size={15}/>تۆمارکردنی گەیاندن</button> : null}
              {buyer && order.status === 'pending' ? <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'cancelled')} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50">هەڵوەشاندنەوەی داواکاری</button> : null}
            </article>;
          })}</div>
        )}
      </div>
    </section>
  );
}
