import { t } from "./i18n";

export function createSwClient() {
  async function requestResponse(type, payload) {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) return { ok: false, errorCode: "errors.swNoController" };
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
        resolve({ ok: false, errorCode: "errors.timeout" });
      }, 60000);
    });
  }

  return {
    async deleteAllTiles() {
      const res = await requestResponse("TILES_CLEAR_ALL", {});
      if (!res.ok) throw new Error((res.errorCode && t(res.errorCode)) || res.error || t("errors.failed"));
      return res;
    },
    async pruneTilesOlderThan({ maxAgeSeconds }) {
      const res = await requestResponse("TILES_PRUNE", { maxAgeSeconds });
      if (!res.ok) throw new Error((res.errorCode && t(res.errorCode)) || res.error || t("errors.failed"));
      return res;
    }
  };
}
