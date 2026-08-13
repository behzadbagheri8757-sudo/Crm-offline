/*
 * Service Worker — حبوبات و خشکبار باقری CRM
 *
 * هدف: Offline واقعی بدون هیچ دخالت در منطق مالی/IndexedDB.
 * این فایل هیچ درخواستی به IndexedDB یا هیچ API مالی نمی‌فرستد و هیچ داده‌ای را
 * تغییر نمی‌دهد؛ فقط فایل‌های استاتیک (HTML/CSS/JS/manifest/icons/تصاویر) و
 * منابع CDN (xlsx, html2canvas, فونت Vazirmatn) را cache می‌کند.
 *
 * نکته مهم دربارهٔ CDN: چون امکان دانلود و vendoring فیزیکی این فایل‌ها در محیط
 * تولید این تغییرات وجود نداشت، به‌جای انتقال فیزیکی، این Service Worker خودِ
 * دستگاه کاربر را وادار می‌کند در اولین استفادهٔ آنلاین این منابع را cache کند
 * (runtime caching) تا در دفعات بعد Offline هم در دسترس باشند.
 */

const SW_VERSION = 'v1';
const STATIC_CACHE = 'baqeri-crm-static-' + SW_VERSION;
const RUNTIME_CACHE = 'baqeri-crm-runtime-' + SW_VERSION;

/* لیست دقیق فایل‌های same-origin پروژه — از روی ساختار واقعی فایل‌ها
   استخراج شده، هیچ مسیری حدسی نیست. */
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

/* دامنه‌های CDN/فونت که به‌صورت runtime کش می‌شوند (چون امکان vendoring فیزیکی
   در این محیط نبود — رجوع کنید به توضیح بالای فایل). */
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

  /* فقط GET؛ درخواست‌های دیگر (اگر روزی اضافه شوند) دست‌نخورده به شبکه می‌روند
     و SW اصلاً دخالت نمی‌کند — این شامل هیچ درخواست IndexedDB نمی‌شود چون
     IndexedDB اصلاً از طریق fetch/network کار نمی‌کند و این SW هیچ راهی برای
     رهگیری آن ندارد. */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isRuntimeHost = RUNTIME_CACHE_HOSTS.indexOf(url.hostname) !== -1;

  if (isSameOrigin) {
    /* same-origin: Cache-First با fallback به شبکه، و به‌روزرسانی خاموش cache
       در پس‌زمینه (stale-while-revalidate) تا نسخهٔ جدید دیپلوی هم بالاخره
       جایگزین شود. */
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
          }
          return res;
        }).catch(() => null);

        if (cached) {
          /* نسخهٔ cache را فوراً برگردان؛ شبکه در پس‌زمینه به‌روزرسانی می‌کند */
          networkFetch;
          return cached;
        }
        return networkFetch.then((res) => res || caches.match('./index.html'));
      })
    );
    return;
  }

  if (isRuntimeHost) {
    /* CDN/فونت خارجی: Cache-First، و اگر در cache نبود از شبکه بگیر و ذخیره کن. */
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          /* پاسخ‌های فونت/CDN معمولاً opaque یا cors هستند؛ هر دو قابل cache‌اند. */
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

  /* هر درخواست دیگر (خارج از same-origin و خارج از لیست CDN شناخته‌شده) را
     دست‌نخورده می‌گذاریم — SW هیچ دخالتی نمی‌کند. */
});
