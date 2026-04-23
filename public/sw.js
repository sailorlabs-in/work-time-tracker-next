/**
 * WorkTracker Service Worker
 *
 * Strategy:
 *  - Static assets (/_next/static/*) → Cache-First (long-lived, versioned)
 *  - App shell pages (/dashboard, /calendar, etc.) → Network-First with cache fallback
 *  - API routes (/api/*) → Network-Only (offline queue in useWorkTimer handles these)
 *  - Everything else → Network-First with cache fallback
 */

const CACHE_VERSION = "wtt-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

// Static asset patterns that should be cached aggressively
const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\/icons\//,
  /\/manifest\.json$/,
  /\.(svg|png|ico|woff|woff2|ttf|eot)$/,
];

// API routes — never cache, always network only
const API_PATTERN = /^\/api\//;

// Pages and assets to pre-cache on install (app shell)
const PRECACHE_PAGES = [
  "/dashboard",
  "/calendar",
  "/login",
  "/settings",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

// ── Install: pre-cache critical app shell pages ───────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) =>
      cache.addAll(PRECACHE_PAGES).catch(() => {
        // Some pages may fail to pre-cache (e.g. auth-gated) — ignore
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: main routing logic ─────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // API routes → Network Only (never cache)
  if (API_PATTERN.test(url.pathname)) return;

  // Static assets → Cache First
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname) || p.test(url.href))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // All other requests (pages) → Network First with page cache fallback
  event.respondWith(networkFirst(request, PAGE_CACHE));
});

// ── Strategies ────────────────────────────────────────────────────────────────

/**
 * Cache First: serve from cache if available, otherwise fetch and cache.
 * Best for versioned static assets that never change for a given URL.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

/**
 * Network First: always try network, fall back to cache.
 * Best for HTML pages that should show fresh content when online.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — serve from cache
    const cached = await cache.match(request);
    if (cached) return cached;

    // No cache for this specific URL — try to serve the dashboard as app shell
    const dashboardCached = await cache.match("/dashboard");
    if (dashboardCached) return dashboardCached;

    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WorkTracker — Offline</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0d0d1a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { text-align: center; padding: 2rem; max-width: 360px; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; }
    a { color: #a78bfa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📶 Offline</h1>
    <p>You appear to be offline and this page has not been cached yet.</p>
    <p>Please <a href="/dashboard">visit the dashboard</a> once online to cache the app.</p>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
