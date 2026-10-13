self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'SHAKH Delivery', body: event.data.text() }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'SHAKH Delivery', {
    body: payload.body || '',
    tag: payload.tag || 'shakh-notification',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: payload.url || '/' },
    dir: 'rtl',
    lang: 'ku',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === destination);
    if (existing) return existing.focus();
    return self.clients.openWindow(destination);
  }));
});

