self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SHAKH Delivery', body: event.data.text() };
  }

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

  // Notifications may contain a route for deep linking, but never open a
  // foreign origin from a payload.
  let destination = new URL('/', self.location.origin);
  try {
    const requested = new URL(event.notification.data?.url || '/', self.location.origin);
    if (requested.origin === self.location.origin) destination = requested;
  } catch {
    // Fall back to the app home page if the notification URL is malformed.
  }

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (existing) {
      const focusedClient = existing.url === destination.href
        ? existing
        : await existing.navigate(destination.href) || existing;
      return focusedClient.focus();
    }

    return self.clients.openWindow(destination.href);
  }));
});
