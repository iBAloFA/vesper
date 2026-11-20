const CACHE = "vesper-v6";
const SHELL = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// The browser decodes cached bodies, so gzip headers would corrupt replays.
const clean = (response) => {
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const store = async (cache, request, response) => {
  if (response.ok) await cache.put(request, clean(response));
};

// Cache a stylesheet and every font it references, so offline text keeps its face.
const precacheAsset = async (cache, href, seen) => {
  if (seen.has(href)) return;
  seen.add(href);
  try {
    const response = await fetch(href);
    if (!response.ok) return;
    await store(cache, href, response.clone());
    if (!href.includes(".css")) return;
    const css = await response.text();
    const refs = [...css.matchAll(/url\((["']?)([^"')]+)\1\)/g)]
      .map((match) => match[2])
      .filter((ref) => !ref.startsWith("data:"));
    await Promise.all(refs.map((ref) => precacheAsset(cache, new URL(ref, href).href, seen)));
  } catch {
    // Best effort: a missing asset must not fail the install.
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            await store(cache, url, await fetch(url, { cache: "reload" }));
          } catch {
            // One missing shell entry must not fail the install.
          }
        }),
      );

      // Vite hashes bundle names, so discover them from the built HTML.
      try {
        const html = await (await fetch("./index.html", { cache: "no-store" })).text();
        const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((match) => match[1]);
        const seen = new Set();
        await Promise.all(
          [...new Set(assets)].map((url) => precacheAsset(cache, new URL(url, self.location.href).href, seen)),
        );
      } catch {
        // The shell still works without the precached bundle.
      }

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await store(cache, "./index.html", response.clone());
          }
          return response;
        })
        .catch(() => caches.match("./index.html", { ignoreVary: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ??
        fetch(request).then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await store(cache, request, response.clone());
          }
          return response;
        }),
    ),
  );
});
