import { Check, PackageCheck, RefreshCw, Truck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { listApparelPostOrders, updateApparelPostOrderStatus, listFoodPostOrders, updateFoodPostOrderStatus, listElectronicsPostOrders, updateElectronicsPostOrderStatus, type ApparelPostOrder, type ApparelPostOrderStatus, type FoodPostOrder, type FoodPostOrderStatus, type ElectronicsPostOrder, type ElectronicsPostOrderStatus } from '../apparelOrders';
import { getVisibleCategoryDetails } from '@/lib/catalog/categoryDetails';
import { supabase } from '@/lib/supabase/client';

const labels: Record<ApparelPostOrderStatus,string> = { pending:'لە چاوەڕوانیدایە', confirmed:'پەسەندکرا', rejected:'ڕەتکرایەوە', delivered:'گەیەنراوە', cancelled:'هەڵوەشێنراوەتەوە' };
const foodDeliveryLabels: Record<string,string> = { pending:'چاوەڕوانی کاپتن', accepted:'وەرگیراوە لەلایەن کاپتن', picked_up:'لە چێشتخانە وەرگیراوە', on_the_way:'لە ڕێگایە', arrived:'گەیشتووە', delivered:'گەیەنراوە', failed:'سەرنەکەوتووە', cancelled:'هەڵوەشێنراوەتەوە' };
const electronicsColorLabels: Record<string, string> = { black: 'ڕەش', white: 'سپی', blue: 'شین', silver: 'زیوی', gray: 'خاکستەری', gold: 'زێڕی', green: 'سەوز', red: 'سوور', purple: 'مۆر', pink: 'پەمەیی', other: 'ڕەنگی تر' };

export function ApparelPostOrdersPage() {
  const { user } = useAuth();
  const { permissions } = useAuthorization();
  const location = useLocation();
  const [orders, setOrders] = useState<ApparelPostOrder[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodPostOrder[]>([]);
  const [electronicsOrders, setElectronicsOrders] = useState<ElectronicsPostOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [apparel, food, electronics] = await Promise.all([listApparelPostOrders(), listFoodPostOrders(), listElectronicsPostOrders()]);
      setOrders(apparel);
      setFoodOrders(food);
      setElectronicsOrders(electronics);
    } catch (err) { setError(err instanceof Error ? err.message : 'نەتوانرا داواکارییەکان بخوێندرێنەوە.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, user]);
  useEffect(() => {
    const channel = supabase.channel('post-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apparel_post_orders' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_post_orders' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'electronics_post_orders' }, () => { void refresh(); })
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

  const setFoodStatus = async (order: FoodPostOrder, status: FoodPostOrderStatus) => {
    setBusyId(order.id);
    setError(null);
    setMessage(null);
    try {
      await updateFoodPostOrderStatus(order.id, status);
      setMessage('دۆخی داواکاری خواردن نوێ کرایەوە.');
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'گۆڕینی دۆخی داواکاری سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };
  const setElectronicsStatus = async (order: ElectronicsPostOrder, status: ElectronicsPostOrderStatus) => {
    setBusyId(order.id);
    setError(null);
    setMessage(null);
    try {
      await updateElectronicsPostOrderStatus(order.id, status);
      setMessage(status === 'delivered'
        ? 'گەیاندن و وەرگرتنی پارە پشتڕاست کرایەوە؛ خەڵاتی شێرکردن بەپێی مەرجەکان هەژمار دەکرێت.'
        : 'دۆخی داواکاریی ئەلیکترۆنیات نوێ کرایەوە.');
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'گۆڕینی دۆخی داواکاری سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };


  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs font-black text-[var(--shakh-blue)]">SHAKH Post orders</div><h1 className="mt-1 text-3xl font-black">داواکارییەکانی پۆست</h1><p className="mt-2 text-sm leading-6 text-black/50">داواکاریی پۆستەکانی جل‌وبەرگ، خواردن و ئەلیکترۆنیات لێرە بەڕێوەدەچن.</p></div><button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-black"><RefreshCw size={16}/> نوێکردنەوە</button></div>
        {location.state?.orderCreated ? <div role="status" className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">داواکارییەکەت تۆمارکرا؛ فرۆشیار دەتوانێت پەسەندی بکات.</div> : null}
        {error ? <div role="alert" className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div role="status" className="mt-4 rounded-2xl bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">{message}</div> : null}
        {loading ? <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm font-bold text-black/45">بارکردن...</div> : orders.length === 0 && foodOrders.length === 0 && electronicsOrders.length === 0 ? <div className="mt-6 rounded-[28px] bg-white p-12 text-center"><PackageCheck size={30} className="mx-auto text-black/25"/><h2 className="mt-3 text-xl font-black">هێشتا داواکاریی پۆست نییە</h2><Link to="/posts" className="mt-5 inline-flex rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white">گەڕان بۆ کاڵاکان</Link></div> : (
          <div className="mt-6 space-y-3">{orders.map((order) => {
            const seller = order.seller_id === user?.id || permissions.has('posts.manage');
            const buyer = order.buyer_id === user?.id;
            return <article key={order.id} className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black text-[var(--shakh-blue)]" dir="ltr">{order.order_number}</div><h2 className="mt-1 text-lg font-black">{order.post_title}</h2><div className="mt-1 text-xs font-bold text-black/45">{order.color_name} / {order.size_label} · {order.quantity} دانە</div></div><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{labels[order.status]}</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div className="text-xs text-black/40">وەسڵ و حیساب</div><div className="mt-2 space-y-1 text-xs text-black/55"><div className="flex justify-between"><span>کۆی کاڵا</span><span>{Number(order.line_total_iqd).toLocaleString('en-US')} د.ع</span></div><div className="flex justify-between"><span>گەیاندن</span><span>{Number(order.delivery_fee_iqd).toLocaleString('en-US')} د.ع</span></div><div className="flex justify-between"><span>پلاتفۆرم</span><span>{Number(order.platform_fee_iqd).toLocaleString('en-US')} د.ع</span></div></div><strong className="mt-2 flex justify-between border-t border-black/10 pt-2"><span>کۆی گشتی</span><span>{Number(order.total_iqd).toLocaleString('en-US')} د.ع</span></strong></div><div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div className="text-xs text-black/40">{seller ? 'زانیاریی کڕیار' : 'ناونیشانی گەیاندن'}</div><div className="mt-1 font-bold">{seller ? order.buyer_phone : order.delivery_address}</div><div className="mt-1 text-xs font-bold text-black/45">{order.delivery_city}</div>{seller ? <div className="mt-1 text-xs text-black/45">{order.delivery_address}</div> : null}</div></div>
              {order.customer_note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/55">{order.customer_note}</p> : null}
              {seller && order.status === 'pending' ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'confirmed')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={15}/>پەسەندکردن</button><button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50"><XCircle size={15}/>ڕەتکردنەوە</button></div> : null}
              {seller && order.status === 'confirmed' ? <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'delivered')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Truck size={15}/>تۆمارکردنی گەیاندن</button> : null}
              {buyer && order.status === 'pending' ? <button type="button" disabled={busyId === order.id} onClick={() => void setStatus(order,'cancelled')} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50">هەڵوەشاندنەوەی داواکاری</button> : null}
            </article>;
          })}</div>
        )}
        {!loading && electronicsOrders.length > 0 ? <section className="mt-8">
          <div><div className="text-xs font-black text-[var(--shakh-blue)]">SHAKH Electronics</div><h2 className="mt-1 text-2xl font-black">داواکارییەکانی ئەلیکترۆنیات</h2></div>
          <div className="mt-4 space-y-3">{electronicsOrders.map((order) => {
            const seller = order.seller_id === user?.id || permissions.has('posts.manage');
            const buyer = order.buyer_id === user?.id;
            return (
              <article key={order.id} className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-[var(--shakh-blue)]" dir="ltr">{order.order_number}</div>
                    <h3 className="mt-1 text-lg font-black">{order.post_title}</h3>
                    <p className="mt-1 text-xs font-bold text-black/45">{order.brand} · {order.quantity} دانە</p>
                    {order.selected_color ? <p className="mt-1 text-xs font-black text-[var(--shakh-blue)]">ڕەنگی داواکراو: {electronicsColorLabels[order.selected_color] ?? order.selected_color}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{labels[order.status]}</span>
                    <span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{order.payment_status === 'collected' ? 'پارە وەرگیراوە' : 'چاوەڕوانی پارەدان'}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {getVisibleCategoryDetails('electronics', order.product_details).filter((item) => item.key !== 'stock_quantity').map((item) => (
                    <span key={item.key} className="rounded-lg bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-bold">{item.label}: {item.value}</span>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm">
                    <div className="text-xs text-black/40">وەسڵ و حیساب</div>
                    <div className="mt-2 space-y-1 text-xs text-black/55">
                      <div className="flex justify-between"><span>کۆی کاڵا</span><span>{Number(order.line_total_iqd).toLocaleString('en-US')} د.ع</span></div>
                      <div className="flex justify-between"><span>گەیاندن</span><span>{Number(order.delivery_fee_iqd).toLocaleString('en-US')} د.ع</span></div>
                      <div className="flex justify-between"><span>پلاتفۆرم</span><span>{Number(order.platform_fee_iqd).toLocaleString('en-US')} د.ع</span></div>
                    </div>
                    <strong className="mt-2 flex justify-between border-t border-black/10 pt-2"><span>کۆی گشتی</span><span>{Number(order.total_iqd).toLocaleString('en-US')} د.ع</span></strong>
                    {order.share_reward_iqd > 0 ? <p className="mt-2 text-xs font-bold text-emerald-700">خەڵاتی شێرکردن: {Number(order.share_reward_iqd).toLocaleString('en-US')} د.ع؛ دوای تەواوبوونی فرۆشتن.</p> : null}
                  </div>
                  <div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm">
                    <div className="text-xs text-black/40">{seller ? 'زانیاریی کڕیار' : 'ناونیشانی گەیاندن'}</div>
                    <div className="mt-1 font-bold">{seller ? order.buyer_phone : order.delivery_address}</div>
                    <div className="mt-1 text-xs font-bold text-black/45">{order.delivery_city}</div>
                    {seller ? <div className="mt-1 text-xs text-black/45">{order.delivery_address}</div> : null}
                  </div>
                </div>
                {order.customer_note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/55">{order.customer_note}</p> : null}
                {seller && order.status === 'pending' ? <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === order.id} onClick={() => void setElectronicsStatus(order, 'confirmed')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={15}/>پەسەندکردن</button>
                  <button type="button" disabled={busyId === order.id} onClick={() => void setElectronicsStatus(order, 'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50"><XCircle size={15}/>ڕەتکردنەوە</button>
                </div> : null}
                {seller && order.status === 'confirmed' ? <button type="button" disabled={busyId === order.id} onClick={() => void setElectronicsStatus(order, 'delivered')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Truck size={15}/>گەیاندن و پشتڕاستکردنەوەی پارەدان</button> : null}
                {buyer && order.status === 'pending' ? <button type="button" disabled={busyId === order.id} onClick={() => void setElectronicsStatus(order, 'cancelled')} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50">هەڵوەشاندنەوەی داواکاری</button> : null}
              </article>
            );
          })}</div>
        </section> : null}

        {!loading && foodOrders.length > 0 ? <section className="mt-8">
          <div><div className="text-xs font-black text-[var(--shakh-orange)]">SHAKH Restaurant</div><h2 className="mt-1 text-2xl font-black">داواکارییەکانی چێشتخانە</h2></div>
          <div className="mt-4 space-y-3">{foodOrders.map((order) => {
            const seller = order.seller_id === user?.id || permissions.has('posts.manage');
            const buyer = order.buyer_id === user?.id;
            return <article key={order.id} className="rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black text-[var(--shakh-blue)]" dir="ltr">{order.order_number}</div><h3 className="mt-1 text-lg font-black">{order.post_title}</h3><div className="mt-1 text-xs font-bold text-black/45">{order.quantity} دانە · {Number(order.unit_price_iqd).toLocaleString('en-US')} د.ع بۆ هەر دانە</div></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{labels[order.status]}</span><span className="rounded-full bg-[var(--shakh-bg)] px-3 py-1.5 text-xs font-black">{foodDeliveryLabels[order.delivery_status]}</span></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div className="text-xs text-black/40">وەسڵ و حیساب</div><div className="mt-2 space-y-1 text-xs text-black/55"><div className="flex justify-between"><span>کۆی خواردن</span><span>{Number(order.line_total_iqd).toLocaleString('en-US')} د.ع</span></div><div className="flex justify-between"><span>گەیاندن</span><span>{Number(order.delivery_fee_iqd).toLocaleString('en-US')} د.ع</span></div><div className="flex justify-between"><span>پلاتفۆرم</span><span>{Number(order.platform_fee_iqd).toLocaleString('en-US')} د.ع</span></div></div><strong className="mt-2 flex justify-between border-t border-black/10 pt-2"><span>کۆی گشتی</span><span>{Number(order.total_iqd).toLocaleString('en-US')} د.ع</span></strong><div className="mt-2 text-xs font-bold text-black/50">{order.payment_status === 'collected' && order.payment_event?.[0] ? `پارە وەرگیرا: ${Number(order.payment_event[0].amount_iqd).toLocaleString('en-US')} د.ع · ${new Date(order.payment_event[0].received_at).toLocaleString()}` : 'پارە لە کاتی گەیاندن وەردەگیرێت.'}</div>{order.captain_id ? <div className="mt-1 text-xs font-bold text-emerald-700">کاپتن وەرگرتووە و تۆماری پارەی لەسەرە.</div> : null}</div><div className="rounded-xl bg-[var(--shakh-bg)] p-3 text-sm"><div className="text-xs text-black/40">{seller ? 'زانیاریی کڕیار' : 'ناونیشانی گەیاندن'}</div><div className="mt-1 font-bold">{seller ? order.buyer_phone : order.delivery_address}</div><div className="mt-1 text-xs font-bold text-black/45">{order.delivery_city}</div>{seller ? <div className="mt-1 text-xs text-black/45">{order.delivery_address}</div> : null}</div></div>
              {order.customer_note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/55">{order.customer_note}</p> : null}
              {seller && order.status === 'pending' ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyId === order.id} onClick={() => void setFoodStatus(order,'confirmed')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><Check size={15}/>پەسەندکردن</button><button type="button" disabled={busyId === order.id} onClick={() => void setFoodStatus(order,'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50"><XCircle size={15}/>ڕەتکردنەوە</button></div> : null}
              {seller && order.status === 'confirmed' ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold leading-6 text-emerald-800">وەسڵ و کۆی پارە بۆ کاپتن ئامادەیە؛ دۆخی گەیاندن و وەرگرتنی پارە لە بەشی گەیاندن تۆمار دەکرێت.</div> : null}
              {buyer && order.status === 'pending' ? <button type="button" disabled={busyId === order.id} onClick={() => void setFoodStatus(order,'cancelled')} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-50">هەڵوەشاندنەوەی داواکاری</button> : null}
            </article>;
          })}</div>
        </section> : null}
      </div>
    </section>
  );
}

