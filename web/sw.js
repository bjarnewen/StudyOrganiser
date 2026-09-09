// Offline support. The app is a handful of static files, so the whole shell is
// precached on install and served stale-while-revalidate afterwards: pages open
// instantly and with no network at all, and a new deploy lands on the next launch.

const CACHE = 'study-organiser-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.svg',
  './js/app.js',
  './js/calendar.js',
  './js/components.js',
  './js/domain.js',
  './js/icons.js',
  './js/ics.js',
  './js/importer.js',
  './js/store.js',
  './js/sync.js',
  './js/ui.js',
  './js/views/today.js',
  './js/views/schedule.js',
  './js/views/assignments.js',
  './js/views/subjects.js',
  './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; adding individually means one 404 can't
      // leave the app with no offline copy at all.
      .then((cache) => Promise.all(SHELL.map((path) => cache.add(path).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch the GitHub API (sync) or any other origin.
  if (url.origin !== self.location.origin) return;

  // The calendar mirror must always be fresh; it changes on GitHub's schedule.
  if (url.pathname.endsWith('/calendar.ics')) return;

  // A navigation should still resolve to the shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
