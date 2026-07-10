/* eslint-disable no-undef */
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { openDB } from "idb";
import { DB_NAME, DB_VERSION, ensureDbSchema } from "./lib/dbSchema";

clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const scopePath = new URL(self.registration.scope).pathname;
const scopeBase = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${scopeBase}index.html`)));

const TILE_CACHE = "tiles-v1";

let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(upgradeDb) {
        ensureDbSchema(upgradeDb);
      }
    });
  }
  return dbPromise;
}

const pendingTouches = new Map();
let flushTimer = null;

function queueTouchTile(tileUrl) {
  if (!tileUrl) return;
  pendingTouches.set(tileUrl, Date.now());
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTouches().catch(() => {});
  }, 1000);
}

async function flushTouches() {
  if (pendingTouches.size === 0) return;
  const db = await getDb();
  const tx = db.transaction("tileAccess", "readwrite");
  for (const [tileUrl, lastAccessedAt] of pendingTouches.entries()) {
    tx.store.put({ tileUrl, lastAccessedAt });
  }
  pendingTouches.clear();
  await tx.done;
}

function isLikelySlippyTileUrl(url) {
  if (!url || !url.pathname) return false;
  return /\/\d+\/\d+\/\d+(@2x)?\.(png|jpg|jpeg|webp)$/i.test(url.pathname);
}

const tileAccessPlugin = {
  cachedResponseWillBeUsed: async ({ request, cachedResponse }) => {
    if (cachedResponse) queueTouchTile(request.url);
    return cachedResponse;
  },
  fetchDidSucceed: async ({ request, response }) => {
    queueTouchTile(request.url);
    return response;
  }
};

registerRoute(
  ({ request, url }) => request.method === "GET" && isLikelySlippyTileUrl(url),
  // Serve previously viewed tiles immediately while the browser HTTP cache
  // revalidates according to the provider's response headers.
  new StaleWhileRevalidate({
    cacheName: TILE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 2500,
        purgeOnQuotaError: true
      }),
      tileAccessPlugin
    ]
  })
);

async function clearAllTiles() {
  await caches.delete(TILE_CACHE);
  const db = await getDb();
  const tx = db.transaction("tileAccess", "readwrite");
  tx.store.clear();
  await tx.done;
}

async function pruneTilesOlderThan({ maxAgeSeconds }) {
  const cutoff = Date.now() - Math.max(0, maxAgeSeconds) * 1000;
  await flushTouches();

  const db = await getDb();
  const cache = await caches.open(TILE_CACHE);
  let deleted = 0;
  const pendingCacheDeletes = [];

  const tx = db.transaction("tileAccess", "readwrite");
  for await (const cursor of tx.store.iterate()) {
    const v = cursor.value;
    if (!v || !Number.isFinite(v.lastAccessedAt) || v.lastAccessedAt >= cutoff) continue;
    const req = new Request(String(cursor.key), { mode: "no-cors", credentials: "omit" });
    pendingCacheDeletes.push(cache.delete(req));
    cursor.delete();
    deleted++;

    if (pendingCacheDeletes.length >= 50) {
      await Promise.allSettled(pendingCacheDeletes);
      pendingCacheDeletes.length = 0;
    }
  }
  if (pendingCacheDeletes.length > 0) await Promise.allSettled(pendingCacheDeletes);
  await tx.done;
  return { deleted };
}

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (!data?.type) return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "TILES_CLEAR_ALL") {
    event.waitUntil(
      (async () => {
        try {
          await clearAllTiles();
          event.source?.postMessage({ replyTo: data.id, ok: true });
        } catch (e) {
          event.source?.postMessage({
            replyTo: data.id,
            ok: false,
            errorCode: "errors.failed",
            error: e?.message || ""
          });
        }
      })()
    );
    return;
  }

  if (data.type === "TILES_PRUNE") {
    event.waitUntil(
      (async () => {
        try {
          const res = await pruneTilesOlderThan({ maxAgeSeconds: Number(data.maxAgeSeconds) || 0 });
          event.source?.postMessage({ replyTo: data.id, ok: true, ...res });
        } catch (e) {
          event.source?.postMessage({
            replyTo: data.id,
            ok: false,
            errorCode: "errors.failed",
            error: e?.message || ""
          });
        }
      })()
    );
    return;
  }
});
