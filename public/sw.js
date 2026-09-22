const CACHE_NAME = "sntss1puebla-portal-shell-v66";
const SHELL = [
  "/",
  "/credenciales",
  "/brand-logo-credencial.png",
  "/favicon-64.png",
  "/app-icon-192.png",
  "/app-icon-180.png",
  "/app-icon-512.png",
  "/app-icon-maskable-512.png",
  "/devi/devi-robot.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map((client) => {
      const refreshUrl = new URL(client.url);
      refreshUrl.searchParams.set("actualizar", Date.now().toString());
      return client.navigate(refreshUrl.href);
    }));
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            const cacheKey = url.pathname === "/credenciales" ? "/credenciales" : "/";
            void caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match(url.pathname === "/credenciales" ? "/credenciales" : "/")) ||
          (await caches.match("/")),
        ),
    );
    return;
  }

  if (["script", "style"].includes(request.destination)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request, { cache: "no-store" });
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          }
          const cached = await caches.match(request);
          if (cached) return cached;
          if (event.clientId) {
            void caches.delete(CACHE_NAME).then(() =>
              self.clients.get(event.clientId).then((client) => {
                const refreshUrl = new URL("/", self.location.origin);
                refreshUrl.searchParams.set("actualizar", Date.now().toString());
                return client?.navigate(refreshUrl.href);
              }),
            );
          }
          return response;
        } catch {
          return (await caches.match(request)) || Response.error();
        }
      })(),
    );
    return;
  }

  if (["image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const current = windows.find((client) => client.url.startsWith(self.location.origin));
        if (current) {
          if (event.notification.data?.target) {
            current.postMessage({
              type: "navigate",
              target: event.notification.data.target,
            });
          }
          return current.focus();
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
