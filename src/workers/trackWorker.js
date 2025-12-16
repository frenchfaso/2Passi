const R = 6371000;

let track = null;

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δφ = (lat2 - lat1) * toRad;
  const Δλ = (lon2 - lon1) * toRad;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function projectEquirect(latDeg, lonDeg, lat0Rad) {
  const toRad = Math.PI / 180;
  const lat = latDeg * toRad;
  const lon = lonDeg * toRad;
  return {
    x: lon * Math.cos(lat0Rad) * R,
    y: lat * R
  };
}

function unprojectEquirect(x, y, lat0Rad) {
  const lat = y / R;
  const lon = x / (R * Math.cos(lat0Rad));
  const toDeg = 180 / Math.PI;
  return { lat: lat * toDeg, lon: lon * toDeg };
}

function nearestSegmentProjection(latDeg, lonDeg, maxDistanceM) {
  if (!track || !track.lat || track.lat.length < 2) return null;
  const lat0Rad = (latDeg * Math.PI) / 180;
  const p = projectEquirect(latDeg, lonDeg, lat0Rad);

  let best = {
    dist2: Infinity,
    i: 0,
    t: 0,
    x: 0,
    y: 0
  };

  const N = track.lat.length;
  for (let i = 0; i < N - 1; i++) {
    const a = projectEquirect(track.lat[i], track.lon[i], lat0Rad);
    const b = projectEquirect(track.lat[i + 1], track.lon[i + 1], lat0Rad);

    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;

    const ab2 = abx * abx + aby * aby;
    const tRaw = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    const t = Math.max(0, Math.min(1, tRaw));

    const x = a.x + t * abx;
    const y = a.y + t * aby;

    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;

    if (d2 < best.dist2) {
      best = { dist2: d2, i, t, x, y };
    }
  }

  const distanceM = Math.sqrt(best.dist2);
  if (Number.isFinite(maxDistanceM) && distanceM > maxDistanceM) return { near: false, distanceM };

  const ll = unprojectEquirect(best.x, best.y, lat0Rad);
  return {
    near: true,
    i: best.i,
    t: best.t,
    lat: ll.lat,
    lon: ll.lon,
    distanceM
  };
}

function processTrack(lat, lon, ele, timeMs) {
  const N = lat.length;
  const distM = new Float64Array(N);

  let total = 0;
  let ascent = 0;
  let descent = 0;

  let eleStart = ele[0] || 0;
  let eleMin = eleStart;
  let eleMax = eleStart;

  for (let i = 1; i < N; i++) {
    const d = haversine(lat[i - 1], lon[i - 1], lat[i], lon[i]);
    total += d;
    distM[i] = total;

    const de = ele[i] - ele[i - 1];
    if (Number.isFinite(de)) {
      if (de > 0) ascent += de;
      else descent += Math.abs(de);
    }

    eleMin = Math.min(eleMin, ele[i]);
    eleMax = Math.max(eleMax, ele[i]);
  }

  const eleNorm = new Float32Array(N);
  for (let i = 0; i < N; i++) eleNorm[i] = ele[i] - eleStart;

  let startTimeMs = null;
  let endTimeMs = null;
  if (timeMs && timeMs.length === N) {
    for (let i = 0; i < N; i++) {
      const t = timeMs[i];
      if (Number.isFinite(t) && t > 0) {
        startTimeMs = t;
        break;
      }
    }
    for (let i = N - 1; i >= 0; i--) {
      const t = timeMs[i];
      if (Number.isFinite(t) && t > 0) {
        endTimeMs = t;
        break;
      }
    }
  }

  return {
    distM,
    eleNorm,
    stats: {
      pointCount: N,
      totalDistanceM: total,
      ascentM: ascent,
      descentM: descent,
      eleStart,
      eleMin,
      eleMax,
      hasTime: Boolean(startTimeMs && endTimeMs),
      startTimeMs,
      endTimeMs
    }
  };
}

self.addEventListener("message", (event) => {
  const { type, id } = event.data || {};

  const reply = (payload, transfer) => {
    self.postMessage({ replyTo: id, ...payload }, transfer || []);
  };

  try {
    if (type === "PROCESS_TRACK") {
      const lat = new Float64Array(event.data.latBuffer);
      const lon = new Float64Array(event.data.lonBuffer);
      const ele = new Float32Array(event.data.eleBuffer);
      const timeMs = new Float64Array(event.data.timeBuffer);

      const res = processTrack(lat, lon, ele, timeMs);
      track = { lat, lon };

      reply(
        {
          ok: true,
          distMBuffer: res.distM.buffer,
          eleNormBuffer: res.eleNorm.buffer,
          stats: res.stats
        },
        [res.distM.buffer, res.eleNorm.buffer]
      );
      return;
    }

    if (type === "SNAP_TO_TRACK") {
      const result = nearestSegmentProjection(event.data.lat, event.data.lon, event.data.maxDistanceM);
      reply({ ok: true, result });
      return;
    }

    if (type === "NEAREST_POINT") {
      const result = nearestSegmentProjection(event.data.lat, event.data.lon, Infinity);
      reply({ ok: true, result });
      return;
    }

    reply({ ok: false, error: `Unknown worker message: ${type}` });
  } catch (e) {
    reply({ ok: false, error: e?.message || String(e) });
  }
});
