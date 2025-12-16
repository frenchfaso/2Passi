import L from "leaflet";

export function createMapView(
  container,
  { tileTemplate, tileAttribution, onCursorDragStart, onCursorDragMove, onCursorDragEnd } = {}
) {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true
  }).setView([45.4642, 9.19], 12);

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function closestPointOnSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const abLen2 = abx * abx + aby * aby;
    const t = abLen2 === 0 ? 0 : clamp((apx * abx + apy * aby) / abLen2, 0, 1);
    return { x: a.x + abx * t, y: a.y + aby * t, t };
  }

  function snapProjectedToTrack(p, { centerIndex, windowSize } = {}) {
    if (!trackProj || trackProj.length < 2) return null;
    const lastSeg = trackProj.length - 2;

    let startSeg = 0;
    let endSeg = lastSeg;
    if (Number.isFinite(centerIndex) && Number.isFinite(windowSize)) {
      const c = clamp(Math.trunc(centerIndex), 0, lastSeg);
      const w = Math.max(1, Math.trunc(windowSize));
      startSeg = clamp(c - w, 0, lastSeg);
      endSeg = clamp(c + w, 0, lastSeg);
    }

    let best = null;
    let bestDist2 = Infinity;
    for (let i = startSeg; i <= endSeg; i++) {
      const a = trackProj[i];
      const b = trackProj[i + 1];
      const cp = closestPointOnSegment(p, a, b);
      const dx = p.x - cp.x;
      const dy = p.y - cp.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        best = { x: cp.x, y: cp.y, t: cp.t, segIndex: i, dist2 };
      }
    }
    return best;
  }

  let tileLayer = null;
  function setTileProvider(template, attribution) {
    tileLayer?.remove();
    tileLayer = L.tileLayer(template, {
      maxZoom: 19,
      attribution
    });
    tileLayer.addTo(map);
  }

  setTileProvider(tileTemplate, tileAttribution);

  let trackLine = null;
  let startMarker = null;
  let endMarker = null;
  let cursorMarker = null;
  let cursorHandle = null;
  let trackLatLngs = null;
  let trackProj = null;
  let trackProjZoom = null;
  let trackZoomListener = null;
  let cursorSnapSegIndex = null;

  let gpsMarker = null;
  let gpsPulseMarker = null;
  let gpsAccuracy = null;
  let lastGps = null;
  let gpsStale = false;

  function gpsMarkerStyle() {
    const fillColor = gpsStale ? "rgba(148, 163, 184, 1)" : "rgba(34, 197, 94, 0.9)";
    const fillOpacity = gpsStale ? 1 : 0.6;
    return {
      radius: 8,
      weight: 2,
      color: "rgba(255,255,255,0.9)",
      fillColor,
      fillOpacity,
      interactive: false
    };
  }

  function gpsPulseStyle() {
    const strokeColor = gpsStale ? "rgba(148, 163, 184, 0)" : "rgba(34, 197, 94, 0.55)";
    return {
      radius: 8,
      weight: 3,
      color: strokeColor,
      fillOpacity: 0,
      opacity: gpsStale ? 0 : 1,
      interactive: false,
      className: "gps-pulse"
    };
  }

  function clearTrack() {
    trackLine?.remove();
    trackLine = null;
    startMarker?.remove();
    startMarker = null;
    endMarker?.remove();
    endMarker = null;
    cursorMarker?.remove();
    cursorMarker = null;
    cursorHandle?.remove();
    cursorHandle = null;
    trackLatLngs = null;
    trackProj = null;
    trackProjZoom = null;
    cursorSnapSegIndex = null;
    if (trackZoomListener) {
      map.off("zoomend", trackZoomListener);
      trackZoomListener = null;
    }
  }

  function ensureProjectedTrack() {
    if (!trackLatLngs || trackLatLngs.length < 2) return;
    const zoom = map.getZoom();
    if (trackProj && trackProjZoom === zoom) return;
    trackProjZoom = zoom;
    trackProj = trackLatLngs.map((ll) => map.project(ll, zoom));
  }

  function updateCursorSnapIndexFromLatLng(latlng, { windowSize } = {}) {
    if (!trackLatLngs || trackLatLngs.length < 2) return;
    ensureProjectedTrack();
    if (!trackProj) return;
    const zoom = trackProjZoom ?? map.getZoom();
    const p = map.project(latlng, zoom);
    const best = snapProjectedToTrack(p, { centerIndex: cursorSnapSegIndex ?? undefined, windowSize });
    if (best) cursorSnapSegIndex = best.segIndex;
  }

  function snapLatLngToTrack(latlng, { centerIndex, windowSize } = {}) {
    if (!trackLatLngs || trackLatLngs.length < 2) return latlng;
    ensureProjectedTrack();
    if (!trackProj) return latlng;

    const zoom = trackProjZoom ?? map.getZoom();
    const p = map.project(latlng, zoom);

    const best = snapProjectedToTrack(p, { centerIndex, windowSize });
    if (!best) return latlng;
    cursorSnapSegIndex = best.segIndex;
    return map.unproject(L.point(best.x, best.y), zoom);
  }

  function setTrack(latlngs) {
    clearTrack();

    trackLatLngs = latlngs.map((ll) => L.latLng(ll));
    ensureProjectedTrack();
    cursorSnapSegIndex = 0;
    trackZoomListener = () => {
      trackProj = null;
      ensureProjectedTrack();
    };
    map.on("zoomend", trackZoomListener);

    trackLine = L.polyline(latlngs, {
      color: "#60a5fa",
      weight: 4,
      opacity: 0.9
    }).addTo(map);

    const start = latlngs[0];
    const end = latlngs[latlngs.length - 1];
    startMarker = L.circleMarker(start, { radius: 5, weight: 2, color: "#22c55e", fillOpacity: 0.9 }).addTo(map);
    endMarker = L.circleMarker(end, { radius: 5, weight: 2, color: "#ef4444", fillOpacity: 0.9 }).addTo(map);

    cursorMarker = L.circleMarker(start, {
      radius: 8,
      weight: 2,
      color: "rgba(255,255,255,0.9)",
      fillColor: "rgba(1,170,255,0.9)",
      fillOpacity: 0.6
    }).addTo(map);

    // circleMarker is not draggable in core Leaflet; keep an invisible draggable handle for interaction.
    cursorHandle = L.marker(start, {
      draggable: true,
      keyboard: false,
      opacity: 0,
      icon: L.divIcon({ className: "cursor-handle", iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(map);
    cursorHandle.setZIndexOffset(1000);

    let adjusting = false;
    cursorHandle.on("dragstart", () => {
      // Initialize segment index from current cursor position to avoid shortcut jumps.
      updateCursorSnapIndexFromLatLng(cursorHandle.getLatLng(), { windowSize: trackProj?.length ?? undefined });
      const snapped = snapLatLngToTrack(cursorHandle.getLatLng(), { centerIndex: cursorSnapSegIndex ?? 0, windowSize: 200 });
      cursorHandle.setLatLng(snapped);
      cursorMarker?.setLatLng(snapped);
      onCursorDragStart?.();
    });
    cursorHandle.on("drag", () => {
      if (adjusting) return;
      const raw = cursorHandle.getLatLng();
      const snapped = snapLatLngToTrack(raw, {
        centerIndex: cursorSnapSegIndex ?? 0,
        windowSize: 80
      });
      adjusting = true;
      cursorHandle.setLatLng(snapped);
      cursorMarker?.setLatLng(snapped);
      adjusting = false;
      onCursorDragMove?.(snapped);
    });
    cursorHandle.on("dragend", () => {
      const snapped = snapLatLngToTrack(cursorHandle.getLatLng(), {
        centerIndex: cursorSnapSegIndex ?? 0,
        windowSize: 120
      });
      cursorHandle.setLatLng(snapped);
      cursorMarker?.setLatLng(snapped);
      onCursorDragEnd?.(snapped);
    });
  }

  function fitToTrack() {
    if (!trackLine) return;
    map.fitBounds(trackLine.getBounds(), { padding: [20, 20] });
  }

  function setCursor({ lat, lon }) {
    if (!cursorMarker) return;
    const ll = L.latLng(lat, lon);
    cursorMarker.setLatLng(ll);
    cursorHandle?.setLatLng(ll);
    // Keep internal index in sync cheaply; the cursor we get here is already on-track.
    updateCursorSnapIndexFromLatLng(ll, { windowSize: 200 });
  }

  function setGps({ lat, lon, accuracyM }) {
    lastGps = { lat, lon, accuracyM };
    if (!gpsStale) {
      if (!gpsPulseMarker) {
        gpsPulseMarker = L.circleMarker([lat, lon], gpsPulseStyle()).addTo(map);
      } else {
        gpsPulseMarker.setLatLng([lat, lon]);
        gpsPulseMarker.setStyle(gpsPulseStyle());
      }
    }

    if (!gpsMarker) {
      gpsMarker = L.circleMarker([lat, lon], gpsMarkerStyle()).addTo(map);
    } else {
      gpsMarker.setLatLng([lat, lon]);
      gpsMarker.setStyle(gpsMarkerStyle());
    }

    gpsPulseMarker?.bringToBack();
    gpsMarker.bringToFront();

    if (!gpsAccuracy) {
      gpsAccuracy = L.circle([lat, lon], {
        radius: accuracyM ?? 0,
        weight: 1,
        color: "rgba(34,197,94,0.65)",
        fillColor: "rgba(34,197,94,0.18)",
        fillOpacity: 0.25
      }).addTo(map);
    } else {
      gpsAccuracy.setLatLng([lat, lon]);
      gpsAccuracy.setRadius(accuracyM ?? 0);
    }
  }

  function setGpsStale(stale) {
    gpsStale = Boolean(stale);
    if (!gpsMarker) return;
    gpsMarker.setStyle(gpsMarkerStyle());
    if (gpsStale) {
      gpsPulseMarker?.remove();
      gpsPulseMarker = null;
    } else if (lastGps && !gpsPulseMarker) {
      gpsPulseMarker = L.circleMarker([lastGps.lat, lastGps.lon], gpsPulseStyle()).addTo(map);
    }
    gpsPulseMarker?.bringToBack();
    gpsMarker.bringToFront();
  }

  function panToGps() {
    if (!lastGps) return;
    map.panTo([lastGps.lat, lastGps.lon], { animate: true, duration: 0.25 });
  }

  function clearGps() {
    gpsMarker?.remove();
    gpsMarker = null;
    gpsPulseMarker?.remove();
    gpsPulseMarker = null;
    gpsAccuracy?.remove();
    gpsAccuracy = null;
    lastGps = null;
    gpsStale = false;
  }

  let invalidateTimer = null;
  function invalidateSizeSoon() {
    clearTimeout(invalidateTimer);
    invalidateTimer = setTimeout(() => map.invalidateSize(), 50);
  }

  return {
    getZoom() {
      return map.getZoom();
    },
    setTileProvider,
    setTrack,
    clearTrack,
    fitToTrack,
    setCursor,
    setGps,
    setGpsStale,
    clearGps,
    panToGps,
    invalidateSizeSoon
  };
}
