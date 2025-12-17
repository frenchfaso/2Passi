import { t } from "./i18n";

export function createTrackWorkerClient(workerUrl) {
  const worker = new Worker(workerUrl, { type: "module" });

  function request(type, payload, transfer = []) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let timeout = null;
      const onMessage = (event) => {
        if (event.data?.replyTo !== id) return;
        if (timeout) clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        if (event.data?.ok === false) reject(new Error(event.data?.error || t("errors.workerError")));
        else resolve(event.data);
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ type, id, ...payload }, transfer);
      timeout = setTimeout(() => {
        worker.removeEventListener("message", onMessage);
        reject(new Error(t("errors.workerTimeout")));
      }, 60000);
    });
  }

  return {
    async processTrack({ id, lat, lon, ele, timeMs }) {
      const transfer = [lat.buffer, lon.buffer, ele.buffer];
      const res = await request(
        "PROCESS_TRACK",
        {
          trackId: id,
          latBuffer: lat.buffer,
          lonBuffer: lon.buffer,
          eleBuffer: ele.buffer,
          timeBuffer: timeMs.buffer
        },
        transfer
      );
      return {
        distM: new Float64Array(res.distMBuffer),
        eleNorm: new Float32Array(res.eleNormBuffer),
        stats: res.stats
      };
    },
    async snapToTrack({ lat, lon, maxDistanceM }) {
      const res = await request("SNAP_TO_TRACK", { lat, lon, maxDistanceM });
      return res.result;
    },
    async nearestPoint({ lat, lon }) {
      const res = await request("NEAREST_POINT", { lat, lon });
      return res.result;
    }
  };
}
