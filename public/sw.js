/* DisPoCAM foreground-first service worker. Never store camera/API/auth responses here. */
const VERSION = "v2";
const SHELL_CACHE = `dispocam-shell-${VERSION}`;
const ASSET_CACHE = `dispocam-assets-${VERSION}`;
const CAMERA_SHELL_URL = "/camera/offline-shell";
const OFFLINE_URL = "/offline";
const PRECACHE = [CAMERA_SHELL_URL, OFFLINE_URL, "/icons/app-icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("dispocam-") && ![SHELL_CACHE, ASSET_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "CACHE_APP_ASSETS" && Array.isArray(event.data.urls)) {
    const safeUrls = event.data.urls.filter((value) => {
      try {
        const url = new URL(value, self.location.origin);
        return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
      } catch {
        return false;
      }
    });
    event.waitUntil(caches.open(ASSET_CACHE).then((cache) => Promise.allSettled(safeUrls.map((url) => cache.add(url)))));
  }
});

async function networkNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const url = new URL(request.url);
    const fallback = (url.pathname === "/" || url.pathname.startsWith("/camera/")) ? CAMERA_SHELL_URL : OFFLINE_URL;
    return (await caches.match(fallback)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Tokenized camera navigations are network-only with a generic, token-free fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkNavigation(request));
    return;
  }

  // APIs, RSC requests, and admin data are never cached.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/") || request.headers.has("RSC")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "dispocam-photo-sync") return;
  // The raw camera token is intentionally unavailable here. Ask any open client to
  // run the existing foreground engine; otherwise the next page mount will resume it.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "BACKGROUND_SYNC_REQUESTED" }));
    }),
  );
});
