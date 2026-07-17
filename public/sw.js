// public/sw.js
// Service Worker — Cashier CRM PWA
// Provides: offline page cache + static asset cache
// Does NOT cache API calls (data integrity requirement)

const CACHE_VERSION = "cashier-crm-v1";
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const PAGE_CACHE    = `${CACHE_VERSION}-pages`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icon.svg",
  "/logo.png",
  "/logo-sidebar.png",
];

// API routes that should NEVER be cached
const NO_CACHE_PATTERNS = [
  /^\/api\//,
  /\/backup\//,
  /\/transactions\//,
  /\/migration\//,
  /\/auth\//,
  /\/_next\/data\//,
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS.filter(url => url !== "/offline.html")))
      .catch(() => {}) // Don't fail install if some assets are missing
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith("cashier-crm-") && k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: serve from cache with network fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API routes entirely
  if (request.method !== "GET") return;
  if (NO_CACHE_PATTERNS.some(p => p.test(url.pathname))) return;
  if (url.origin !== self.location.origin) return;

  // _next/static — cache first (immutable assets)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put(request, clone));
        return res;
      }))
    );
    return;
  }

  // Pages — network first, fall back to cache, then offline page
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(PAGE_CACHE).then(c => c.put(request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(request)
          .then(cached => cached || caches.match("/offline.html") || new Response(
            "<h1>أنت غير متصل بالإنترنت</h1><p>يرجى التحقق من الاتصال والمحاولة مجدداً.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
          ))
      )
  );
});

// Listen for skip-waiting message from app
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
