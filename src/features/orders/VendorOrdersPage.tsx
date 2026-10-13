import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Check, ChevronLeft, Clock3, PackageCheck, RefreshCw, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMyOrders, updateStoreOrderStatus } from './api';
import type { Order, OrderStatus } from './types';
import { supabase } from '@/lib/supabase/client';

const statusLabel: Record<OrderStatus, string> = {
  pending: 'نوێ', confirmed: 'پەسەندکرا', preparing: 'ئامادەدەکرێت', ready: 'ئامادەیە',
  out_for_delivery: 'لە ڕێگایە', delivered: 'گەیەنراوە', cancelled: 'هەڵوەشێنراوەتەوە',
};
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready' };
const nextLabel: Partial<Record<OrderStatus, string>> = { pending: 'پەسەندکردنی ئۆردەر', confirmed: 'دەستپێکردنی ئامادەکردن', preparing: 'ئامادەیە — ئاگادارکردنەوەی کڕیار' };

export function VendorOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'active' | 'ready' | 'all'>('active');

  const refresh = useCallback(async () => {
    setError('');
    try { setOrders(await getMyOrders()); }
    catch { setError('نەتوانرا ئۆردەرەکان باربکرێن. تکایە دووبارە هەوڵ بدەوە.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const channel = supabase.channel('vendor-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const visible = useMemo(() => orders.filter((order) => {
    if (filter === 'ready') return order.status === 'ready';
    if (filter === 'active') return ['pending', 'confirmed', 'preparing'].includes(order.status);
    return true;
  }), [filter, orders]);

  const advance = async (order: Order) => {
    const status = nextStatus[order.status];
    if (!status) return;
    setBusyId(order.id);
    setError('');
    try {
      await updateStoreOrderStatus(order.id, status);
      await refresh();
    } catch {
      setError('گۆڕینی دۆخی ئۆردەر سەرکەوتوو نەبوو. دووبارە هەوڵ بدەوە.');
    } finally { setBusyId(null); }
  };

  const activeCount = orders.filter((order) => ['pending', 'confirmed', 'preparing'].includes(order.status)).length;
  const readyCount = orders.filter((order) => order.status === 'ready').length;

  return <section className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-[30px] bg-[var(--shakh-navy)] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="flex items-center gap-2 text-sm font-black text-white/60"><Store size={16}/> بەڕێوەبردنی فرۆشگا</div><h1 className="mt-2 text-3xl font-black sm:text-4xl">ئۆردەرەکان</h1><p className="mt-2 max-w-xl text-sm leading-7 text-white/60">لە کاتی هاتنی ئۆردەری نوێ، ئاگادار دەکرێیتەوە. کاتێک ئامادەی کرد، کڕیار بە خۆکار ئاگادار دەکرێتەوە.</p></div>
          <button onClick={() => void refresh()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-black hover:bg-white/15"><RefreshCw size={16}/> نوێکردنەوە</button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/10 p-4"><div className="text-xs font-bold text-white/55">لە کاردان</div><div className="mt-1 text-2xl font-black">{activeCount}</div></div><div className="rounded-2xl bg-white/10 p-4"><div className="text-xs font-bold text-white/55">ئامادەی وەرگرتن</div><div className="mt-1 text-2xl font-black">{readyCount}</div></div></div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="فلتەری ئۆردەرەکان">
          {([['active','لە کاردان'],['ready','ئامادەیە'],['all','هەموو']] as const).map(([value,label]) => <button key={value} role="tab" aria-selected={filter===value} onClick={() => setFilter(value)} className={`min-h-10 rounded-xl px-4 text-xs font-black ${filter===value?'bg-[var(--shakh-navy)] text-white':'bg-white text-black/55'}`}>{label}</button>)}
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-bold text-black/40"><BellRing size={15}/> نوێبوونەوەی دۆخ لە ئاگادارکردنەوەکاندا دەردەکەوێت</span>
      </div>

      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-[28px] bg-white p-10 text-center text-sm font-bold text-black/45">بارکردنی ئۆردەرەکان...</div> : visible.length === 0 ? <div className="rounded-[28px] border border-dashed border-black/10 bg-white p-12 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><PackageCheck size={24}/></div><h2 className="mt-4 text-xl font-black">ئۆردەر نییە</h2><p className="mt-2 text-sm text-black/45">کاتێک ئۆردەرێکی نوێ بگات، لێرە دەرکەوێت.</p></div> : <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(order => <article key={order.id} className="rounded-[26px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)]">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black text-[var(--shakh-blue)]">{order.store?.name_ku ?? 'فرۆشگا'}</div><h2 className="mt-1 text-xl font-black" dir="ltr">{order.order_number}</h2></div><span className="rounded-full bg-[var(--shakh-orange)]/10 px-3 py-1.5 text-xs font-black text-[var(--shakh-orange)]">{statusLabel[order.status]}</span></div>
          <div className="mt-3 flex items-center gap-2 text-xs font-bold text-black/40"><Clock3 size={14}/>{new Intl.DateTimeFormat('ku-IQ',{dateStyle:'medium',timeStyle:'short'}).format(new Date(order.created_at))}</div>
          <div className="mt-4 divide-y divide-black/[0.06] rounded-2xl bg-[var(--shakh-bg)] px-4">{order.items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-bold">{item.product_name_ku}{item.variant && !Array.isArray(item.variant) ? ` — ${item.variant.name_ku}` : ''}<span className="ms-2 text-xs text-black/40">× {item.quantity}</span></span><span className="shrink-0 text-xs font-black">{item.line_total_iqd.toLocaleString('en-US')} د.ع</span></div>)}</div>
          {order.customer_note ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">تێبینی کڕیار: {order.customer_note}</p> : null}
          <div className="mt-4 flex items-center justify-between gap-3"><strong className="text-base">{order.total_iqd.toLocaleString('en-US')} د.ع</strong><div className="flex gap-2">{order.status==='ready' ? <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><Check size={14}/> کڕیار ئاگادارکراوەتەوە</span> : null}{nextStatus[order.status] ? <button disabled={busyId===order.id} onClick={() => void advance(order)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 text-xs font-black text-white disabled:opacity-50">{busyId===order.id?'چاوەڕوانبە':nextLabel[order.status]}<ChevronLeft size={15}/></button> : <Link to={`/orders/${order.id}`} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-black/[0.04] px-3 text-xs font-black">وردەکاری<ChevronLeft size={15}/></Link>}</div></div>
        </article>)}
      </div>}
    </div>
  </section>;
}

