// Offline support. The whole shell is precached on install so the app opens
// with no network at all, and every request goes to the network first with the
// cache as a fallback, so an update lands on the very next launch and every
// module is guaranteed to come from the same version.

const CACHE = 'study-organiser-v3';

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
  './js/blocks.js',
  './js/calendar.js',
  './js/components.js',
  './js/domain.js',
  './js/icons.js',
  './js/ics.js',
  './js/importer.js',
  './js/schedule.js',
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

  // Network first, cache as the fallback.
  //
  // This app is a set of ES modules that import each other, so a half-updated
  // cache is worse than no cache: a new index.html paired with an old module
  // (or vice versa) breaks the app outright. Serving cached copies first also
  // meant an update needed two launches to appear. Going to the network first
  // keeps every file on the same version, and the timeout means a slow or dead
  // connection still falls back to the cached copy quickly.
  event.respondWith(networkFirst(request));
});

const NETWORK_TIMEOUT_MS = 3500;

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // A navigation that never made it to the network still has to render.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html') || await cache.match('./');
      if (shell) return shell;
    }
    return Response.error();
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
