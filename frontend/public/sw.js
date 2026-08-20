const CACHE_NAME = 'flowstate-v2';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/images/logo-icon.png',
  '/images/logo-pwa.png',
];

// ─── INSTALL: Cache static assets ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── ACTIVATE: Clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── FETCH: Network first, cache fallback ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && event.request.mode === 'navigate') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
self.addEventListener('push', function(event) {
  let data = { title: 'FlowState', body: 'You have a new notification', url: '/dashboard' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      // If JSON parse fails, use text as body
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/images/logo-icon.png',
    badge: '/images/logo-icon.png',
    data: { url: data.data?.url || data.url || '/dashboard' },
    vibrate: [100, 50, 100],
    tag: data.tag || 'flowstate-notification',
    renotify: true,
    requireInteraction: false,
    actions: [{ action: 'open', title: 'Open FlowState' }],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Try to focus an existing window
      for (const client of windowClients) {
        if ('focus' in client) {
          // If the client URL starts with the target path, focus it
          try {
            const clientUrl = new URL(client.url);
            const targetUrl = new URL(urlToOpen, self.location.origin);
            if (clientUrl.pathname === targetUrl.pathname) {
              return client.focus();
            }
          } catch {
            // Fallback: just focus any available client
            return client.focus();
          }
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
