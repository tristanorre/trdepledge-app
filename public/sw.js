// T.R. Depledge field-app service worker.
//
// One worker, two responsibilities:
//   1. Forward push events to OneSignal's SDK so notifications work.
//   2. Cache the app shell + recently-viewed worker pages so the team
//      can open the app on a flaky 4G site and still see today's jobs.
//
// Registered by ServiceWorkerRegister.tsx on the client. OneSignal is
// configured to use this same worker (serviceWorkerPath in OneSignalRegister.tsx),
// so we don't end up with two competing workers at the root scope.

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// Bump this any time we ship a change to a cache-first asset (logo,
// fonts, anything in /images that's referenced by name). The activate
// handler drops any cache key whose suffix doesn't match — so a bump
// here = clean cache for everyone on their next visit.
//   v1 -> v2: new shield-and-galah logo-v16.png replaces the old badge.
//   v2 -> v3: actual T.R. Depledge brand logo (lime TR + galah +
//             yellow ribbon "GARDENING & MAINTENANCE" + "EST. 2020").
//   v3 -> v4: v3 had been built from the wrong source file (a TAJJPI
//             mark) — corrected to the real TR Depledge artwork.
const VERSION = "v4";
const SHELL_CACHE = `trdepledge-shell-${VERSION}`;
const PAGE_CACHE  = `trdepledge-pages-${VERSION}`;

// Pre-cached shell — keep tight. Anything else is cached on first hit.
const SHELL = [
  "/",
  "/login",
  "/logo.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Drop old caches between deploys.
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("trdepledge-") && !k.endsWith(VERSION))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // skip mutations entirely

  const url = new URL(req.url);

  // Never cache API responses or auth — always go to network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) {
    return;
  }

  // We deliberately do NOT cache `/admin/*` or `/worker/*` HTML.
  //   1. Cross-user leak risk on shared devices (worker A's cached
  //      page would flash on screen for worker B between sign-out
  //      and revalidate).
  //   2. Cached redirects pin auth state — a 302 to /login from an
  //      expired session would persist in cache.
  // If real offline support is needed later, build an explicit
  // IndexedDB-backed job summary, not stale HTML.

  // Public marketing pages + static assets: cache-first.
  if (req.destination === "image" || req.destination === "font" || req.destination === "style") {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
