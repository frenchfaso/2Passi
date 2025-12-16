# 2Passi — Specs & Implementation Plan

“2Passi” is a **mobile-first**, **offline-first** GPX viewer PWA (no backend) with map + elevation chart and a “ChatGPT-like” history side panel.

---

## 1) Goals

### Functional
- Import a GPX from device (file picker) and render immediately.
- Main view:
  - **Top ~2/3**: Leaflet map with OSM basemap + GPX polyline overlay.
  - **Bottom ~1/3**: 2D elevation chart (uPlot): X = distance from track start; Y = elevation **normalized** (ele - start ele).
- Toggleable side panel (show/hide) with **history**:
  - chat-like list of imported GPX items (title + metadata),
  - tap to open,
  - delete button to remove.
- Offline-first:
  - app shell available offline,
  - history available offline,
  - OSM tile caching driven by normal map usage (pan/zoom) + a small auto-cache on GPX open.

### Non-functional
- Minimal stack, vanilla JS, small bundle.
- Smooth performance on mobile (including long tracks).
- Privacy: all data stored locally (IndexedDB + Cache Storage).

### Non-goals (keep it minimal)
- GPX editing, routing, activity recording, accounts/cloud sync.
- 3D rendering, advanced analytics, social features.

---

## 2) UX / Layout

### App shell (mobile-first)
- **Top bar**: hamburger (toggle side panel), current track title, “Open GPX”, “…” (settings/cache).
- **Side panel** (overlay on mobile; persistent on wider screens):
  - chat-like history list (cards/bubbles),
  - each item: name + (optional) description, imported date, distance, estimated time,
  - actions: open (tap), delete.
  - panel menu item: **Settings** (opens a modal settings panel).
- **Main vertical split**:
  - map container (~66vh),
  - chart container (~34vh),
  - on landscape/tablet: optional horizontal split + persistent side panel.

### Key interactions
- **Track cursor**: user can drag/select it from either the chart (tap/drag) or the map (draggable marker). Chart and map stay in sync.
- **User position (GPS)**: realtime via `navigator.geolocation.watchPosition()` with marker + accuracy (independent from the GPX).
- **Auto snap-to-track behavior**:
  - If GPS position is plausibly near the current track, the app automatically snaps the track cursor to the nearest point on the track (projection on nearest segment).
  - While the user is actively dragging (map or chart), auto-snap is suspended.
  - On drag end: if GPS is still near the track, auto-snap resumes; otherwise the track cursor stays where the user placed it.
  
---

## 3) Minimal stack

- Build: `vite`
- PWA / SW: `vite-plugin-pwa` (Workbox)
- Storage: lightweight IndexedDB wrapper with Blob support (e.g. `idb`) + a thin app wrapper
- UI: vanilla JS (DOM), ES modules
- CSS: `src/styles.css` custom + small reset (**no inline CSS**)
- Map: `leaflet` + **OSM tiles**
- Chart: `uplot`

Note: GPX parsing and overlay rendering can remain dependency-free (DOMParser + `L.polyline`).

---

## 4) Decisions

### Locked-in
- Basemap: **OSM + Leaflet** (with strict limits / rate limiting for caching).
- History order: **newest first**.
- CSS: only `src/styles.css` (no inline).
- “Current point”: GPS marker is realtime and independent from the GPX; track cursor is a separate marker.
- Track persistence (MVP): store a **minimal Track record** (see Data model) + optional derived caches keyed by `trackId`.
- Auto tile caching on GPX open: `zFit`, `zFit+1` (clamped), with hard caps and micro-progress.
- No manual tile preload: tiles are cached as the user pans/zooms; SW only adds a small auto-cache job after opening a GPX.
- Snap-to-track: auto-enabled when GPS is plausibly near the current track; user drag temporarily disables it and resumes on drag end if still near.

### Definition: “plausibly near the track”
- A practical default is: “near” if `distance(GPS, track) <= max(30m, 2 * reportedAccuracyMeters)`.
- Treat this as a configurable constant later; for MVP keep it simple and conservative.

---

## 5) Architecture (suggested modules)

Keep the codebase flat and responsibility-based (no framework):
- **App shell & state**: boot, routing-less navigation, UI state, settings persistence.
- **UI rendering**: top bar, side panel (history + Settings entry), a modal Settings panel, toasts/errors, auto-cache micro-progress.
- **Map**: Leaflet init, OSM tiles, GPX polyline, markers (track cursor + GPS), drag handling.
- **Chart**: uPlot elevation chart, touch cursor, sync with track cursor.
- **Storage**:
  - IndexedDB for tracks + photos,
  - Cache Storage (`tiles-v1`) for tile responses,
  - IndexedDB tile metadata store (e.g. `tileAccess`) to track `lastAccessedAt` per tile URL for retention-based cleanup.
- **Workers**:
  - Web Worker for GPX processing + snap-to-track math,
  - Service Worker for tile runtime caching + auto-cache job + tile access tracking + retention cleanup.

### Background workers (performance model)
- **Main thread**: UI/DOM, Leaflet (map), uPlot (chart), event wiring, side panel rendering.
- **Web Worker (dedicated)**: CPU-bound work:
  - cumulative distance + stats (ascent/descent),
  - elevation normalization,
  - GPS→track snapping (nearest segment) with rate limiting,
  - optional chart downsampling (e.g. LTTB) and polyline simplification (Douglas–Peucker) as a future optimization,
  - prefer TypedArrays + transferable buffers to avoid copies.
- **Service Worker**: network/caching:
  - app shell precache,
  - Workbox runtime caching for OSM tiles,
  - tile auto-cache job on GPX open (micro-progress).
  - update tile `lastAccessedAt` metadata on every tile request (cache hits included),
  - delete tile cache entries by retention window (weeks/months) using the metadata store.
- Note: `DOMParser` is synchronous; if it becomes a bottleneck on very large files, consider a DOM-less GPX parser in a worker (trade-off: more code/complexity).

---

## 6) Data model (IndexedDB)

### Track (persisted record)
Each saved track record uses this minimal model:
- `id` (string, `crypto.randomUUID()`)
- `addedAt` (timestamp)
- `name` (string)
- `description` (string, optional)
- `gpxBlob` (Blob) — original GPX file
- `trackLength` (number) — in km or miles based on user settings (default km / metric)
- `trackLengthUnit` (`"km"` or `"mi"`)
- `estimatedTimeSeconds` (number) — estimated completion time
- `photoIds` (string[]) — logical “array of photos” for the track (UI not implemented yet)

### Notes on storage layout (practical)
- For performance and future migrations, keep `schemaVersion` at the DB level (or per-record if preferred).
- Photos are stored in a separate `photos` object store:
  - Track keeps `photoIds: string[]` (logical “photos array”),
  - `photos` store holds `{ id, trackId, blob, createdAt, metadata }`,
  - this keeps Track reads/writes fast and scales better as photos grow.
- Derived arrays for map/chart can be computed on open; optionally cache them in a separate `trackDerived` store keyed by `trackId` (regeneratable).

### Tile metadata (for retention-based cleanup)
Cache Storage does not expose “last accessed”, so persist minimal metadata in IndexedDB:
- Object store: `tileAccess`
- Key: `tileUrl` (string)
- Value: `{ lastAccessedAt: number }` (epoch ms)

---

## 7) GPX parsing & metrics

### Minimal parsing (no libraries)
- Load GPX as `Blob`, get text via `await gpxBlob.text()`.
- `DOMParser().parseFromString(gpxXmlText, "application/xml")`.
- Extract `trkpt` points (lat/lon), `ele`, `time` (optional).
- Support:
  - multiple `trkseg` (concatenate),
  - missing `ele` (fallback to 0 or optional interpolation).

### Metrics
- Distance: Haversine per segment, build cumulative distance array.
- Normalized elevation: `eleNorm = ele - eleStart`.
- Elevation gain/loss: sum positive/negative deltas.
- Bounds for map fit: min/max lat/lon.

Optional optimizations:
- Polyline simplification (Douglas–Peucker) (future).
- Chart downsampling (LTTB) (future).

---

## 8) Map rendering (Leaflet + OSM)

### Layers
- Basemap: OSM tile layer with attribution.
- GPX overlay:
  - `L.polyline(latlngs, { ... })`
  - start/end markers
  - “track cursor” marker (draggable; stays in sync with the chart)
- User position:
  - GPS marker + accuracy circle (if available)

### UX
- `fitBounds` on load/open.
- Map controls: fit-to-track, locate (optional).

---

## 9) Elevation chart (uPlot)

### Dataset
- X: cumulative distance (m or km)
- Y: normalized elevation (m)

### Interactions
- Touch-friendly cursor + tooltip (distance, absolute/normalized elevation).
- Tap/drag on chart → compute index → update track cursor marker on map.
- When auto-snap is enabled (GPS near track), the chart cursor follows the snapped track cursor unless the user is actively dragging.

---

## 10) Offline-first: PWA + Service Worker

### App shell offline
With `vite-plugin-pwa`:
- Precache `index.html` + built assets.
- Navigation fallback to `index.html` for offline launch.

### Runtime caching
- **OSM tiles**: `CacheFirst` or `StaleWhileRevalidate` with strict limits:
  - `cacheName`: `tiles-v1`
  - `maxEntries` (e.g. 1000–5000, configurable)
  - `maxAgeSeconds` (e.g. 7–30 days)
  - cacheable responses: 200/0
  - track `lastAccessedAt` per tile (IndexedDB metadata) to support “delete tiles not opened for N weeks/months”

### Update UX
- Non-disruptive update: autoUpdate + “New version available” prompt, or handle `waiting` SW.

---

## 11) Tiles: runtime caching + auto-cache on GPX open

### Default behavior
- **Runtime caching**: as the user pans/zooms, Leaflet requests tiles; the Service Worker caches them (Workbox runtime caching).
- **Auto-cache on GPX open**: immediately after loading a GPX, the app fetches a small set of tiles covering the whole track area to reduce initial blank tiles.

### Manual cache management (Settings)
Only two manual actions are exposed:
1. **Delete all tiles cache**.
2. **Delete tiles not opened for** `1/2/3/4/5 weeks` or `1/2/3/4/5 months`.

Implementation note: Cache Storage does not expose “last accessed”; to implement “not opened for X”, store a `lastAccessedAt` timestamp for each tile URL in IndexedDB and update it on every tile request (whether served from network or cache). Cleanup iterates that metadata and deletes stale entries from both IndexedDB and `tiles-v1`.

### Auto-cache on GPX open (light)
Goal: cache “just enough” to reduce blank tiles during initial pan/zoom.

Default:
1. After `fitBounds`, read `zFit = map.getZoom()`.
2. Compute tiles for the track bbox (small padding) at zooms: `zFit`, `zFit+1` (clamped).
3. Enforce hard caps (e.g. `maxTilesAuto = 300`) + limited concurrency.
4. Show micro-progress (e.g. “Caching map… 42/180”) (best-effort).

### Tile math (slippy XYZ)
For bbox + buffer, per zoom:
- `x = floor((lon + 180) / 360 * 2^z)`
- `y = floor((1 - ln(tan(lat) + sec(lat)) / π) / 2 * 2^z)`
- generate `[xMin..xMax]` and `[yMin..yMax]`.

### Important note (OSM)
OSM public tile servers have usage constraints; keep auto-cache conservative and consider allowing custom tile providers in settings.

---

## 12) History (side panel) & storage management

### Behavior
- Each import creates a new entry (optional dedupe by file hash later).
- Order: **newest first**.
- Delete removes from IndexedDB; tile cache is managed separately.

### Storage
- Optional “storage usage” info (best-effort).
- Tile cache cleanup actions live in Settings (delete all, or delete tiles not opened for N weeks/months).

---

## 13) Settings (minimal)

Settings are presented as a **modal panel** opened from the side panel “Settings” menu item (and optionally from the top bar “…”).

- Tile provider template + attribution (presets + custom).
- Unit system: `metric` (km, default) or `imperial` (miles).
- Estimation defaults: base pace (e.g. min/km or min/mile) used to compute `estimatedTimeSeconds` when GPX has no reliable timestamps.
- Tile cache:
  - Delete all tiles cache.
  - Delete tiles not opened for: `1/2/3/4/5 weeks` or `1/2/3/4/5 months`.
- Optional theme (light/dark).

---

## 14) QA checklist (manual)

- Import GPX (small/medium/large) → map + chart render correctly.
- Edge cases:
  - missing/partial elevation,
  - multiple `trkseg`,
  - duplicate/near-duplicate points (distance ~0).
- GPS:
  - permission granted → realtime marker,
  - permission denied → graceful degradation,
  - accuracy/timeout handling.
- Side panel:
  - open/close, scroll, open entry, delete entry.
- Offline:
  - app opens offline after first online load,
  - history available offline,
  - cached tiles render offline.
- Auto-cache:
  - micro-progress is shown (best-effort),
  - UI remains responsive.

---

## 15) Implementation plan (agent-ready)

### M1 — Project scaffold & layout
- Create a Vite vanilla JS app (single-page).
- Add `src/styles.css` (no inline CSS) with a small reset + mobile-first layout:
  - top bar,
  - side panel (toggle, overlay on mobile),
  - main split: ~2/3 map + ~1/3 elevation chart.
- Add minimal state/store module and DOM rendering helpers (no framework).
- Implement a modal Settings panel opened from the side panel menu.

### M2 — Map baseline (Leaflet + OSM)
- Initialize Leaflet map and add OSM tile layer + attribution.
- Ensure correct resize behavior (invalidate size on layout changes / side panel toggle).
- Add placeholders for track overlay + markers (track cursor + GPS).

### M3 — GPX import + parsing (UI thread)
- Implement file picker and load GPX as `Blob`.
- Parse GPX (DOMParser) → raw point arrays (`lat/lon/ele/time`), support multiple `trkseg`.
- Compute bounds and call `fitBounds`.
- Keep parsing minimal; offload heavy computations to the worker.
- If DOMParser becomes a bottleneck on huge files, consider a DOM-less parser in the worker (optional).

### M4 — Track processing in a Web Worker (performance)
- Add `src/workers/trackWorker.js` and move CPU-bound work there:
  - cumulative distance,
  - elevation normalization,
  - ascent/descent stats,
  - GPS→track snap projection math (nearest segment) + distance-to-track checks.
- Use TypedArrays + transferable buffers to avoid copying.
- Emit progress back to UI (keep UI responsive on large GPX).

### M5 — Elevation chart (uPlot) + track cursor sync
- Render uPlot with X = distance from start and Y = normalized elevation.
- Implement touch-friendly cursor (tap/drag) → index → update track cursor marker on the map.

### M6 — Live GPS position (independent from GPX)
- Implement `navigator.geolocation.watchPosition()` with start/stop + permission handling.
- Render GPS marker + accuracy circle; add “follow location” toggle.
- Keep GPS and track cursor separate; implement auto snap-to-track when GPS is plausibly near the current track (worker computes nearest segment projection).

### M7 — IndexedDB persistence + history (newest first)
- Use a lightweight IDB wrapper with Blob support (e.g. `idb`).
- Persist the Track model:
  - `name`, `description`, `gpxBlob`,
  - `trackLength` + `trackLengthUnit` (km/mi from settings),
  - `estimatedTimeSeconds`,
  - `photoIds` in Track + separate `photos` store (storage supported; no UI yet).
- Side panel history: newest first, open-on-tap, delete action.
- Restore last opened track on startup (optional but recommended).

### M8 — PWA: offline app shell
- Configure `vite-plugin-pwa` (Workbox) for app-shell precache + update prompt.
- Ensure the app loads offline after the first online visit.

### M9 — Tiles: runtime caching + auto-cache on GPX open
- Add runtime caching for OSM tiles with strict limits (expiration + max entries).
- Track tile `lastAccessedAt` in IndexedDB on every tile request (including cache hits) to support retention-based cleanup.
- Implement a SW auto-cache job (best-effort) triggered on GPX open:
  - UI sends bbox + zooms (`zFit`, `zFit+1`) + padding,
  - SW generates tile URLs, enforces hard caps, downloads with limited concurrency,
  - SW reports progress (`done/total/errors`) via `postMessage` (no manual controls).
- Auto-cache on GPX open:
  - after `fitBounds`, compute `zFit` and run an auto job for `zFit` and `zFit+1` (small padding + hard cap).
- Settings actions (in modal):
  - delete all tiles cache,
  - delete tiles not opened for N weeks/months (based on `lastAccessedAt` metadata).

### M10 — Polish & hardening
- Defensive parsing + empty/error states.
- Accessibility for side panel (focus management, aria labels).
- Persist settings (units, pace, theme, tile provider).

---

## 16) Nice-to-have

- Share target: “Share → 2Passi” to open GPX from other apps.
- Export: GeoJSON or GPX (local only).
- Pills/overlays for current cursor (distance/alt).
- Multi-track overlay (compare).
- Theme presets (including dark map style if provider allows caching).
