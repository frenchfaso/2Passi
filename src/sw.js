/* eslint-disable no-undef */
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
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

const MAX_TILES_AUTO = 300;
const AUTO_CACHE_CONCURRENCY = 6;
const MAX_TILE_AGE_SECONDS = 60 * 60 * 24 * 90;

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
  new CacheFirst({
    cacheName: TILE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 2500,
        maxAgeSeconds: MAX_TILE_AGE_SECONDS,
        purgeOnQuotaError: true
      }),
      tileAccessPlugin
    ]
  })
);

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of clients) c.postMessage(msg);
}

function clampLat(lat) {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function lon2tileX(lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  return Math.floor(Math.max(0, Math.min(n - 1, x)));
}

function lat2tileY(lat, z) {
  const n = 2 ** z;
  const latRad = (clampLat(lat) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return Math.floor(Math.max(0, Math.min(n - 1, y)));
}

function renderTileUrl(template, { z, x, y }) {
  return template
    .replaceAll("{z}", String(z))
    .replaceAll("{x}", String(x))
    .replaceAll("{y}", String(y))
    .replaceAll("{s}", "a");
}

async function autoCacheTiles({ tileTemplate, bbox, zooms, paddingRatio }) {
  if (!tileTemplate || !bbox || !Array.isArray(zooms) || zooms.length === 0) return;

  const latSpan = bbox.maxLat - bbox.minLat;
  const lonSpan = bbox.maxLon - bbox.minLon;
  const padLat = (latSpan || 0.01) * (paddingRatio ?? 0);
  const padLon = (lonSpan || 0.01) * (paddingRatio ?? 0);

  const minLat = clampLat(bbox.minLat - padLat);
  const maxLat = clampLat(bbox.maxLat + padLat);
  let minLon = bbox.minLon - padLon;
  let maxLon = bbox.maxLon + padLon;

  minLon = Math.max(-180, Math.min(180, minLon));
  maxLon = Math.max(-180, Math.min(180, maxLon));

  const urls = [];
  for (const z of zooms) {
    const zoom = Math.max(0, Math.min(19, Math.round(z)));
    const n = 2 ** zoom;

    let xMin = lon2tileX(minLon, zoom);
    let xMax = lon2tileX(maxLon, zoom);
    const yMin = lat2tileY(maxLat, zoom);
    const yMax = lat2tileY(minLat, zoom);

    const pushRange = (x0, x1) => {
      for (let x = x0; x <= x1; x++) {
        for (let y = yMin; y <= yMax; y++) {
          urls.push(renderTileUrl(tileTemplate, { z: zoom, x, y }));
          if (urls.length >= MAX_TILES_AUTO) return true;
        }
      }
      return false;
    };

    if (xMin > xMax) {
      if (pushRange(xMin, n - 1)) break;
      if (pushRange(0, xMax)) break;
    } else {
      if (pushRange(xMin, xMax)) break;
    }
  }

  const total = urls.length;
  if (total === 0) return;

  let done = 0;
  let errors = 0;

  await broadcast({ type: "tileAutoCacheProgress", done, total, errors });

  const cache = await caches.open(TILE_CACHE);
  const next = () => urls.shift();

  async function workerLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = next();
      if (!url) return;
      try {
        const req = new Request(url, { mode: "no-cors", credentials: "omit" });
        const cached = await cache.match(req);
        if (cached) {
          queueTouchTile(url);
          continue;
        }
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) {
          await cache.put(req, res.clone());
          queueTouchTile(url);
        } else {
          errors++;
        }
      } catch {
        errors++;
      } finally {
        done++;
        await broadcast({ type: "tileAutoCacheProgress", done, total, errors });
      }
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(AUTO_CACHE_CONCURRENCY, total); i++) runners.push(workerLoop());
  await Promise.all(runners);
  await flushTouches();
}

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

  if (data.type === "TILE_AUTO_CACHE") {
    event.waitUntil(autoCacheTiles(data));
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
