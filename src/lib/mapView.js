import L from "leaflet";

export function createMapView(
  container,
  { tileTemplate, tileAttribution, onUserNavigate } = {}
) {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true
  }).setView([45.4642, 9.19], 12);

  map.attributionControl?.setPrefix("");

  map.on("dragstart", (e) => {
    if (!e?.originalEvent) return;
    onUserNavigate?.();
  });
  map.on("zoomstart", (e) => {
    if (!e?.originalEvent) return;
    onUserNavigate?.();
  });

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
  }

  function setTrack(latlngs) {
    clearTrack();

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
  }

  function fitToTrack() {
    if (!trackLine) return;
    map.fitBounds(trackLine.getBounds(), { padding: [20, 20] });
  }

  function setCursor({ lat, lon }) {
    if (!cursorMarker) return;
    const ll = L.latLng(lat, lon);
    cursorMarker.setLatLng(ll);
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
