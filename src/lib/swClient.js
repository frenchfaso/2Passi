export function createSwClient() {
  const listeners = new Set();

  navigator.serviceWorker?.addEventListener("message", (event) => {
    for (const fn of listeners) fn(event.data);
  });

  function post(type, payload) {
    const msg = { type, ...payload };
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
  }

  async function requestResponse(type, payload) {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return { ok: false, error: "No service worker controller." };
    const id = crypto.randomUUID();

    return new Promise((resolve) => {
      let timeout = null;
      const onMessage = (event) => {
        const data = event.data;
        if (!data || data.replyTo !== id) return;
        if (timeout) clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve(data);
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      controller.postMessage({ type, id, ...payload });
      timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve({ ok: false, error: "Timeout." });
      }, 15000);
    });
  }

  return {
    onProgress(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    requestTileAutoCache({ tileTemplate, bbox, zooms, paddingRatio }) {
      post("TILE_AUTO_CACHE", { tileTemplate, bbox, zooms, paddingRatio });
    },
    async deleteAllTiles() {
      const res = await requestResponse("TILES_CLEAR_ALL", {});
      if (!res.ok) throw new Error(res.error || "Failed.");
      return res;
    },
    async pruneTilesOlderThan({ maxAgeSeconds }) {
      const res = await requestResponse("TILES_PRUNE", { maxAgeSeconds });
      if (!res.ok) throw new Error(res.error || "Failed.");
      return res;
    }
  };
}
