import { ChevronLeft, PackageCheck, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMyOrders } from './api';
import type { Order } from './types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRealtimeCustomerOrders } from '@/features/realtime/hooks';

const statusLabel: Record<Order['status'], string> = {
  pending: 'لە چاوەڕوانیدایە', confirmed: 'پەسەندکرا', preparing: 'ئامادەدەکرێت', ready: 'ئامادەی گەیاندنە', out_for_delivery: 'لە ڕێگایە', delivered: 'گەیەنراوە', cancelled: 'هەڵوەشێنراوەتەوە',
};

export function OrdersPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => { if (user) void getMyOrders().then(setOrders).catch(() => undefined); }, [user]);
  useEffect(() => {
    if (!user) return;
    void getMyOrders().then(setOrders).finally(() => setLoading(false));
  }, [user, params]);
  useRealtimeCustomerOrders(user?.id, refresh);

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><PackageCheck size={21} /></div><div><div className="text-xs font-black text-[var(--shakh-blue)]">Orders</div><h1 className="text-3xl font-black">داواکارییەکانم</h1></div></div>
        {loading ? <div className="mt-6 rounded-[28px] bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : orders.length === 0 ? <div className="mt-6 rounded-[28px] bg-white p-12 text-center"><h2 className="text-xl font-black">هێشتا داواکاری نییە</h2><Link to="/search" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">دەستپێکردنی کڕین</Link></div> : (
          <div className="mt-6 space-y-3">{orders.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="block rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] hover:-translate-y-0.5 hover:shadow-lg transition">
              <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">{order.store?.name_ku ?? 'فرۆشگا'}</div><div className="mt-1 text-lg font-black" dir="ltr">{order.order_number}</div></div><ChevronLeft size={20} className="shrink-0 text-black/30" /></div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold"><span className="rounded-full bg-black/[0.04] px-3 py-1.5">{statusLabel[order.status]}</span>{order.delivery?.status === 'on_the_way' ? <span className="flex items-center gap-1 rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1.5 text-[var(--shakh-orange)]"><Truck size={14} /> لە ڕێگایە</span> : null}<span className="ms-auto text-sm font-black">{order.total_iqd.toLocaleString('en-US')} د.ع</span></div>
            </Link>
          ))}</div>
        )}
      </div>
    </section>
  );
}
