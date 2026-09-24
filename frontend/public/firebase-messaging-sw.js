// public/firebase-messaging-sw.js — push en SEGUNDO PLANO (app cerrada o pestaña oculta).
// Se registra con scope '/firebase-cloud-messaging-push-scope' (ver messaging.service.ts) para no
// competir con ngsw-worker.js, que ocupa '/'. La config web de Firebase es pública por diseño.
// Mantener la versión de los scripts compat alineada con la de 'firebase' del package.json (12.x).
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBN9-V8DwPppKwYr77NaqIUDKQDeNvoAyI',
  authDomain: 'legacyenterprise-731cb.firebaseapp.com',
  projectId: 'legacyenterprise-731cb',
  storageBucket: 'legacyenterprise-731cb.firebasestorage.app',
  messagingSenderId: '29644516990',
  appId: '1:29644516990:web:e6dfcf2d1bcf0e342c322f',
});

const messaging = firebase.messaging();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// El backend manda payload DATA-ONLY: aquí se decide cómo se ve (sin duplicados).
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'Legacy Enterprise', {
    body: d.body || '',
    icon: d.icon || '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    image: d.image || undefined,
    tag: d.uuid || d.tag || 'general',
    renotify: true,
    data: { uuid: d.uuid || '', id_sede: d.id_sede || '', link: d.link || '' },
  });
});

// Clic en el push del sistema → SIEMPRE al centro de notificaciones, con esa resaltada.
// (El destino puntual —link— se abre desde el ítem dentro de la app.)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const params = new URLSearchParams();
  if (data.uuid) params.set('n', data.uuid);
  if (data.id_sede) params.set('sede', data.id_sede);
  const target = self.location.origin + '/notificaciones' + (params.toString() ? '?' + params : '');

  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin) && 'focus' in w) {
        if ('navigate' in w) await w.navigate(target).catch(() => undefined);
        return w.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
