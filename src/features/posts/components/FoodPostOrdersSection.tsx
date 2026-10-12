import { Check, PackageCheck, RefreshCw, Truck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { supabase } from '@/lib/supabase/client';
import { listFoodPostOrders, updateFoodPostOrderStatus, type FoodPostOrder, type FoodPostOrderStatus } from '../foodPostOrders';

const statusLabels: Record<FoodPostOrderStatus, string> = {
  pending: 'لە چاوەڕوانیدایە',
  confirmed: 'پەسەندکرا',
  rejected: 'ڕەتکرایەوە',
  delivered: 'گەیەنراوە',
  cancelled: 'هەڵوەشێنراوەتەوە',
};

export function FoodPostOrdersSection() {
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const [orders, setOrders] = useState<FoodPostOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listFoodPostOrders());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا داواکاریی خواردن بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, user?.id]);

  useEffect(() => {
    const channel = supabase.channel('food-post-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_post_orders' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const setStatus = async (order: FoodPostOrder, status: FoodPostOrderStatus) => {
    setBusyId(order.id);
    setError(null);
    setMessage(null);
    try {
      await updateFoodPostOrderStatus(order.id, status);
      setMessage('دۆخی داواکاریی خواردن نوێ کرایەوە؛ ئاگادارکردنەوە بۆ لایەنی پەیوەندیدار نێردرا.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'گۆڕینی دۆخی داواکاری سەرنەکەوت.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-8 border-t border-black/[0.06] pt-8" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-black text-[var(--shakh-orange)]">SHAKH Food post orders</div>
          <h2 className="mt-1 text-2xl font-black">داواکارییەکانی خواردن</h2>
          <p className="mt-2 text-sm leading-6 text-black/50">داواکارییەکانی پۆستی خواردن لێرە دەبینیت؛ خاوەن پۆست دەتوانێت پەسەند/ڕەت بکاتەوە و کڕیار دۆخەکەی ببینێت.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-black"><RefreshCw size={15}/> نوێکردنەوە</button>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {message ? <div role="status" className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}

      {loading ? <div className="mt-5 rounded-2xl bg-white p-8 text-center text-sm font-bold text-black/45">بارکردنی داواکاریی خواردن...</div>
        : orders.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-black/10 bg-white p-8 text-center">
            <PackageCheck size={28} className="mx-auto text-black/25"/>
            <h3 className="mt-3 font-black">هێشتا داواکاریی خواردن نییە</h3>
            <p className="mt-1 text-sm leading-6 text-black/45">کاتێک کڕیار داوای خواردن بکات، لێرەدا دەردەکەوێت.</p>
            <Link to="/posts?category=food" className="mt-4 inline-flex rounded-xl bg-[var(--shakh-navy)] px-4 py-2.5 text-xs font-black text-white">بینینی پۆستەکانی خواردن</Link>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {orders.map((order) => {
              const seller = order.seller_id === user?.id || permissions.has('posts.manage');
              const buyer = order.buyer_id === user?.id;
              return (
                <article key={order.id} className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-[var(--shakh-blue)]" dir="ltr">{order.order_number}</div>
                      <h3 className="mt-1 text-lg font-black">{order.post_title}</h3>
                      <p className="mt-1 text-xs font-bold text-black/45">{order.quantity} دانە · {order.payment_method === 'mobile_cash' ? 'Mobile Cash (چاوەڕوانی چالاککردن)' : 'پارەدان لە کاتی گەیاندن'}</p>
                    </div>
                    <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{statusLabels[order.status]}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm">
                      <div className="text-xs text-black/40">نرخی یەک دانە / کۆ</div>
                      <strong className="mt-1 block">{Number(order.unit_price_iqd).toLocaleString('en-US')} د.ع × {order.quantity}</strong>
                      <strong className="mt-1 block text-lg">{Number(order.line_total_iqd).toLocaleString('en-US')} د.ع</strong>
                    </div>
                    <div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm">
                      <div className="text-xs text-black/40">{seller ? 'زانیاریی کڕیار' : 'ناونیشانی گەیاندن'}</div>
                      {seller ? <><strong className="mt-1 block" dir="ltr">{order.buyer_phone}</strong><div className="mt-1 text-xs text-black/60">{order.delivery_address}</div></> : <strong className="mt-1 block">{order.delivery_address}</strong>}
                    </div>
                  </div>
                  {order.customer_note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/55">تێبینی: {order.customer_note}</p> : null}
                  {seller && order.status === 'pending' ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order, 'confirmed')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={15}/>پەسەندکردن</button>
                      <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order, 'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50"><XCircle size={15}/>ڕەتکردنەوە</button>
                    </div>
                  ) : null}
                  {seller && order.status === 'confirmed' ? <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order, 'delivered')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Truck size={15}/>تۆمارکردنی گەیاندن</button> : null}
                  {buyer && order.status === 'pending' ? <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order, 'cancelled')} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50">هەڵوەشاندنەوەی داواکاری</button> : null}
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}
