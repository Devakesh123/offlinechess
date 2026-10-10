const CACHE = "knightlab-v1";

const FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./engine.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/chess.js",
  "./vendor/chess-LICENSE.txt",
  "./vendor/stockfish-19-lite-single.js",
  "./vendor/stockfish-19-lite-single.wasm",
  "./vendor/stockfish-COPYING.txt",
  "./vendor/SOURCES.txt",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith("knightlab-") && name !== CACHE)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      return await fetch(event.request);
    } catch {
      if (event.request.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return new Response("This file is unavailable offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data !== "check-cache") return;

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const checks = await Promise.all(FILES.map(file => cache.match(file)));
    event.ports[0]?.postMessage(checks.every(Boolean) ? "ready" : "missing");
  })());
});
