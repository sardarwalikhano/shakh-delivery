import { Check, ChevronDown, CircleAlert, Clock3, LocateFixed, MapPin, Navigation, PackageCheck, RefreshCw, Truck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import { assignCaptain, claimDelivery, getAvailableCaptains, getDispatchDeliveries, getMyDeliveries, updateCaptainDelivery, updateCaptainLocation, type Captain, type Delivery, type DeliveryStatus } from '../api';
import { useRealtimeCaptainDeliveries } from '@/features/realtime/hooks';
import { buildGoogleMapsDirectionsUrl } from '@/lib/maps/navigation';
import { claimFoodPostDelivery, listFoodPostOrders, recordFoodPostPayment, updateFoodPostDeliveryStatus, listApparelPostOrders, listElectronicsPostOrders, claimDirectPostDelivery, updateDirectPostDeliveryStatus, recordDirectPostPayment, type FoodPostDeliveryStatus, type FoodPostOrder, type ApparelPostOrder, type ElectronicsPostOrder, type DirectPostDeliveryStatus, type DirectPostOrderType } from '@/features/posts/apparelOrders';
import { supabase } from '@/lib/supabase/client';

const statusLabel: Record<DeliveryStatus, string> = {
  pending: 'لە چاوەڕوانی',
  assigned: 'سپێردراو',
  accepted: 'وەرگیراوە',
  picked_up: 'لە فڕۆشگا وەرگیراوە',
  on_the_way: 'لە ڕێگایە',
  arrived: 'گەیشتووە',
  delivered: 'گەیەنراوە',
  failed: 'سەرنەکەوتووە',
  cancelled: 'هەڵوەشێنراوەتەوە',
};

const nextStatus: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  assigned: 'accepted',
  accepted: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'arrived',
  arrived: 'delivered',
};

const nextFoodDeliveryStatus: Partial<Record<FoodPostDeliveryStatus, FoodPostDeliveryStatus>> = {
  accepted: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'arrived',
  arrived: 'delivered',
};
const foodDeliveryStatusLabel: Record<FoodPostDeliveryStatus, string> = {
  pending: 'لە چاوەڕوانی', accepted: 'وەرگیراوە', picked_up: 'لە چێشتخانە وەرگیراوە',
  on_the_way: 'لە ڕێگایە', arrived: 'گەیشتووە', delivered: 'گەیەنراوە', failed: 'سەرنەکەوتووە', cancelled: 'هەڵوەشێنراوەتەوە',
};

const statusTone: Record<DeliveryStatus, string> = {
  pending: 'bg-black/[0.05] text-black/55',
  assigned: 'bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]',
  accepted: 'bg-[var(--shakh-blue)]/10 text-[var(--shakh-blue)]',
  picked_up: 'bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]',
  on_the_way: 'bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]',
  arrived: 'bg-[var(--shakh-green)]/10 text-[var(--shakh-green)]',
  delivered: 'bg-[var(--shakh-green)]/10 text-[var(--shakh-green)]',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-red-50 text-red-600',
};


type DirectCaptainOrder = {
  id: string;
  order_type: DirectPostOrderType;
  order_number: string;
  post_title: string;
  quantity: number;
  delivery_city: string;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  buyer_phone: string;
  line_total_iqd: number;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_iqd: number;
  payment_method: 'cash_on_delivery' | 'mobile_cash';
  payment_status: 'pending' | 'collected' | 'failed' | 'refunded';
  status: string;
  captain_id: string | null;
  delivery_status: DirectPostDeliveryStatus;
};

async function dispatchReceiptWhatsApp(orderType:string,orderId:string):Promise<string|null> {
  try {
    const {data,error}=await supabase.functions.invoke('dispatch-whatsapp-outbox',{
      body:{event_type:'sale_receipt',order_type:orderType,order_id:orderId},
    });
    if(error) return ' وەسڵ تۆمار کرا، بەڵام ناردنی واتسئاپ لە ئێستادا سەرنەکەوت؛ لە outbox دەمێنێتەوە.';
    const result=data as {configured?:boolean;template_configured?:boolean;queued?:number;sent?:number;failed?:number;message?:string}|null;
    if(!result?.queued) return null;
    if(result.configured===false) return ' وەسڵ تۆمار کرا؛ ڕێکخستنی WhatsApp Business API تەواو نییە و پەیامەکە لە queue دەمێنێتەوە.';
    if(result.template_configured===false) return ' وەسڵ تۆمار کرا؛ template ـی پەسەندکراوی WhatsApp ڕێکنەخراوە و پەیامەکە لە queue دەمێنێتەوە.';
    if(Number(result.failed??0)>0) return ' وەسڵ تۆمار کرا؛ ناردنی واتسئاپ سەرنەکەوت و هۆکارەکە بۆ دووبارە هەوڵدانەوە تۆمار کرا.';
    return Number(result.sent??0)>0 ? ' وەسڵی فرۆشتن بۆ وەرگرە ڕێگەپێدراوەکان نێردرا.' : null;
  } catch {
    return ' وەسڵ تۆمار کرا، بەڵام دۆخی ناردنی واتسئاپ نەتوانرا پشتڕاست بکرێتەوە.';
  }
}

function distanceKm(aLat:number,aLng:number,bLat:number,bLng:number):number {
  const toRadians=(degrees:number)=>degrees*Math.PI/180;
  const dLat=toRadians(bLat-aLat);
  const dLng=toRadians(bLng-aLng);
  const startLat=toRadians(aLat);
  const endLat=toRadians(bLat);
  const h=Math.sin(dLat/2)**2+Math.cos(startLat)*Math.cos(endLat)*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}

function CustomerLocationPanel({latitude,longitude}:{latitude:number|null;longitude:number|null}) {
  const [origin,setOrigin]=useState<{latitude:number;longitude:number}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  if(latitude===null||longitude===null) {
    return <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">کڕیار GPS ـی شوێنی گەیاندن تۆمار نەکردووە. بە ناونیشانی نووسراو ڕێنمایی وەربگرە.</div>;
  }
  const distance=origin?distanceKm(origin.latitude,origin.longitude,latitude,longitude):null;
  const mapUrl=origin
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${latitude},${longitude}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const locate=()=>{
    if(!navigator.geolocation){setError('ئەم مۆبایل/وێبگەڕە GPS پشتگیری ناکات.');return;}
    setBusy(true);setError(null);
    navigator.geolocation.getCurrentPosition(
      ({coords})=>{setOrigin({latitude:coords.latitude,longitude:coords.longitude});setBusy(false);},
      (positionError)=>{setError('نەتوانرا GPS وەربگیرێت: '+positionError.message);setBusy(false);},
      {enableHighAccuracy:true,timeout:12000,maximumAge:10000}
    );
  };
  return <div className="mt-3 rounded-2xl border border-[var(--shakh-blue)]/10 bg-blue-50/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-black text-[var(--shakh-navy)]"><MapPin size={15}/> شوێنی GPS ـی کڕیار</div>
      {distance!==null&&<span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[var(--shakh-blue)]">دووری ڕاستەوخۆ: {distance<1?(distance*1000).toFixed(0)+' مەتر':distance.toFixed(1)+' کم'}</span>}
    </div>
    <div className="mt-2 text-[10px] text-black/40" dir="ltr">{Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}</div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={locate} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-3 py-2 text-xs font-black text-white disabled:opacity-50"><LocateFixed size={14}/>{busy?'GPS...':'حسابکردنی دووری لە شوێنی من'}</button>
      <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--shakh-blue)]/15 bg-white px-3 py-2 text-xs font-black text-[var(--shakh-blue)]"><Navigation size={14}/>{origin?'کردنەوەی ڕێگای کاپتن بۆ کڕیار':'کردنەوەی شوێنی کڕیار لە نەخشە'}</a>
    </div>
    {error&&<p role="status" className="mt-2 text-xs leading-5 text-red-700">{error}</p>}
    <p className="mt-2 text-[10px] leading-5 text-black/40">دووری بە هەژمارکردنی GPS ـی ڕاستەوخۆی کاپتنە (هێڵی ڕاست)، نەک دووری شەقام. بۆ ڕێگای شەقام نەخشە بکەرەوە.</p>
  </div>;
}

const nextDirectDeliveryStatus: Partial<Record<DirectPostDeliveryStatus, DirectPostDeliveryStatus>> = {
  accepted: 'picked_up',
  picked_up: 'on_the_way',
  on_the_way: 'arrived',
  arrived: 'delivered',
};
const directDeliveryStatusLabel: Record<DirectPostDeliveryStatus, string> = {
  pending: 'لە چاوەڕوانی',
  accepted: 'وەرگیراوە',
  picked_up: 'کاڵا وەرگیراوە',
  on_the_way: 'لە ڕێگایە',
  arrived: 'گەیشتووە',
  delivered: 'گەیەنراوە',
  failed: 'سەرنەکەوتووە',
  cancelled: 'هەڵوەشێنراوەتەوە',
};

function mapApparelToCaptainOrder(order: ApparelPostOrder): DirectCaptainOrder {
  return {
    id: order.id, order_type: 'apparel_post', order_number: order.order_number,
    post_title: order.post_title, quantity: order.quantity, delivery_city: order.delivery_city,
    delivery_address: order.delivery_address, delivery_lat: order.delivery_lat, delivery_lng: order.delivery_lng, buyer_phone: order.buyer_phone,
    line_total_iqd: order.line_total_iqd, delivery_fee_iqd: order.delivery_fee_iqd,
    platform_fee_iqd: order.platform_fee_iqd, total_iqd: order.total_iqd,
    payment_method: order.payment_method, payment_status: order.payment_status,
    status: order.status, captain_id: order.captain_id, delivery_status: order.delivery_status,
  };
}
function mapProductToCaptainOrder(order: ElectronicsPostOrder): DirectCaptainOrder {
  return {
    id: order.id, order_type: 'product_post', order_number: order.order_number,
    post_title: order.post_title, quantity: order.quantity, delivery_city: order.delivery_city,
    delivery_address: order.delivery_address, delivery_lat: order.delivery_lat, delivery_lng: order.delivery_lng, buyer_phone: order.buyer_phone,
    line_total_iqd: order.line_total_iqd, delivery_fee_iqd: order.delivery_fee_iqd,
    platform_fee_iqd: order.platform_fee_iqd, total_iqd: order.total_iqd,
    payment_method: order.payment_method, payment_status: order.payment_status,
    status: order.status, captain_id: order.captain_id, delivery_status: order.delivery_status,
  };
}

export function DeliveryPage() {
  const { user } = useAuth();
  const { role, hasPermission } = useAuthorization();
  if (hasPermission('deliveries.view_all')) return <DispatchView userId={user?.id ?? ''} role={role} />;
  return <CaptainOrScopedView role={role} userId={user?.id} />;
}

function CaptainOrScopedView({ role, userId }: { role: string | null; userId: string | undefined }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [foodOrders, setFoodOrders] = useState<FoodPostOrder[]>([]);
  const [directOrders, setDirectOrders] = useState<DirectCaptainOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = useMemo(() => deliveries.find((d) => ['assigned', 'accepted', 'picked_up', 'on_the_way', 'arrived'].includes(d.status)) ?? null, [deliveries]);

  const refresh = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const [nextDeliveries, nextFoodOrders, nextApparelOrders, nextProductOrders] = await Promise.all([
        getMyDeliveries(),
        role === 'captain' ? listFoodPostOrders() : Promise.resolve([]),
        role === 'captain' ? listApparelPostOrders() : Promise.resolve([]),
        role === 'captain' ? listElectronicsPostOrders() : Promise.resolve([]),
      ]);
      setDeliveries(nextDeliveries);
      setFoodOrders(nextFoodOrders);
      setDirectOrders([
        ...nextApparelOrders.map(mapApparelToCaptainOrder),
        ...nextProductOrders.map(mapProductToCaptainOrder),
      ]);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'هەڵەیەک ڕوویدا.'); }
    finally { setLoading(false); }
  }, [role]);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeCaptainDeliveries(userId, refresh);
  useEffect(() => {
    if (role !== 'captain') return;
    const channel = supabase.channel('captain-post-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_post_orders' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apparel_post_orders' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'electronics_post_orders' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, role]);

  const advance = async (delivery: Delivery) => {
    const target = nextStatus[delivery.status];
    if (!target) return;
    setBusyId(delivery.id); setMessage(null);
    try {
      await updateCaptainDelivery(delivery.id, target);
      let receiptNotice='';
      if(target==='delivered' && delivery.order_id) receiptNotice=(await dispatchReceiptWhatsApp('store_order',delivery.order_id))??'';
      await refresh();
      setMessage('دۆخی گەیاندن نوێ کرایەوە.'+receiptNotice);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'گۆڕینی دۆخ سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };

  const locate = async (delivery: Delivery) => {
    if (!navigator.geolocation) { setMessage('ئەم browser ـە GPS پشتیوانی ناکات.'); return; }
    setBusyId(delivery.id); setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try { await updateCaptainLocation(delivery.id, coords.latitude, coords.longitude); setMessage('شوێنی گەیاندن نوێکرایەوە.'); await refresh(); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'نوێکردنەوەی شوێن سەرنەکەوت.'); }
        finally { setBusyId(null); }
      },
      (error) => { setMessage(`GPS بەردەست نییە: ${error.message}`); setBusyId(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  };

  const offers = useMemo(() => deliveries.filter((d) => d.status === 'pending' && d.captain_id == null), [deliveries]);
  const foodOffers = useMemo(() => foodOrders.filter((order) => order.status === 'confirmed' && order.delivery_status === 'pending' && !order.captain_id), [foodOrders]);
  const directOffers = useMemo(() => directOrders.filter((order) => order.status === 'confirmed' && order.delivery_status === 'pending' && !order.captain_id), [directOrders]);
  const directActive = useMemo(() => directOrders.filter((order) => order.captain_id === userId && !['delivered','failed','cancelled'].includes(order.delivery_status)), [directOrders,userId]);
  const directAwaitingCash = useMemo(() => directOrders.filter((order) => order.captain_id === userId && order.delivery_status === 'delivered' && order.payment_method === 'cash_on_delivery' && order.payment_status === 'pending'), [directOrders,userId]);
  const directHistory = useMemo(() => directOrders.filter((order) => order.captain_id === userId && (['failed','cancelled'].includes(order.delivery_status) || (order.delivery_status === 'delivered' && !(order.payment_method === 'cash_on_delivery' && order.payment_status === 'pending')))), [directOrders,userId]);
  const canAdvance = Boolean(active && nextStatus[active.status]);

  const claim = async (delivery: Delivery) => {
    setBusyId(delivery.id);
    setMessage(null);
    try {
      await claimDelivery(delivery.id);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'وەرگرتنی ئەم گەیاندنە سەرنەکەوت؛ لەوانەیە captain ـێکی تر پێش تۆی وەرگرتبێت.');
    } finally {
      setBusyId(null);
    }
  };

  const claimFoodOrder = async (order: FoodPostOrder) => {
    setBusyId(order.id); setMessage(null);
    try { await claimFoodPostDelivery(order.id); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'وەرگرتنی داواکاری خواردن سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };

  const advanceFoodOrder = async (order: FoodPostOrder) => {
    const target = nextFoodDeliveryStatus[order.delivery_status];
    if (!target) return;
    setBusyId(order.id); setMessage(null);
    try {
      await updateFoodPostDeliveryStatus(order.id, target);
      const receiptNotice=target==='delivered' && order.payment_status==='collected' ? (await dispatchReceiptWhatsApp('food_post',order.id))??'' : '';
      await refresh();
      if(receiptNotice) setMessage('دۆخی گەیاندن نوێ کرایەوە.'+receiptNotice);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'نوێکردنەوەی گەیاندن سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };

  const recordFoodPayment = async (order: FoodPostOrder) => {
    setBusyId(order.id); setMessage(null);
    try {
      await recordFoodPostPayment(order.id, Number(order.total_iqd));
      const receiptNotice=(await dispatchReceiptWhatsApp('food_post',order.id))??'';
      await refresh();
      setMessage('وەرگرتنی پارە تۆمار کرا.'+receiptNotice);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'تۆمارکردنی وەرگرتنی پارە سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };


  const claimDirectOrder = async (order: DirectCaptainOrder) => {
    setBusyId(order.id); setMessage(null);
    try { await claimDirectPostDelivery(order.order_type,order.id); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'وەرگرتنی گەیاندن سەرنەکەوت؛ لەوانەیە کاپتنێکی تر پێش تۆی وەرگرتبێت.'); }
    finally { setBusyId(null); }
  };

  const advanceDirectOrder = async (order: DirectCaptainOrder) => {
    const target=nextDirectDeliveryStatus[order.delivery_status];
    if(!target) return;
    setBusyId(order.id); setMessage(null);
    try {
      await updateDirectPostDeliveryStatus(order.order_type,order.id,target);
      const receiptNotice=target==='delivered' && order.payment_status==='collected' ? (await dispatchReceiptWhatsApp(order.order_type,order.id))??'' : '';
      await refresh();
      if(receiptNotice) setMessage('دۆخی گەیاندن نوێ کرایەوە.'+receiptNotice);
    }
    catch(error) { setMessage(error instanceof Error ? error.message : 'نوێکردنەوەی دۆخی گەیاندن سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };

  const recordDirectPayment = async (order: DirectCaptainOrder) => {
    setBusyId(order.id); setMessage(null);
    try {
      await recordDirectPostPayment(order.order_type,order.id,Number(order.total_iqd));
      const receiptNotice=(await dispatchReceiptWhatsApp(order.order_type,order.id))??'';
      await refresh();
      setMessage('وەرگرتنی پارە تۆمار کرا.'+receiptNotice);
    }
    catch(error) { setMessage(error instanceof Error ? error.message : 'تۆمارکردنی پارەی کاش سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };


  return (
    <DeliveryLayout eyebrow="Captain workspace" title="گەیاندنەکانی تۆ" subtitle={role === 'captain' ? 'داواکارییە نوێکان لێرە وەردەگریت و دەتوانیت گەیاندنە سپێردراوەکانت بەڕێوەببەیت.' : 'ئەم بەشە بەپێی دەسەڵاتی هەژمارەکەت داتای گەیاندن پیشان دەدات.'} onRefresh={() => void refresh()} refreshing={loading}>
      {message ? <Notice text={message} /> : null}
      {role === 'captain' ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1"><Clock3 size={18} className="text-[var(--shakh-orange)]" /><h2 className="text-lg font-black">داواکارییە نوێکان</h2></div>
          {offers.map((delivery) => (
            <OfferRow key={delivery.id} delivery={delivery} busy={busyId === delivery.id} onClaim={() => void claim(delivery)} />
          ))}
          {foodOffers.map((order) => (
            <FoodPostCaptainCard key={order.id} order={order} busy={busyId === order.id} onAction={() => void claimFoodOrder(order)} actionLabel="وەرگرتنی داواکاری" />
          ))}
          {directOffers.map((order) => <DirectPostCaptainCard key={order.order_type+':'+order.id} order={order} busy={busyId===order.id} onAction={() => void claimDirectOrder(order)} actionLabel="وەرگرتنی گەیاندن" />)}
          {!loading && offers.length === 0 && foodOffers.length === 0 && directOffers.length === 0 ? <Empty text="هێشتا هیچ داواکارییەکی نوێ بۆ وەرگرتن نییە." /> : null}
        </section>
      ) : null}
      {role === 'captain' ? <section className="space-y-3">
        <div className="flex items-center gap-2 px-1"><Truck size={18} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">داواکاریی خواردنی سپێردراو</h2></div>
        {foodOrders.filter((order) => order.captain_id === userId && !['delivered','failed','cancelled'].includes(order.delivery_status)).map((order) => {
          const target = nextFoodDeliveryStatus[order.delivery_status];
          return <FoodPostCaptainCard key={order.id} order={order} busy={busyId === order.id}
            onAction={() => void advanceFoodOrder(order)}
            actionLabel={target ? `گواستنەوە بۆ ${foodDeliveryStatusLabel[target]}` : 'چاوەڕوانی'} />;
        })}
        {foodOrders.filter((order) => order.captain_id === userId && order.delivery_status === 'delivered' && order.payment_status === 'pending').map((order) => (
          <FoodPostCaptainCard key={order.id} order={order} busy={busyId === order.id} onAction={() => void recordFoodPayment(order)} actionLabel="تۆمارکردنی وەرگرتنی پارە" />
        ))}
        {!loading && !foodOrders.some((order) => order.captain_id === userId && (!['delivered','failed','cancelled'].includes(order.delivery_status) || (order.delivery_status === 'delivered' && order.payment_status === 'pending'))) ? <Empty text="هیچ داواکاریی خواردنێکی سپێردراو نییە." /> : null}
      </section> : null}
      {role === 'captain' ? <section className="space-y-3">
        <div className="flex items-center gap-2 px-1"><PackageCheck size={18} className="text-[var(--shakh-green)]"/><h2 className="text-lg font-black">مێژووی داواکاریی خواردن</h2></div>
        {foodOrders.filter((order) => order.captain_id === userId && ['delivered','failed','cancelled'].includes(order.delivery_status) && !(order.delivery_status === 'delivered' && order.payment_status === 'pending')).map((order) => (
          <FoodPostCaptainCard key={order.id} order={order} busy={false} />
        ))}
        {!loading && !foodOrders.some((order) => order.captain_id === userId && ['delivered','failed','cancelled'].includes(order.delivery_status) && !(order.delivery_status === 'delivered' && order.payment_status === 'pending')) ? <Empty text="مێژووی داواکاریی خواردن بەتاڵە." /> : null}
      </section> : null}

      {role === 'captain' ? <section className="space-y-3">
        <div className="flex items-center gap-2 px-1"><Truck size={18} className="text-[var(--shakh-blue)]"/><h2 className="text-lg font-black">گەیاندنی جل‌وبەرگ و بازاڕی گشتی</h2></div>
        {directActive.map(order=>{
          const target=nextDirectDeliveryStatus[order.delivery_status];
          return <DirectPostCaptainCard key={order.order_type+':'+order.id} order={order} busy={busyId===order.id}
            onAction={target?()=>void advanceDirectOrder(order):undefined}
            actionLabel={target ? ('گواستنەوە بۆ ' + directDeliveryStatusLabel[target]) : undefined}/>;
        })}
        {directAwaitingCash.map(order=><DirectPostCaptainCard key={order.order_type+':'+order.id} order={order} busy={busyId===order.id}
          onAction={()=>void recordDirectPayment(order)} actionLabel="تۆمارکردنی وەرگرتنی پارە"/>)}
        {!loading && !directActive.length && !directAwaitingCash.length ? <Empty text="هیچ گەیاندنێکی جل‌وبەرگ یان بازاڕی گشتی بۆ بەڕێوەبردن نییە."/> : null}
      </section> : null}
      {role === 'captain' ? <section className="space-y-3">
        <div className="flex items-center gap-2 px-1"><PackageCheck size={18} className="text-[var(--shakh-green)]"/><h2 className="text-lg font-black">مێژووی جل‌وبەرگ و بازاڕی گشتی</h2></div>
        {directHistory.map(order=><DirectPostCaptainCard key={order.order_type+':'+order.id} order={order} busy={false}/>)}
        {!loading && !directHistory.length ? <Empty text="مێژووی گەیاندنی بەرهەمە گشتییەکان بەتاڵە."/> : null}
      </section> : null}

      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_18px_60px_rgba(16,22,35,.05)] sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-xs font-black text-[var(--shakh-orange)]">Active delivery</div><h2 className="mt-1 text-xl font-black">گەیاندنی ئێستا</h2></div>
            <Truck className="text-[var(--shakh-orange)]" />
          </div>
          {loading ? <Empty text="بارکردن..." /> : active ? <ActiveDelivery delivery={active} busy={busyId === active.id} canAdvance={canAdvance} onAdvance={() => void advance(active)} onLocate={() => void locate(active)} /> : <Empty text="هیچ گەیاندنێکی چالاک نییە." />}
        </div>
        <div className="rounded-[30px] border border-black/[0.06] bg-[var(--shakh-navy)] p-5 text-white shadow-[0_18px_60px_rgba(11,18,32,.12)] sm:p-7">
          <div className="text-xs font-black text-white/45">Today</div>
          <div className="mt-2 text-3xl font-black">{deliveries.filter((d) => d.status === 'delivered').length.toLocaleString('en-US')}</div>
          <div className="mt-1 text-sm font-bold text-white/60">گەیاندنی تەواو</div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <Stat label="چالاک" value={active ? '1' : '0'} />
            <Stat label="کۆی مێژوو" value={deliveries.length.toLocaleString('en-US')} />
          </div>
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1"><Clock3 size={18} className="text-black/35" /><h2 className="text-lg font-black">مێژووی گەیاندن</h2></div>
        {deliveries
          .filter((d) => d.id !== active?.id && !(role === 'captain' && d.status === 'pending' && d.captain_id == null))
          .map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} />)}
        {!loading && deliveries.filter((d) => d.id !== active?.id && !(role === 'captain' && d.status === 'pending' && d.captain_id == null)).length === 0 ? <Empty text="هێشتا مێژووی گەیاندن نییە." /> : null}
      </section>
    </DeliveryLayout>
  );
}

function DispatchView({ userId }: { userId: string; role: string | null }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCaptain, setSelectedCaptain] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const [nextDeliveries, nextCaptains] = await Promise.all([getDispatchDeliveries(), getAvailableCaptains()]);
      setDeliveries(nextDeliveries); setCaptains(nextCaptains);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'هەڵەیەک ڕوویدا.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const doAssign = async (delivery: Delivery) => {
    const captain = selectedCaptain[delivery.id];
    if (!captain) return;
    setBusyId(delivery.id); setMessage(null);
    try { await assignCaptain(delivery.id, captain, userId); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'سپاردنی گەیاندن سەرنەکەوت.'); }
    finally { setBusyId(null); }
  };

  const counts = useMemo(() => ({ pending: deliveries.filter((d) => d.status === 'pending').length, active: deliveries.filter((d) => !['delivered','failed','cancelled'].includes(d.status)).length, delivered: deliveries.filter((d) => d.status === 'delivered').length }), [deliveries]);

  return (
    <DeliveryLayout eyebrow="Dispatch center" title="چاودێری گەیاندن" subtitle="سپاردن، چاودێری status و دۆخی captain ـەکان لە یەک workspace." onRefresh={() => void refresh()} refreshing={loading}>
      {message ? <Notice text={message} /> : null}
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="لە چاوەڕوانی" value={counts.pending} icon={<Clock3 size={18} />} /><StatCard label="چالاک" value={counts.active} icon={<Navigation size={18} />} /><StatCard label="گەیەنراو" value={counts.delivered} icon={<PackageCheck size={18} />} /></div>
      <section className="space-y-3">
        {deliveries.map((delivery) => <DispatchRow key={delivery.id} delivery={delivery} captains={captains} selectedCaptain={selectedCaptain[delivery.id] ?? delivery.captain_id ?? ''} busy={busyId === delivery.id} onSelect={(value) => setSelectedCaptain((current) => ({ ...current, [delivery.id]: value }))} onAssign={() => void doAssign(delivery)} />)}
        {!loading && deliveries.length === 0 ? <Empty text="هێشتا هیچ delivery record ـێک نییە؛ checkout/order module لە Phase ـی دواتر record ـی واقعی دروست دەکات." /> : null}
      </section>
    </DeliveryLayout>
  );
}

function ActiveDelivery({ delivery, busy, canAdvance, onAdvance, onLocate }: { delivery: Delivery; busy: boolean; canAdvance: boolean; onAdvance: () => void; onLocate: () => void }) {
  const order = delivery.order;
  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className={`rounded-full px-3 py-1.5 text-xs font-black ${statusTone[delivery.status]}`}>{statusLabel[delivery.status]}</span><span className="font-mono text-xs font-bold text-black/40" dir="ltr">{order?.order_number ?? delivery.order_id}</span></div>
      <div className="rounded-3xl bg-[var(--shakh-bg)] p-5">
        <div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--shakh-navy)] shadow-sm"><MapPin size={19} /></div><div className="min-w-0"><div className="text-xs font-bold text-black/35">شوێنی گەیاندن</div><div className="mt-1 font-black leading-7">{order?.delivery_address ?? '—'}</div></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><MiniInfo label="فرۆشگا" value={order?.store?.name_ku ?? '—'} /><MiniInfo label="کۆی داواکاری" value={`${Number(order?.total_iqd ?? 0).toLocaleString('en-US')} IQD`} /></div>
        {order?.delivery_lat != null && order?.delivery_lng != null ? <a href={buildGoogleMapsDirectionsUrl({ latitude: Number(order.delivery_lat), longitude: Number(order.delivery_lng) }, delivery.last_lat != null && delivery.last_lng != null ? { latitude: Number(delivery.last_lat), longitude: Number(delivery.last_lng) } : null)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black text-[var(--shakh-blue)]"><Navigation size={15} /> ڕێنمایی بۆ شوێنی کڕیار لە Map</a> : null}
        {order?.delivery_lat != null && order?.delivery_lng != null && delivery.last_lat != null && delivery.last_lng != null ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-[var(--shakh-blue)]"><MapPin size={15}/> دووری GPS ـی کاپتن تا کڕیار: {distanceKm(Number(delivery.last_lat),Number(delivery.last_lng),Number(order.delivery_lat),Number(order.delivery_lng))<1?(distanceKm(Number(delivery.last_lat),Number(delivery.last_lng),Number(order.delivery_lat),Number(order.delivery_lng))*1000).toFixed(0)+' مەتر':distanceKm(Number(delivery.last_lat),Number(delivery.last_lng),Number(order.delivery_lat),Number(order.delivery_lng)).toFixed(1)+' کم'} <span className="font-normal text-black/45">· دووری هێڵی ڕاست</span></div> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><button disabled={busy || !canAdvance} onClick={onAdvance} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 py-3 text-sm font-black text-white disabled:opacity-35"><Check size={17} />{nextStatus[delivery.status] ? `گواستنەوە بۆ ${statusLabel[nextStatus[delivery.status]!]}` : 'کۆتایی'} </button><button disabled={busy} onClick={onLocate} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-black disabled:opacity-40"><LocateFixed size={17} />نوێکردنەوەی شوێن</button></div>
      {delivery.last_location_at ? <div className="text-xs font-bold text-black/35" dir="ltr">GPS: {Number(delivery.last_lat).toFixed(5)}, {Number(delivery.last_lng).toFixed(5)} · {new Date(delivery.last_location_at).toLocaleTimeString()}</div> : null}
    </div>
  );
}

function DispatchRow({ delivery, captains, selectedCaptain, busy, onSelect, onAssign }: { delivery: Delivery; captains: Captain[]; selectedCaptain: string; busy: boolean; onSelect: (value: string) => void; onAssign: () => void }) {
  return <article className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)] sm:p-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone[delivery.status]}`}>{statusLabel[delivery.status]}</span><span className="font-mono text-xs font-bold text-black/35" dir="ltr">{delivery.order?.order_number}</span></div><div className="mt-2 font-black">{delivery.order?.store?.name_ku ?? '—'}</div><div className="mt-1 truncate text-sm font-bold text-black/45">{delivery.order?.delivery_address ?? '—'}</div></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative min-w-64"><select value={selectedCaptain} onChange={(e) => onSelect(e.target.value)} className="h-12 w-full appearance-none rounded-2xl border border-black/10 bg-[var(--shakh-bg)] px-4 pe-10 text-sm font-black outline-none focus:ring-4 focus:ring-[var(--shakh-blue)]/10"><option value="">Captain هەڵبژێرە</option>{captains.map((captain) => <option key={captain.id} value={captain.id}>{captain.full_name || captain.phone || captain.id}</option>)}</select><ChevronDown className="pointer-events-none absolute end-3 top-3.5 text-black/30" size={17} /></div><button disabled={!selectedCaptain || busy || delivery.status === 'delivered' || delivery.status === 'cancelled'} onClick={onAssign} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 text-sm font-black text-white disabled:opacity-35"><UserRound size={17} />{busy ? '...' : 'سپاردن'}</button></div></div></article>;
}

function OfferRow({ delivery, busy, onClaim }: { delivery: Delivery; busy: boolean; onClaim: () => void }) {
  return (
    <article className="rounded-[28px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--shakh-orange)]/10 px-2.5 py-1 text-[11px] font-black text-[var(--shakh-orange)]">نوێ</span>
            <span className="font-mono text-xs font-bold text-black/35" dir="ltr">{delivery.order?.order_number}</span>
          </div>
          <div className="mt-2 font-black">{delivery.order?.store?.name_ku ?? '—'}</div>
          <div className="mt-1 truncate text-sm font-bold text-black/45">{delivery.order?.delivery_address ?? '—'}</div>
          <div className="mt-2 text-xs font-bold text-black/35">کۆی داواکاری: {Number(delivery.order?.total_iqd ?? 0).toLocaleString('en-US')} IQD</div>
        </div>
        <button disabled={busy} onClick={onClaim} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-40">
          {busy ? 'وەرگرتن...' : 'وەرگرتنی داواکاری'}
        </button>
      </div>
    </article>
  );
}

function DeliveryRow({ delivery }: { delivery: Delivery }) { return <article className="rounded-2xl border border-black/[0.06] bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--shakh-bg)]"><Truck size={18} /></div><div className="min-w-0"><div className="truncate font-black">{delivery.order?.store?.name_ku ?? '—'}</div><div className="mt-0.5 truncate text-xs font-bold text-black/35" dir="ltr">{delivery.order?.order_number}</div></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone[delivery.status]}`}>{statusLabel[delivery.status]}</span></div></article>; }

function FoodPostCaptainCard({ order, busy, onAction, actionLabel }: { order: FoodPostOrder; busy: boolean; onAction?: () => void; actionLabel?: string }) {
  return <article className="rounded-[28px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)] sm:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--shakh-orange)]/10 px-2.5 py-1 text-[11px] font-black text-[var(--shakh-orange)]">چێشتخانە · {foodDeliveryStatusLabel[order.delivery_status]}</span><span className="font-mono text-xs font-bold text-black/35" dir="ltr">{order.order_number}</span></div>
        <h3 className="mt-2 font-black">{order.post_title} × {order.quantity}</h3>
        <div className="mt-2 space-y-1 text-sm font-bold text-black/55"><div>{order.delivery_city} · {order.delivery_address}</div><div dir="ltr" className="text-start">{order.buyer_phone}</div></div>
        {order.captain_id ? <CustomerLocationPanel latitude={order.delivery_lat} longitude={order.delivery_lng}/> : null}
        <div className="mt-4 grid gap-2 rounded-2xl bg-[var(--shakh-bg)] p-4 text-sm">
          <FoodAmount label="کۆی خواردن" amount={order.line_total_iqd} />
          <FoodAmount label="کرێی گەیاندن" amount={order.delivery_fee_iqd} />
          <FoodAmount label="کرێی پلاتفۆرم" amount={order.platform_fee_iqd} />
          <FoodAmount label="ئەو بڕەی لە کڕیار وەردەگریت" amount={order.total_iqd} strong />
        </div>
        <div className="mt-2 text-xs font-bold text-black/45">پارەدان: {order.payment_method === 'cash_on_delivery' ? 'کاش لە کاتی گەیاندن' : 'Mobile Cash'} · {order.payment_status === 'collected' ? `وەرگیرا و تۆمارکرا · ${Number(order.payment_event?.[0]?.amount_iqd ?? order.total_iqd).toLocaleString('en-US')} د.ع` : 'هێشتا وەرنەگیراوە'}</div>
      </div>
      {onAction && actionLabel ? <button disabled={busy} onClick={onAction} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-40"><Check size={17}/>{busy ? 'چاوەڕوانبە...' : actionLabel}</button> : null}
    </div>
  </article>;
}


function DirectPostCaptainCard({ order, busy, onAction, actionLabel }: { order: DirectCaptainOrder; busy: boolean; onAction?: () => void; actionLabel?: string }) {
  const category = order.order_type === 'apparel_post' ? 'جل‌وبەرگ' : 'بەرهەمی بازاڕ';
  return <article className="rounded-[28px] border border-[var(--shakh-orange)]/20 bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)] sm:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--shakh-orange)]/10 px-2.5 py-1 text-[11px] font-black text-[var(--shakh-orange)]">{category} · {directDeliveryStatusLabel[order.delivery_status]}</span><span className="font-mono text-xs font-bold text-black/35" dir="ltr">{order.order_number}</span></div>
        <h3 className="mt-2 font-black">{order.post_title} × {order.quantity}</h3>
        <div className="mt-2 space-y-1 text-sm font-bold text-black/55"><div>{order.delivery_city} · {order.delivery_address}</div><div dir="ltr" className="text-start">{order.buyer_phone}</div></div>
        {order.captain_id ? <CustomerLocationPanel latitude={order.delivery_lat} longitude={order.delivery_lng}/> : null}
        <div className="mt-4 grid gap-2 rounded-2xl bg-[var(--shakh-bg)] p-4 text-sm">
          <FoodAmount label="کۆی بەرهەم" amount={order.line_total_iqd}/>
          <FoodAmount label="کرێی گەیاندن" amount={order.delivery_fee_iqd}/>
          <FoodAmount label="کرێی پلاتفۆرم" amount={order.platform_fee_iqd}/>
          <FoodAmount label="کۆی پارەی کڕیار" amount={order.total_iqd} strong/>
        </div>
        <div className="mt-2 text-xs font-bold text-black/45">پارەدان: {order.payment_method==='cash_on_delivery'?'کاش لە کاتی گەیاندن':'Mobile Cash'} · {order.payment_status==='collected'?'پارە وەرگیراوە':order.delivery_status==='delivered'?'چاوەڕوانی تۆمارکردنی پارە':'تا گەیاندن چاوەڕوانە'}</div>
      </div>
      {onAction && actionLabel ? <button disabled={busy} onClick={onAction} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-5 py-3 text-sm font-black text-white disabled:opacity-40"><Check size={17}/>{busy?'چاوەڕوانبە...':actionLabel}</button> : null}
    </div>
  </article>;
}

function FoodAmount({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-4 ${strong ? 'border-t border-black/10 pt-2 font-black text-[var(--shakh-navy)]' : 'text-black/55'}`}><span>{label}</span><span>{Number(amount).toLocaleString('en-US')} د.ع</span></div>;
}

function DeliveryLayout({ eyebrow, title, subtitle, onRefresh, refreshing, children }: { eyebrow: string; title: string; subtitle: string; onRefresh: () => void; refreshing: boolean; children: React.ReactNode }) {
  return <div className="shakh-page"><div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8"><header className="rounded-[32px] bg-[var(--shakh-navy)] p-6 text-white shadow-[0_22px_70px_rgba(11,18,32,.14)] sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-black text-[var(--shakh-orange)]">{eyebrow}</div><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">{subtitle}</p></div><button onClick={onRefresh} disabled={refreshing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white disabled:opacity-50"><RefreshCw className={refreshing ? 'animate-spin' : ''} size={17} />نوێکردنەوە</button></div></header>{children}</div></div>;
}
function Notice({ text }: { text: string }) { return <div className="flex items-start gap-3 rounded-2xl bg-[var(--shakh-orange)]/10 px-4 py-3 text-sm font-bold leading-6 text-[var(--shakh-orange)]"><CircleAlert className="mt-0.5 shrink-0" size={17} />{text}</div>; }
function Empty({ text }: { text: string }) { return <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-black/10 bg-[var(--shakh-bg)] p-6 text-center text-sm font-bold leading-7 text-black/40">{text}</div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs font-bold text-white/40">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>; }
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="rounded-3xl border border-black/[0.06] bg-white p-5 shadow-[0_12px_35px_rgba(16,22,35,.04)]"><div className="flex items-center gap-2 text-xs font-black text-black/40">{icon}{label}</div><div className="mt-2 text-2xl font-black">{value.toLocaleString('en-US')}</div></div>; }
function MiniInfo({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white p-4"><div className="text-[11px] font-bold text-black/35">{label}</div><div className="mt-1 truncate text-sm font-black">{value}</div></div>; }

