import { ChevronLeft, PackageCheck, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMyOrders } from './api';
import type { Order } from './types';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRealtimeCustomerOrders } from '@/features/realtime/hooks';
import {
  listApparelPostOrders,
  listElectronicsPostOrders,
  listFoodPostOrders,
} from '@/features/posts/apparelOrders';
import { postCategoryLabels } from '@/features/posts/labels';
import { supabase } from '@/lib/supabase/client';

const statusLabel: Record<Order['status'], string> = {
  pending: 'لە چاوەڕوانیدایە',
  confirmed: 'پەسەندکرا',
  preparing: 'ئامادەدەکرێت',
  ready: 'ئامادەی گەیاندنە',
  out_for_delivery: 'لە ڕێگایە',
  delivered: 'گەیەنراوە',
  cancelled: 'هەڵوەشێنراوەتەوە',
};

type PostOrderSummary = {
  id: string;
  order_number: string;
  post_title: string;
  category: string;
  quantity: number;
  total_iqd: number;
  status: string;
  delivery_status: string;
  payment_status: string;
  created_at: string;
  color?: string | null;
  size?: string | null;
};

const postStatusLabel: Record<string, string> = {
  pending: 'چاوەڕوانی پەسەندکردنی فرۆشیار',
  confirmed: 'پەسەندکرا — چاوەڕوانی کاپتن',
  rejected: 'ڕەتکرایەوە',
  delivered: 'گەیەنراوە',
  cancelled: 'هەڵوەشاوەتەوە',
};

const postDeliveryStatusLabel: Record<string, string> = {
  pending: 'چاوەڕوانی کاپتن',
  accepted: 'کاپتن وەریگرتووە',
  picked_up: 'کاڵا وەرگیراوە',
  on_the_way: 'کاپتن لە ڕێگایە',
  arrived: 'کاپتن گەیشتووە',
  delivered: 'گەیاندن تەواو بوو',
  failed: 'گەیاندن سەرنەکەوت',
  cancelled: 'گەیاندن هەڵوەشایەوە',
};

const paymentStatusLabel: Record<string, string> = {
  pending: 'چاوەڕوانی پارەدان لە کاتی گەیاندن',
  collected: 'پارە وەرگیراوە',
  failed: 'پارەدان سەرنەکەوت',
  refunded: 'پارە گەڕێندرایەوە',
};

function formatPostOrder(order: {
  id: string;
  order_number: string;
  post_title: string;
  quantity: number;
  total_iqd: number;
  status: string;
  delivery_status: string;
  payment_status: string;
  created_at: string;
  post_category?: string;
  color_name?: string | null;
  size_label?: string | null;
}, category: string): PostOrderSummary {
  return {
    id: order.id,
    order_number: order.order_number,
    post_title: order.post_title,
    category: order.post_category ?? category,
    quantity: order.quantity,
    total_iqd: Number(order.total_iqd),
    status: order.status,
    delivery_status: order.delivery_status,
    payment_status: order.payment_status,
    created_at: order.created_at,
    color: order.color_name ?? null,
    size: order.size_label ?? null,
  };
}

export function OrdersPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [postOrders, setPostOrders] = useState<PostOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [storeOrders, apparelOrders, foodOrders, productOrders] = await Promise.all([
        getMyOrders(),
        listApparelPostOrders(),
        listFoodPostOrders(),
        listElectronicsPostOrders(),
      ]);
      setOrders(storeOrders);
      const nextPostOrders: PostOrderSummary[] = [
        ...apparelOrders
          .filter((order) => order.buyer_id === user.id)
          .map((order) => formatPostOrder(order, 'fashion')),
        ...foodOrders
          .filter((order) => order.buyer_id === user.id)
          .map((order) => formatPostOrder(order, 'food')),
        ...productOrders
          .filter((order) => order.buyer_id === user.id)
          .map((order) => formatPostOrder(order, order.post_category)),
      ];
      setPostOrders(nextPostOrders.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا داواکارییەکان بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh, params]);
  const refreshFromRealtime = useCallback(() => { void refresh(); }, [refresh]);
  useRealtimeCustomerOrders(user?.id, refreshFromRealtime);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('customer-direct-post-orders:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apparel_post_orders', filter: 'buyer_id=eq.' + user.id }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_post_orders', filter: 'buyer_id=eq.' + user.id }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'electronics_post_orders', filter: 'buyer_id=eq.' + user.id }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, user]);

  const isEmpty = orders.length === 0 && postOrders.length === 0;

  return (
    <section className="shakh-page py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><PackageCheck size={21} /></div><div><div className="text-xs font-black text-[var(--shakh-blue)]">Orders</div><h1 className="text-3xl font-black">داواکارییەکانم</h1><p className="mt-1 text-sm text-black/45">ئۆردەری فرۆشگا و داواکاریی پۆستەکانت لێرە دەبینیت.</p></div></div>
        {error ? <div role="alert" className="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {loading ? <div className="mt-6 rounded-[28px] bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : isEmpty ? <div className="mt-6 rounded-[28px] bg-white p-12 text-center"><h2 className="text-xl font-black">هێشتا داواکاری نییە</h2><Link to="/search" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">دەستپێکردنی کڕین</Link></div> : (
          <div className="mt-6 space-y-3">
            {orders.map((order) => (
              <Link key={'store:' + order.id} to={`/orders/${order.id}`} className="block rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">{order.store?.name_ku ?? 'فرۆشگا'}</div><div className="mt-1 text-lg font-black" dir="ltr">{order.order_number}</div></div><ChevronLeft size={20} className="shrink-0 text-black/30" /></div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold"><span className="rounded-full bg-black/[0.04] px-3 py-1.5">{statusLabel[order.status]}</span>{order.delivery?.status === 'on_the_way' ? <span className="flex items-center gap-1 rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1.5 text-[var(--shakh-orange)]"><Truck size={14} /> لە ڕێگایە</span> : null}<span className="ms-auto text-sm font-black">{order.total_iqd.toLocaleString('en-US')} د.ع</span></div>
              </Link>
            ))}
            {postOrders.map((order) => (
              <article key={'post:' + order.id} className="rounded-[26px] border border-[var(--shakh-blue)]/15 bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[var(--shakh-blue)]" dir="ltr">{order.order_number}</div>
                    <h2 className="mt-1 text-lg font-black">{order.post_title}</h2>
                    <div className="mt-1 text-xs text-black/45">{postCategoryLabels[order.category as keyof typeof postCategoryLabels] ?? order.category} · {order.quantity} دانە{order.color ? ' · ' + order.color : ''}{order.size ? ' / ' + order.size : ''}</div>
                  </div>
                  <span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1.5 text-xs font-black text-[var(--shakh-orange)]">{postStatusLabel[order.status] ?? order.status}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-[var(--shakh-blue)]/10 px-3 py-1.5 text-[var(--shakh-blue)]">{postDeliveryStatusLabel[order.delivery_status] ?? order.delivery_status}</span>
                  <span className="rounded-full bg-black/[0.04] px-3 py-1.5">{paymentStatusLabel[order.payment_status] ?? order.payment_status}</span>
                  <span className="ms-auto text-sm font-black">{order.total_iqd.toLocaleString('en-US')} د.ع</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
                  <span className="text-xs text-black/40">{new Date(order.created_at).toLocaleString()}</span>
                  <Link to="/post-orders" className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-black/10 px-3 py-2 text-xs font-black">وردەکاری و دۆخ<ChevronLeft size={14}/></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
