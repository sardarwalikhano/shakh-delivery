import { ArrowLeft, BadgeCheck, Banknote, FileText, Mail, MessageCircle, PackageCheck, Printer, RefreshCw, ShieldCheck, Truck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthContext';

type ReceiptLine = {
  title?: string;
  name?: string;
  quantity?: number | string;
  unit_price_iqd?: number | string;
  line_total_iqd?: number | string;
  variant?: string | null;
};

type OrderReceipt = {
  id: string;
  receipt_number: string;
  order_type: string;
  order_id: string;
  order_number: string;
  buyer_id: string | null;
  seller_id: string | null;
  captain_id: string | null;
  store_id: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  delivery_address: string | null;
  seller_name: string | null;
  seller_phone: string | null;
  item_lines: ReceiptLine[];
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  platform_fee_iqd: number;
  total_iqd: number;
  payment_method: string | null;
  payment_status: string;
  completed_at: string;
  receipt_snapshot: Record<string, unknown>;
};

type OutboxStatus = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

const money = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0)).toLocaleString('en-US') + ' د.ع';
const dateLabel = (value: string) =>
  new Date(value).toLocaleString('ku-IQ', { dateStyle: 'medium', timeStyle: 'short' });
const orderTypeLabel: Record<string, string> = {
  store_order: 'فرۆشی فرۆشگا',
  food_post: 'چێشتخانە',
  apparel_post: 'جل‌وبەرگ',
  product_post: 'بازاڕی گشتی',
};
const paymentLabel = (value: string | null) => {
  if (value === 'cash_on_delivery' || value === 'cod') return 'کاش لە کاتی گەیاندن';
  if (value === 'mobile_cash') return 'Mobile Cash';
  return value || 'دیاری نەکراو';
};

export function OrderReceiptsPage() {
  const { id } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<OrderReceipt[]>([]);
  const [outbox, setOutbox] = useState<OutboxStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [dispatchingReceipt, setDispatchingReceipt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('order_receipts').select('*').order('completed_at', { ascending: false }).limit(100);
      if (id) query = supabase.from('order_receipts').select('*').eq('id', id).limit(1);
      const [receiptResult, preferenceResult, outboxResult] = await Promise.all([
        query,
        supabase.from('whatsapp_delivery_preferences').select('phone_e164,enabled').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('get_my_whatsapp_outbox_status'),
      ]);
      if (receiptResult.error) throw receiptResult.error;
      setReceipts((receiptResult.data ?? []) as OrderReceipt[]);
      if (preferenceResult.error) {
        setError('وەسڵەکان خوێندرایەوە، بەڵام ڕێکخستنی واتسئاپ نەتوانرا بخوێندرێتەوە.');
      } else {
        setPhone(preferenceResult.data?.phone_e164 ? '+' + preferenceResult.data.phone_e164 : '');
        setWhatsappEnabled(Boolean(preferenceResult.data?.enabled));
      }
      if (outboxResult.error) {
        setOutbox([]);
      } else {
        setOutbox((outboxResult.data ?? []) as OutboxStatus[]);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'نەتوانرا وەسڵەکان بخوێندرێنەوە.');
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveWhatsAppPreference = async () => {
    setSavingPreference(true);
    setError(null);
    setMessage(null);
    try {
      if (whatsappEnabled && !/^\+?[1-9][0-9]{7,14}$/.test(phone.replace(/[\s()-]/g, ''))) {
        throw new Error('ژمارەی واتسئاپ بە کۆدی وڵات بنووسە؛ نموونە: +9647xxxxxxxxx');
      }
      const { error: rpcError } = await supabase.rpc('set_my_whatsapp_receipt_preference', {
        p_phone: phone.trim(),
        p_enabled: whatsappEnabled,
      });
      if (rpcError) throw rpcError;
      setMessage(whatsappEnabled
        ? 'ڕەزامەندی وەرگرتنی وەسڵ و پوختەی پارەدان بە واتسئاپ پاشەکەوت کرا.'
        : 'ناردنی وەسڵی واتسئاپ ناچالاک کرا. پەیامی نوێ بۆ ئەم ژمارەیە نانێردرێت.');
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'پاشەکەوتکردنی ڕێکخستنی واتسئاپ سەرنەکەوت.');
    } finally {
      setSavingPreference(false);
    }
  };

  const dispatchReceipt = async (receipt: OrderReceipt) => {
    setDispatchingReceipt(receipt.id);
    setError(null);
    setMessage(null);
    try {
      const { error: queueError } = await supabase.rpc('queue_order_receipt_whatsapp', { p_receipt_id: receipt.id });
      if (queueError) throw queueError;
      const { data, error: invokeError } = await supabase.functions.invoke('dispatch-whatsapp-outbox', {
        body: { event_type: 'sale_receipt', order_type: receipt.order_type, order_id: receipt.order_id },
      });
      if (invokeError) throw invokeError;
      const result = data as { configured?: boolean; sent?: number; queued?: number; pending?: number; failed?: number; message?: string } | null;
      if (result?.configured === false) {
        setMessage('وەسڵەکە لە outbox پارێزرا؛ بەڵام WhatsApp Business API هێشتا ڕێکنەخراوە. پەیامەکە تا ڕێکخستنی API نانێردرێت.');
      } else if (Number(result?.sent ?? 0) > 0) {
        setMessage('پەیامی وەسڵ بە سەرکەوتوویی نێردرا بۆ ' + result?.sent + ' وەرگر.');
      } else if (Number(result?.failed ?? 0) > 0) {
        setMessage('پەیام لە واتسئاپ سەرنەکەوت؛ هۆکارەکە لە مێژووی ناردن تۆمار کرا و بۆ هەوڵدانەوە پارێزرا.');
      } else {
        setMessage(result?.message ?? 'پەیامی وەسڵ لە queue ـدا تۆمار کرا.');
      }
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ناردنی وەسڵ بۆ واتسئاپ سەرنەکەوت.');
    } finally {
      setDispatchingReceipt(null);
    }
  };

  const receipt = id ? receipts[0] : null;

  return (
    <section className="shakh-page min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-5 px-4 sm:px-6">
        <header className="overflow-hidden rounded-[30px] bg-[linear-gradient(120deg,#102641,#174878_68%,#235cff)] p-5 text-white shadow-[0_22px_55px_rgba(16,38,65,.13)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[.16em] text-[var(--shakh-orange)]">SHAKH · SALE RECEIPTS</p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">{id ? 'وەسڵی فرۆشتن' : 'وەسڵ و مێژووی مامەڵەکان'}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-white/70">وەسڵەکان لە داتابەیسی ڕاستەقینەوە دەخوێندرێنەوە. زانیاریی بەرهەم، کرێی گەیاندن، کۆی گشتی و دۆخی پارەدان لێرە دیارە.</p>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> نوێکردنەوە</button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-2xl border border-red-500/15 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
        {message && <div role="status" className="rounded-2xl border border-emerald-600/15 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">{message}</div>}

        <section className="overflow-hidden rounded-[26px] border border-[var(--shakh-blue)]/15 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-black/[0.06] bg-blue-50/60 p-4 sm:p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--shakh-blue)] shadow-sm"><MessageCircle size={21}/></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-black text-[var(--shakh-navy)]">وەرگرتنی وەسڵ و پوختەی پارەدان بە واتسئاپ</h2>
              <p className="mt-1 text-xs leading-6 text-black/55">ژمارەکەت بە کۆدی وڵات بنووسە و ڕەزامەندی بدە. ئەگەر خاوەنی دوکان یان سوپەر ئەدمین بیت، وەسڵەکانی فرۆشتن و پوختەی گەڕاندنەوەی پارە بەو ژمارەیە دەنێردرێت. دۆخی ناردن لە خوارەوە بەردەستە.</p>
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5">
            <label className="block text-sm font-black">ژمارەی واتسئاپ (E.164)
              <input value={phone} onChange={event=>setPhone(event.target.value)} inputMode="tel" dir="ltr" placeholder="+9647xxxxxxxxx" className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-normal outline-none focus:border-[var(--shakh-blue)]"/>
            </label>
            <div className="flex flex-col gap-2">
              <label className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-bg)] px-3 text-xs font-bold"><input type="checkbox" checked={whatsappEnabled} onChange={event=>setWhatsappEnabled(event.target.checked)} className="size-4 accent-emerald-700"/> ڕەزامەندی ناردنی وەسڵ و ڕاپۆرت</label>
              <button type="button" disabled={savingPreference} onClick={()=>void saveWhatsAppPreference()} className="min-h-11 rounded-xl bg-[var(--shakh-navy)] px-5 text-xs font-black text-white disabled:opacity-50">{savingPreference?'پاشەکەوتکردن...':'پاشەکەوتی ڕێکخستن'}</button>
            </div>
          </div>
          <p className="px-4 pb-4 text-[10px] leading-5 text-black/40 sm:px-5">ڕەزامەندی تۆمار دەکرێت و دەتوانیت هەر کات ناچالاکی بکەیت. ناردنی خۆکار پێویستی بە WhatsApp Business Cloud API و، بۆ ناردنی دەرەوەی ماوەی گفتوگۆ، پەسەندکردنی template ـی Meta هەیە.</p>
        </section>

        {id ? (
          loading ? <Empty>بارکردنی وەسڵ...</Empty> : !receipt ? <Empty>وەسڵەکە نەدۆزرایەوە یان دەسەڵاتی بینینی نییە.</Empty> : (
            <article className="receipt-paper rounded-[26px] border border-black/[0.07] bg-white p-5 shadow-[0_14px_40px_rgba(16,38,65,.06)] sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-dashed border-black/10 pb-5">
                <div className="flex items-start gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><FileText size={23}/></span><div><p className="text-[10px] font-black tracking-[.15em] text-[var(--shakh-orange)]">SHAKH · RECEIPT</p><h2 className="mt-1 text-xl font-black">وەسڵی فرۆشتن</h2><p className="mt-1 text-xs text-black/45">{orderTypeLabel[receipt.order_type] ?? receipt.order_type}</p></div></div>
                <div className="text-start"><div className="text-[10px] text-black/40">ژمارەی وەسڵ</div><div className="mt-1 font-mono text-sm font-black" dir="ltr">{receipt.receipt_number}</div><div className="mt-2 text-[10px] text-black/40">ژمارەی ئۆردەر</div><div className="font-mono text-xs font-bold" dir="ltr">{receipt.order_number}</div></div>
              </div>

              <div className="grid gap-3 border-b border-black/[0.06] py-5 sm:grid-cols-2">
                <Info label="کڕیار" value={receipt.buyer_name || '—'} icon={<UserRound size={15}/>}/>
                <Info label="ژمارەی کڕیار" value={receipt.buyer_phone || '—'} icon={<MessageCircle size={15}/>}/>
                <Info label="فرۆشیار / دوکان" value={receipt.seller_name || '—'} icon={<PackageCheck size={15}/>}/>
                <Info label="ژمارەی فرۆشیار" value={receipt.seller_phone || '—'} icon={<MessageCircle size={15}/>}/>
                <Info label="ناونیشانی گەیاندن" value={receipt.delivery_address || '—'} icon={<Truck size={15}/>}/>
                <Info label="بەرواری تەواوبوون" value={dateLabel(receipt.completed_at)} icon={<BadgeCheck size={15}/>}/>
              </div>

              <div className="py-5">
                <h3 className="font-black text-[var(--shakh-navy)]">وردەکاریی بەرهەمەکان</h3>
                <div className="mt-3 space-y-2">
                  {(receipt.item_lines ?? []).map((item,index)=>(
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl bg-[var(--shakh-bg)] p-3">
                      <div className="min-w-0"><div className="font-black">{item.title || item.name || 'بەرهەم'}</div>{item.variant&&<div className="mt-1 text-xs text-black/45">{item.variant}</div>}<div className="mt-1 text-xs text-black/45">{Number(item.quantity??1).toLocaleString('en-US')} × {money(item.unit_price_iqd)}</div></div>
                      <div className="self-center text-sm font-black tabular-nums">{money(item.line_total_iqd)}</div>
                    </div>
                  ))}
                  {!receipt.item_lines?.length && <Empty>هیچ وردەکاریی بەرهەمێک لەم وەسڵەدا نییە.</Empty>}
                </div>
              </div>

              <div className="rounded-2xl border border-black/[0.06] p-4 sm:p-5">
                <AmountRow label="کۆی بەرهەمەکان" amount={receipt.subtotal_iqd}/>
                <AmountRow label="کرێی گەیاندن" amount={receipt.delivery_fee_iqd}/>
                <AmountRow label="کرێی پلاتفۆرم" amount={receipt.platform_fee_iqd}/>
                <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-dashed border-black/10 pt-4"><span className="font-black">کۆی گشتی</span><span className="text-2xl font-black tabular-nums text-[var(--shakh-navy)]">{money(receipt.total_iqd)}</span></div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--shakh-bg)] p-3 text-xs"><span className="font-bold text-black/50">شێوازی پارەدان: {paymentLabel(receipt.payment_method)}</span><span className="rounded-full bg-white px-3 py-1.5 font-black">{receipt.payment_status==='collected'?'پارە وەرگیراوە':receipt.payment_status==='refunded'?'پارە گەڕێندرایەوە':'چاوەڕوانی پارەدان'}</span></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 print:hidden">
                <button type="button" onClick={()=>window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--shakh-navy)] px-4 text-sm font-black text-white"><Printer size={16}/> پرینت / پاشەکەوت وەک PDF</button>
                <button type="button" disabled={dispatchingReceipt===receipt.id} onClick={()=>void dispatchReceipt(receipt)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 text-sm font-black text-emerald-800 disabled:opacity-50"><MessageCircle size={16}/>{dispatchingReceipt===receipt.id?'ناردن...':'ناردن / دووبارە ناردن بە واتسئاپ'}</button>
                <Link to="/receipts" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-4 text-sm font-black"><ArrowLeft size={16}/> گەڕانەوە بۆ هەموو وەسڵەکان</Link>
              </div>
            </article>
          )
        ) : (
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black tracking-[.14em] text-[var(--shakh-orange)]">RECEIPT HISTORY</p><h2 className="mt-1 text-xl font-black text-[var(--shakh-navy)]">وەسڵەکانی فرۆشتن</h2></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black/45">{receipts.length} وەسڵ</span></div>
            {loading ? <Empty>بارکردن...</Empty> : receipts.map(receipt=>(
              <Link key={receipt.id} to={'/receipts/'+receipt.id} className="block rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_8px_24px_rgba(16,38,65,.035)] transition hover:-translate-y-0.5 hover:border-[var(--shakh-orange)]/30 hover:shadow-md sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><div className="text-[10px] font-black tracking-wide text-[var(--shakh-orange)]">{orderTypeLabel[receipt.order_type]??receipt.order_type}</div><div className="mt-1 break-all font-mono text-sm font-black" dir="ltr">{receipt.receipt_number}</div><div className="mt-1 text-xs text-black/45">ئۆردەر: {receipt.order_number} · {dateLabel(receipt.completed_at)}</div><div className="mt-2 text-sm font-bold">{receipt.seller_name||'فرۆشیار'} <span className="text-black/25">←</span> {receipt.buyer_name||'کڕیار'}</div></div>
                  <div className="text-end"><div className="text-lg font-black tabular-nums text-[var(--shakh-navy)]">{money(receipt.total_iqd)}</div><div className="mt-1 text-[10px] text-black/40">{paymentLabel(receipt.payment_method)}</div><span className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-800">{receipt.payment_status==='collected'?'پارە وەرگیراوە':'دۆخی پارەدان: '+receipt.payment_status}</span></div>
                </div>
              </Link>
            ))}
            {!loading&&!receipts.length&&<Empty>هێشتا هیچ وەسڵێک بۆ ئەم هەژمارە تۆمار نەکراوە. وەسڵ دوای تەواوبوونی فرۆشتن دروست دەبێت.</Empty>}
          </section>
        )}

        <section className="rounded-[24px] border border-black/[0.06] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-[var(--shakh-blue)]"/><h2 className="font-black">دۆخی ناردنی واتسئاپ</h2></div>
          <p className="mt-1 text-xs leading-6 text-black/45">ناردن، شکستی ناردن و هۆکاری ڕەتکردنەوە لێرە تۆمار دەکرێت. پەیامی نەنێردراو لە مێژوودا دەمێنێتەوە بۆ پشکنین.</p>
          <div className="mt-3 space-y-2">
            {outbox.map(item=><div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[var(--shakh-bg)] p-3">
              <div className="min-w-0"><div className="text-xs font-black">{item.event_type==='sale_receipt'?'وەسڵی فرۆشتن':'ڕادەستکردنی کاش'}</div><div className="mt-1 text-[10px] text-black/40">{dateLabel(item.created_at)}{item.sent_at?' · نێردرا: '+dateLabel(item.sent_at):''}</div>{item.last_error&&<div className="mt-2 break-words text-xs text-red-700">{item.last_error}</div>}{item.provider_message_id&&<div className="mt-1 break-all font-mono text-[10px] text-black/35" dir="ltr">Provider ID: {item.provider_message_id}</div>}</div>
              <span className={'rounded-full px-2.5 py-1 text-[10px] font-black '+(item.status==='sent'?'bg-emerald-500/10 text-emerald-800':item.status==='failed'?'bg-red-500/10 text-red-700':item.status==='blocked'?'bg-black/5 text-black/50':'bg-amber-500/10 text-amber-800')}>{item.status==='sent'?'نێردراوە':item.status==='failed'?'ناردن سەرنەکەوت':item.status==='blocked'?'ناچالاک کراوە':item.status==='sending'?'لە ناردندایە':'لە چاوەڕوانیدایە'}</span>
            </div>)}
            {!outbox.length&&<Empty>هێشتا پەیامێکی واتسئاپ بۆ ئەم ژمارەیە تۆمار نەکراوە.</Empty>}
          </div>
        </section>
      </div>
      <style>{'@media print { body { background: white !important; } body * { visibility: hidden !important; } .receipt-paper, .receipt-paper * { visibility: visible !important; } .receipt-paper { position: absolute; inset: 0; width: 100%; padding: 0 !important; border: 0 !important; box-shadow: none !important; } }'}</style>
    </section>
  );
}

function Info({label,value,icon}:{label:string;value:string;icon:React.ReactNode}) {
  return <div className="flex items-start gap-2 rounded-xl bg-[var(--shakh-bg)] p-3"><span className="mt-0.5 text-[var(--shakh-blue)]">{icon}</span><div className="min-w-0"><div className="text-[10px] font-bold text-black/40">{label}</div><div className="mt-1 break-words text-xs font-black leading-5">{value}</div></div></div>;
}
function AmountRow({label,amount}:{label:string;amount:number}) {
  return <div className="flex items-center justify-between gap-4 py-2 text-sm"><span className="text-black/55">{label}</span><span className="font-bold tabular-nums">{money(amount)}</span></div>;
}
function Empty({children}:{children:React.ReactNode}) {
  return <div className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-black/10 bg-white/70 p-5 text-center text-sm font-bold text-black/40">{children}</div>;
}
