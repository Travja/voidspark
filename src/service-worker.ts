/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Offline support. SvelteKit bundles and registers this file automatically.
// `build`, `files` and `prerendered` already include the base path (e.g. /voidspark/).
import { build, files, prerendered, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

// One cache per deploy: a new build gets a new `version`, so a new cache.
const CACHE = `voidspark-${version}`;
// Skip dotfiles such as /.nojekyll: hosts may not serve them, and one failed fetch
// would reject `cache.addAll` and stop the worker from installing.
const ASSETS = [...build, ...files.filter((f) => !/\/\.[^/]*$/.test(f)), ...prerendered];
const PRECACHED = new Set(ASSETS);

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      // Don't wait for old tabs to close: the new version takes over right away.
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await sw.clients.claim();
    })(),
  );
});

/** The prerendered app shell to show when a navigation fails offline. */
function shellFor(pathname: string): string | undefined {
  if (PRECACHED.has(pathname)) return pathname;
  // The root page is prerendered as `<base>/`; fall back to it for any page.
  return prerendered.find((p) => p.endsWith("/")) ?? prerendered[0];
}

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // Immutable build output and static files: cache-first.
  if (PRECACHED.has(url.pathname) && request.mode !== "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(url.pathname)) ?? fetch(request);
      })(),
    );
    return;
  }

  // Page navigations: network-first, falling back to the cached app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (err) {
          const cache = await caches.open(CACHE);
          const shell = shellFor(url.pathname);
          const cached = shell ? await cache.match(shell) : undefined;
          if (cached) return cached;
          throw err;
        }
      })(),
    );
    return;
  }

  // Anything else: network, falling back to whatever is cached.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
