import { Bell, CheckCheck, ChevronLeft, CircleCheck, Clock3, CreditCard, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../hooks/NotificationContext';
import { useEffect, useState } from 'react';
import { removePushSubscription, savePushSubscription } from '../api';
import { useAuthorization } from '@/lib/permissions/AuthorizationContext';
import type { NotificationType } from '../types';

const iconByType: Record<NotificationType, typeof Bell> = {
  order_created: PackageCheck,
  order_status: PackageCheck,
  delivery_assigned: Truck,
  delivery_offer: Truck,
  delivery_status: Truck,
  role_request: ShieldCheck,
  payment_status: CreditCard,
  system: Bell,
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ku-IQ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function NotificationsPage() {
  const { notifications, unreadCount, loading, markRead, markAllRead, refresh } = useNotifications();
  const { roles } = useAuthorization();
  const [filter, setFilter] = useState<'all' | 'unread' | 'orders' | 'delivery' | 'payments'>('all');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready.then(async (registration) => setPushEnabled(Boolean(await registration.pushManager.getSubscription()))).catch(() => undefined);
  }, []);

  const toggleBrowserPush = async () => {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushMessage('ئەم browser ـە پشتگیری ئاگادارکردنەوەی Push ناکات.'); return;
    }
    if (!vapidKey) { setPushMessage('Browser Push هێشتا لە ڕێکخستنی سێرڤەرەکەدا چالاک نەکراوە.'); return; }
    setPushBusy(true); setPushMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await removePushSubscription(existing.endpoint); await existing.unsubscribe(); setPushEnabled(false); setPushMessage('ئاگادارکردنەوەی browser ناچالاک کرا.');
      } else {
        if (await Notification.requestPermission() !== 'granted') throw new Error('permission');
        const normalizedKey = vapidKey.replace(/-/g, '+').replace(/_/g, '/');
        const applicationServerKey = Uint8Array.from(atob(normalizedKey), (char) => char.charCodeAt(0));
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        await savePushSubscription(subscription.toJSON()); setPushEnabled(true); setPushMessage('ئاگادارکردنەوەی browser چالاک کرا.');
      }
    } catch { setPushMessage('چالاککردنی ئاگادارکردنەوە سەرکەوتوو نەبوو. مۆڵەتی browser و پەیوەندی بپشکنە.'); }
    finally { setPushBusy(false); }
  };

  const roleLabel = roles.includes('captain') ? 'کاپتن' : roles.some((role) => role.endsWith('_vendor')) ? 'فرۆشگا' : 'کڕیار';
  const visibleNotifications = notifications.filter((item) => {
    if (filter === 'unread') return !item.read_at;
    if (filter === 'orders') return item.type.startsWith('order_');
    if (filter === 'delivery') return item.type.startsWith('delivery_');
    if (filter === 'payments') return item.type === 'payment_status';
    return true;
  });

  return (
    <section className="min-h-[calc(100dvh-8rem)] bg-[var(--shakh-bg)] py-7 sm:py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-black text-[var(--shakh-orange)]">Notifications</div>
            <h1 className="mt-1 text-3xl font-black">ئاگادارکردنەوەکان</h1>
            <p className="mt-2 text-sm font-bold leading-7 text-[var(--shakh-muted)]">ئاگادارکردنەوە تایبەتەکانت وەک {roleLabel} لە ئۆردەر، گەیاندن و پارەدان.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={pushBusy} onClick={() => void toggleBrowserPush()} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 text-xs font-black text-black/60 hover:bg-black/[0.03] disabled:opacity-50">
              <Bell size={16} /> {pushBusy ? 'چاوەڕوانبە...' : pushEnabled ? 'ناچالاککردنی Browser Push' : 'چالاککردنی Browser Push'}
            </button>
            <button disabled={unreadCount === 0} onClick={() => void markAllRead()} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--shakh-navy)] px-4 text-xs font-black text-white disabled:opacity-40">
              <CheckCheck size={16} /> هەموو بخوێنەوە
            </button>
          </div>
        </div>

        {pushMessage ? <p role="status" className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-black/55">{pushMessage}</p> : null}
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="جۆری ئاگادارکردنەوە">
          {([['all','هەموو'],['unread','نەخوێندراوەکان'],['orders','ئۆردەر'],['delivery','گەیاندن'],['payments','پارەدان']] as const).map(([value,label]) => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-black ${filter === value ? 'bg-[var(--shakh-navy)] text-white' : 'bg-white text-black/55'}`}>{label}</button>)}
        </div>


        {loading ? <div className="mt-6 rounded-[1.5rem] bg-white p-10 text-center text-sm font-bold text-[var(--shakh-muted)]">بارکردن...</div> : visibleNotifications.length === 0 ? (
          <div className="mt-6 rounded-[1.65rem] border border-dashed border-black/10 bg-white p-12 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--shakh-orange)]/10 text-[var(--shakh-orange)]"><Bell size={23} /></div>
            <h2 className="mt-5 text-xl font-black">هێشتا هیچ ئاگادارکردنەوەیەک نییە</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--shakh-muted)]">کاتێک داواکاری یان گەیاندنێک بگۆڕێت، لێرەدا بە شێوەی ڕاستەوخۆ دەردەکەوێت.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {visibleNotifications.map((notification) => {
              const Icon = iconByType[notification.type] ?? Bell;
              const content = (
                <div className={`rounded-[1.4rem] border bg-white p-4 shadow-[var(--shakh-shadow-sm)] transition sm:p-5 ${notification.read_at ? 'border-black/[0.05]' : 'border-[var(--shakh-orange)]/25 bg-[var(--shakh-orange)]/[0.035]'}`}>
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--shakh-navy)] text-white"><Icon size={18} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2"><h2 className="font-black">{notification.title_ku}</h2>{!notification.read_at ? <span className="rounded-full bg-[var(--shakh-orange)]/10 px-2 py-0.5 text-[10px] font-black text-[var(--shakh-orange)]">نوێ</span> : null}</div>
                          <p className="mt-1 text-sm leading-7 text-black/55">{notification.body_ku}</p>
                        </div>
                        <div className="shrink-0 text-[11px] font-bold text-black/30" dir="ltr">{formatTime(notification.created_at)}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!notification.read_at ? <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); void markRead(notification.id); }} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-black/[0.04] px-3 text-[11px] font-black text-black/55"><CircleCheck size={14} /> وەکو خوێندراو</button> : <span className="inline-flex items-center gap-2 text-[11px] font-bold text-black/30"><CircleCheck size={14} /> خوێندراوە</span>}
                        {notification.route ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--shakh-blue)]">بینین <ChevronLeft size={13} /></span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
              return notification.route ? <Link key={notification.id} to={notification.route} onClick={() => void markRead(notification.id)}>{content}</Link> : <div key={notification.id}>{content}</div>;
            })}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-4 rounded-3xl border border-black/[0.05] bg-white p-4 text-xs font-bold text-[var(--shakh-muted)]">
          <span className="flex items-center gap-2"><Clock3 size={15} /> {visibleNotifications.length.toLocaleString('en-US')} ئاگادارکردنەوە نیشان دەدرێت.</span>
          <button onClick={() => void refresh()} className="font-black text-[var(--shakh-blue)]">نوێکردنەوە</button>
        </div>
      </div>
    </section>
  );
}

