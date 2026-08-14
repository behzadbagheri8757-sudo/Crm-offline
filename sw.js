/*
 * Service Worker — حبوبات و خشکبار باقری CRM
 *
 * هدف: Offline واقعی بدون هیچ دخالت در منطق مالی/IndexedDB.
 * این فایل هیچ درخواستی به IndexedDB یا هیچ API مالی نمی‌فرستد و هیچ داده‌ای را
 * تغییر نمی‌دهد؛ فقط فایل‌های استاتیک (HTML/CSS/JS/manifest/icons/تصاویر) را
 * cache می‌کند. منابع CDN با runtime caching مدیریت می‌شوند.
 */

const SW_VERSION = 'v3';
const STATIC_CACHE = 'baqeri-crm-static-' + SW_VERSION;
const RUNTIME_CACHE = 'baqeri-crm-runtime-' + SW_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './checks.html',
  './customer.html',
  './customers.html',
  './evaluation.html',
  './inventory.html',
  './invoice.html',
  './invoices.html',
  './payments.html',
  './products.html',
  './prospect-routes.html',
  './prospect.html',
  './prospects.html',
  './reports.html',
  './settings.html',
  './supplier.html',
  './suppliers.html',
  './visits.html',

  './css/app.css',

  './js/app.js',
  './js/backup.js',
  './js/calc.js',
  './js/db.js',
  './js/models.js',
  './js/nav.js',
  './js/payments.js',
  './js/prospect-core.js',
  './js/prospect-db.js',
  './js/prospect-scoring.js',
  './js/stock.js',
  './js/ui.js',

  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './logo-export.png',
  './logo.svg'
];

const RUNTIME_CACHE_HOSTS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isRuntimeHost = RUNTIME_CACHE_HOSTS.indexOf(url.hostname) !== -1;

  if (isSameOrigin) {
    const matchOptions = (req.mode === 'navigate') ? { ignoreSearch: true } : {};
    event.respondWith(
      caches.match(req, matchOptions).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
          }
          return res;
        }).catch(() => null);

        if (cached) {
          networkFetch;
          return cached;
        }
        return networkFetch.then((res) => res || caches.match('./index.html'));
      })
    );
    return;
  }

  if (isRuntimeHost) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res) {
            const resClone = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, resClone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }
});