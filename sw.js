/* AI Job Finder service worker (Phase 1).
 *
 * Security model: ALLOWLIST caching. Only the static app shell listed in SHELL is ever
 * stored. Anything else (Supabase API calls, auth, storage, Gmail, generated documents,
 * profile data) is never touched by this worker and always goes straight to the network.
 *
 * Bump CACHE_VERSION whenever any file in SHELL changes.
 */
const CACHE_VERSION = 'v1';
const CACHE = `ajf-shell-${CACHE_VERSION}`;

const SHELL_PATHS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/ui.js',
  './js/pwa.js',
  './js/pages.js',
  './js/supabase-client.js',
  './js/seed-profile.js',
  './js/offline.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// Resolve against the SW scope so the app also works when hosted under a sub-path.
const SHELL_URLS = SHELL_PATHS.map((p) => new URL(p, self.registration.scope).href);
const SHELL_SET = new Set(SHELL_URLS);
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const OFFLINE_URL = new URL('./offline.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  // No automatic skipWaiting: the page asks for it so an update never swaps code mid-session.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('ajf-shell-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin (Supabase, CDN, Google): never handled

  // Page navigations: network first, fall back to the cached shell, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(INDEX_URL)) || (await cache.match(OFFLINE_URL)) ||
          new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Static shell assets only: stale-while-revalidate.
  const clean = url.origin + url.pathname;
  if (!SHELL_SET.has(clean)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(clean);
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(clean, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || new Response('Offline', { status: 503 });
    })
  );
});
