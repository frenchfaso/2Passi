function firstByLocalName(node, localName) {
  if (!node) return null;
  const anyNs = node.getElementsByTagNameNS?.("*", localName);
  if (anyNs && anyNs.length) return anyNs[0];
  const noNs = node.getElementsByTagName?.(localName);
  if (noNs && noNs.length) return noNs[0];
  return null;
}

function textOfFirst(node, localName) {
  const el = firstByLocalName(node, localName);
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
    throw new Error("Invalid GPX file (XML parse error).");
  }

  const gpx = doc.documentElement ?? doc;
  const trk = firstByLocalName(gpx, "trk");

  const name = (trk && textOfFirst(trk, "name")) || fallbackName || "Untitled track";
  const metadata = firstByLocalName(gpx, "metadata");
  const description = (trk && textOfFirst(trk, "desc")) || textOfFirst(metadata, "desc") || "";

  const pts = Array.from(doc.getElementsByTagNameNS?.("*", "trkpt") ?? doc.getElementsByTagName("trkpt") ?? []);
  if (pts.length === 0) throw new Error("No <trkpt> points found in GPX.");

  const latlngs = [];
  const lat = [];
  const lon = [];
  const ele = [];
  const timeMs = [];

  let lastEle = 0;
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

    const eleStr = textOfFirst(pt, "ele");
    const e = parseNumber(eleStr);
    if (e != null) lastEle = e;

    const tStr = textOfFirst(pt, "time");
    const t = tStr ? Date.parse(tStr) : NaN;

    latlngs.push([la, lo]);
    lat.push(la);
    lon.push(lo);
    ele.push(e ?? lastEle ?? 0);
    timeMs.push(Number.isFinite(t) ? t : -1);
  }

  if (latlngs.length < 2) throw new Error("Not enough valid points.");

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
    timeMs: new Float64Array(timeMs)
  };
}
