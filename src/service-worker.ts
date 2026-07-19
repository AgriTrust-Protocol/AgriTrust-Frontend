/// <reference lib="webworker" />

/* Workbox-based service worker source for the field data PWA. The deployed
 * classic worker in public/sw.js mirrors these strategies without a build step.
 */
declare const workbox: {
  core: { clientsClaim(): void; skipWaiting(): void };
  routing: { registerRoute(match: RegExp | ((opts: { request: Request; url: URL }) => boolean), handler: unknown, method?: string): void };
  strategies: { CacheFirst: new (opts: unknown) => unknown; NetworkFirst: new (opts: unknown) => unknown; StaleWhileRevalidate: new (opts: unknown) => unknown };
  expiration: { ExpirationPlugin: new (opts: unknown) => unknown };
  backgroundSync: { BackgroundSyncPlugin: new (name: string, opts: unknown) => unknown };
};

const sw = self as unknown as ServiceWorkerGlobalScope;
const API_CACHE = "api-cache-v1";
const STATIC_CACHE = "static-v1";
const FIELD_SYNC_TAG = "sync-audits";

if (typeof workbox !== "undefined") {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  workbox.routing.registerRoute(
    ({ request, url }) => request.destination === "script" || request.destination === "style" || url.pathname.startsWith("/_next/static/"),
    new workbox.strategies.CacheFirst({ cacheName: STATIC_CACHE, plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })] })
  );

  workbox.routing.registerRoute(
    /^https?:\/\/[^/]+\/api\//,
    new workbox.strategies.NetworkFirst({ cacheName: API_CACHE, networkTimeoutSeconds: 5, plugins: [new workbox.expiration.ExpirationPlugin({ maxAgeSeconds: 5 * 60 }), new workbox.backgroundSync.BackgroundSyncPlugin(FIELD_SYNC_TAG, { maxRetentionTime: 24 * 60 })] })
  );

  workbox.routing.registerRoute(
    ({ request }) => request.mode === "navigate",
    new workbox.strategies.StaleWhileRevalidate({ cacheName: "pages-v1" })
  );
}

sw.addEventListener("install", (event) => {
  event.waitUntil(caches.open("pwa-shell-v1").then((cache) => cache.addAll(["/", "/offline"])));
});

sw.addEventListener("sync", (event: Event) => {
  const syncEvent = event as Event & { tag: string; waitUntil(promise: Promise<unknown>): void };
  if (syncEvent.tag !== FIELD_SYNC_TAG) return;
  syncEvent.waitUntil((async () => {
    const clients = await sw.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: "sync-audits-requested" }));
  })());
});

export {};
