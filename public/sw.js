// GameStrike.io Service Worker — Lock-Screen Push Notifications & PWA Support

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'GameStrike.io',
    body: 'You have a new update from GameStrike Support.',
    icon: '/gamestrike-logo.jpg',
    badge: '/gamestrike-logo.jpg',
    url: '/#/chat',
    tag: 'gamestrike-notification',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/gamestrike-logo.jpg',
      badge: data.badge || '/gamestrike-logo.jpg',
      tag: data.tag,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: data.url || '/#/chat' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/#/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

