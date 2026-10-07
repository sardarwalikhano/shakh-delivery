import { ArrowLeft, CheckCircle2, CircleDot, MapPin, PackageCheck, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMyOrder } from './api';
import type { Order } from './types';
import { useRealtimeDelivery, useRealtimeOrder } from '@/features/realtime/hooks';
import { buildGoogleMapsDirectionsUrl } from '@/lib/maps/navigation';

const deliverySteps: Array<{ key: NonNullable<Order['delivery']>['status']; label: string }> = [
  { key: 'assigned', label: 'کاپتن دیاری کرا' },
  { key: 'accepted', label: 'کاپتن وەریگرت' },
  { key: 'picked_up', label: 'داواکاری وەرگیرا' },
  { key: 'on_the_way', label: 'لە ڕێگایە' },
  { key: 'arrived', label: 'کاپتن گەیشت' },
  { key: 'delivered', label: 'گەیەنراوە' },
];

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => { if (id) void getMyOrder(id).then(setOrder).catch(() => undefined); }, [id]);
  useEffect(() => { if (id) void getMyOrder(id).then(setOrder).finally(() => setLoading(false)); }, [id]);
  useRealtimeOrder(id, refresh);
  useRealtimeDelivery(order?.delivery?.id, refresh);

  if (loading) return <div className="grid min-h-[65dvh] place-items-center text-sm font-bold text-black/45">بارکردن...</div>;
  if (!order) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-black">داواکاری نەدۆزرایەوە</h1><Link to="/orders" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕانەوە بۆ داواکارییەکان</Link></div>;

  const current = order.delivery?.status;
  const currentIndex = current ? deliverySteps.findIndex((step) => step.key === current) : -1;

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-black text-black/45 hover:text-black"><ArrowLeft size={17} /> داواکارییەکان</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">داواکاری</div><h1 className="mt-1 text-3xl font-black" dir="ltr">{order.order_number}</h1><div className="mt-2 text-sm font-bold text-black/45">{order.store?.name_ku ?? 'فرۆشگا'}</div></div><div className="rounded-2xl bg-white px-4 py-3 text-end shadow-sm"><div className="text-xs text-black/40">کۆی گشتی</div><div className="mt-1 text-xl font-black">{order.total_iqd.toLocaleString('en-US')} د.ع</div></div></div>

        {order.delivery ? <div className="mt-5 rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)] sm:p-6"><div className="flex items-center gap-3"><Truck size={19} className="text-[var(--shakh-orange)]" /><h2 className="text-lg font-black">شوێنی گەیاندن</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{deliverySteps.map((step, index) => <div key={step.key} className="flex items-center gap-3 rounded-2xl bg-[var(--shakh-bg)] px-4 py-3"><span className={`grid size-8 place-items-center rounded-full ${index <= currentIndex ? 'bg-[var(--shakh-navy)] text-white' : 'bg-black/5 text-black/35'}`}>{index <= currentIndex ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}</span><span className={`text-sm font-bold ${index <= currentIndex ? 'text-black' : 'text-black/35'}`}>{step.label}</span></div>)}</div>{order.delivery.last_lat && order.delivery.last_lng ? <div className="mt-4 flex items-center gap-2 text-xs font-bold text-black/45"><MapPin size={15} /> GPS: {order.delivery.last_lat.toFixed(5)}, {order.delivery.last_lng.toFixed(5)}</div> : null}</div> : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)]"><div className="flex items-center gap-3"><PackageCheck size={19} className="text-[var(--shakh-blue)]" /><h2 className="text-lg font-black">بەرهەمەکان</h2></div><div className="mt-4 space-y-3">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--shakh-bg)] p-4"><div className="min-w-0"><div className="font-black">{item.product_name_ku}</div><div className="mt-1 text-xs font-bold text-black/45">{item.quantity} × {item.unit_price_iqd.toLocaleString('en-US')} د.ع</div></div><div className="shrink-0 text-sm font-black">{item.line_total_iqd.toLocaleString('en-US')} د.ع</div></div>)}</div></div>
          <aside className="h-fit rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.035)]"><div className="flex items-start gap-3"><MapPin size={19} className="mt-0.5 text-[var(--shakh-blue)]" /><div><div className="text-sm font-black">ناونیشانی گەیاندن</div><div className="mt-2 text-sm leading-6 text-black/55">{order.delivery_address}</div></div></div>{order.delivery_lat != null && order.delivery_lng != null ? <a href={buildGoogleMapsDirectionsUrl({ latitude: order.delivery_lat, longitude: order.delivery_lng }, order.delivery?.last_lat != null && order.delivery?.last_lng != null ? { latitude: order.delivery.last_lat, longitude: order.delivery.last_lng } : null)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[var(--shakh-blue)]/8 px-4 py-3 text-xs font-black text-[var(--shakh-blue)]">کردنەوەی شوێن لە Map</a> : null}{order.customer_note ? <div className="mt-5 border-t border-black/[0.06] pt-5 text-sm"><div className="font-black">تێبینی</div><div className="mt-2 leading-6 text-black/55">{order.customer_note}</div></div> : null}</aside>
        </div>
      </div>
    </section>
  );
}
