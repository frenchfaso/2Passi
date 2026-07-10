import { t } from "./i18n.js";

function firstByLocalName(node, localName) {
  if (!node) return null;
  const anyNs = node.getElementsByTagNameNS?.("*", localName);
  if (anyNs && anyNs.length) return anyNs[0];
  const noNs = node.getElementsByTagName?.(localName);
  if (noNs && noNs.length) return noNs[0];
  return null;
}

function firstDirectChildByLocalName(node, localName) {
  if (!node) return null;
  const children = Array.from(node.children ?? node.childNodes ?? []);
  return children.find((child) => child?.nodeType === 1 && (child.localName || child.nodeName) === localName) ?? null;
}

function textOfDirectChild(node, localName) {
  const el = firstDirectChildByLocalName(node, localName);
  return el?.textContent?.trim() || "";
}

function parseNumber(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function parseGpxBlob(blob, { fallbackName } = {}) {
  const xmlText = await blob.text();
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(t("errors.gpxParseError"));
  }

  const gpx = doc.documentElement ?? doc;
  const trk = firstDirectChildByLocalName(gpx, "trk") || firstByLocalName(gpx, "trk");

  const name = (trk && textOfDirectChild(trk, "name")) || fallbackName || "";
  const metadata = firstDirectChildByLocalName(gpx, "metadata");
  const description = (trk && textOfDirectChild(trk, "desc")) || textOfDirectChild(metadata, "desc") || "";

  const pts = Array.from(doc.getElementsByTagNameNS?.("*", "trkpt") ?? doc.getElementsByTagName("trkpt") ?? []);
  if (pts.length === 0) throw new Error(t("errors.gpxNoPoints"));

  const latlngs = [];
  const lat = [];
  const lon = [];
  const ele = [];
  const timeMs = [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const pt of pts) {
    const la = parseNumber(pt.getAttribute("lat"));
    const lo = parseNumber(pt.getAttribute("lon"));
    if (la == null || lo == null) continue;

    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLon = Math.min(minLon, lo);
    maxLon = Math.max(maxLon, lo);

    const eleStr = textOfDirectChild(pt, "ele");
    const e = parseNumber(eleStr);

    const tStr = textOfDirectChild(pt, "time");
    const t = tStr ? Date.parse(tStr) : NaN;

    latlngs.push([la, lo]);
    lat.push(la);
    lon.push(lo);
    ele.push(e ?? Number.NaN);
    timeMs.push(Number.isFinite(t) ? t : -1);
  }

  if (latlngs.length < 2) throw new Error(t("errors.gpxNotEnoughPoints"));

  const firstKnownElevation = ele.find((value) => Number.isFinite(value));
  const hasElevation = firstKnownElevation != null;
  let lastKnownElevation = firstKnownElevation ?? 0;
  for (let i = 0; i < ele.length; i++) {
    if (Number.isFinite(ele[i])) lastKnownElevation = ele[i];
    else ele[i] = lastKnownElevation;
  }

  return {
    name,
    description,
    latlngs,
    bounds: {
      minLat,
      maxLat,
      minLon,
      maxLon
    },
    lat: new Float64Array(lat),
    lon: new Float64Array(lon),
    ele: new Float32Array(ele),
    timeMs: new Float64Array(timeMs),
    hasElevation
  };
}

export async function setGpxTrackName(blob, nextName) {
  const xmlText = await blob.text();
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(t("errors.gpxParseError"));
  }

  const gpx = doc.documentElement ?? doc;
  const trk = firstDirectChildByLocalName(gpx, "trk") || firstByLocalName(gpx, "trk") || gpx;
  let nameEl = firstDirectChildByLocalName(trk, "name");
  if (!nameEl) {
    const ns = trk?.namespaceURI || gpx?.namespaceURI || null;
    nameEl = ns ? doc.createElementNS(ns, "name") : doc.createElement("name");
    trk.insertBefore(nameEl, trk.firstChild);
  }
  nameEl.textContent = String(nextName ?? "");

  const out = new XMLSerializer().serializeToString(doc);
  return new Blob([out], { type: blob.type || "application/gpx+xml" });
}
