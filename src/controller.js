import { parseGpxBlob, setGpxTrackName } from "./lib/gpx";
import { createTrackWorkerClient } from "./lib/trackWorkerClient";
import { createMapView } from "./lib/mapView";
import { createChartView } from "./lib/chartView";
import { formatDateTime, formatDistance, formatDuration } from "./lib/format";
import { openAppDb } from "./lib/db";
import { loadSettings, saveSettings, getDefaultSettings } from "./lib/settings";
import { createSwClient } from "./lib/swClient";
import { showToast } from "./lib/toast";
import { getLang, getLangPreference, setLang, t } from "./lib/i18n";

const MAX_FILE_SIZE_MB = 30;
const GPS_STALE_AFTER_MS = 12_000;
const TILES_AUTO_PRUNE_LAST_KEY = "2passi:tiles:lastAutoPruneAt:v1";
const TILES_AUTO_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export async function initController() {
  const btnPanel = byId("btnPanel");
  const panel = byId("panel");
  const backdrop = byId("backdrop");

  const btnOpen = byId("btnOpen");
  const btnSettings = byId("btnSettings");
  const btnSettingsClose = byId("btnSettingsClose");
  const settingsDialog = byId("settingsDialog");
  const settingsBody = byId("settingsBody");

  const confirmDialog = byId("confirmDialog");
  const confirmTitle = byId("confirmTitle");
  const confirmMessage = byId("confirmMessage");
  const btnConfirmClose = byId("btnConfirmClose");
  const btnConfirmCancel = byId("btnConfirmCancel");
  const btnConfirmOk = byId("btnConfirmOk");

  const renameDialog = byId("renameDialog");
  const renameInput = byId("renameInput");
  const btnRenameClose = byId("btnRenameClose");
  const btnRenameCancel = byId("btnRenameCancel");
  const btnRenameSave = byId("btnRenameSave");

  const fileInput = byId("fileInput");
  const historyHost = byId("history");
  const currentTitle = byId("currentTitle");
  const chartMeta = byId("chartMeta");
  const microprogress = byId("microprogress");

  const btnFit = byId("btnFit");
  const btnLocate = byId("btnLocate");
  const mapEl = byId("map");
  const chartEl = byId("chart");

  const db = await openAppDb();
  const sw = createSwClient();

  let settings = loadSettings() ?? getDefaultSettings();

  function applyTranslationsToStaticUI() {
    document.documentElement.lang = getLang();

    btnPanel.setAttribute("aria-label", t("app.toggleMenu"));
    btnPanel.setAttribute("title", t("app.menu"));
    panel.setAttribute("aria-label", t("app.menu"));
    historyHost.setAttribute("aria-label", t("app.history"));
    panel.querySelector(".panel-menu")?.setAttribute("aria-label", t("app.actions"));

    byId("btnOpen").textContent = t("app.openGpx");
    byId("btnSettings").textContent = t("app.settings");

    mapEl.setAttribute("aria-label", t("app.map"));
    chartEl.setAttribute("aria-label", t("app.elevationChart"));
    btnFit.textContent = t("app.fit");
    btnLocate.textContent = t("app.gps");

    const settingsTitle = byId("settingsTitle");
    settingsTitle.textContent = t("settings.title");
    byId("btnSettingsClose").setAttribute("aria-label", t("settings.close"));

    currentTitle.setAttribute("aria-label", t("track.renameAria"));
    currentTitle.setAttribute("title", t("track.renameAria"));

    byId("confirmTitle").textContent = t("confirm.title");
    byId("btnConfirmClose").setAttribute("aria-label", t("app.close"));
    byId("btnConfirmCancel").textContent = t("confirm.cancel");
    byId("btnConfirmOk").textContent = t("confirm.delete");

    byId("renameTitle").textContent = t("track.renameTitle");
    const renameLabelText = document.getElementById("renameLabelText");
    if (renameLabelText) renameLabelText.textContent = t("track.renameLabel");
    byId("btnRenameClose").setAttribute("aria-label", t("app.close"));
    byId("btnRenameCancel").textContent = t("confirm.cancel");
    byId("btnRenameSave").textContent = t("track.renameSave");

    const leafletLink =
      '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>';
    const menuAttribution = panel.querySelector(".menu-attribution");
    if (menuAttribution) {
      menuAttribution.innerHTML = t("settings.leafletAttribution", { leaflet: leafletLink });
    }
  }

  async function maybeAutoPruneTiles() {
    const now = Date.now();
    const last = Number.parseInt(localStorage.getItem(TILES_AUTO_PRUNE_LAST_KEY) || "0", 10);
    if (Number.isFinite(last) && now - last < TILES_AUTO_PRUNE_INTERVAL_MS) return;

    const retentionSeconds = Number.parseInt(String(settings.tile?.retentionSeconds ?? 2592000), 10);
    if (!Number.isFinite(retentionSeconds) || retentionSeconds <= 0) return;

    try {
      await sw.pruneTilesOlderThan({ maxAgeSeconds: retentionSeconds });
      localStorage.setItem(TILES_AUTO_PRUNE_LAST_KEY, String(now));
    } catch {
      // ignore
    }
  }

  setTimeout(() => maybeAutoPruneTiles().catch(() => {}), 1500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    maybeAutoPruneTiles().catch(() => {});
  });

  const mapView = createMapView(byId("map"), {
    tileTemplate: settings.tile.template,
    tileAttribution: settings.tile.attribution,
    onUserNavigate() {
      if (state.geoWatchId == null) return;
      lockGpsFollow();
    }
  });

  const chartView = createChartView(byId("chart"), chartMeta, {
    onUserDragStart() {
      state.isUserDragging = true;
      cancelUserResnap();
    },
    onUserDragEnd() {
      state.isUserDragging = false;
      scheduleUserResnapIfEligible();
    },
    onCursorIndexChange(idx) {
      if (ignoreChartCursorEvents > 0) return;
      if (!state.currentTrack) return;
      state.cursor = { kind: "vertex", idx };
      updateCursorFromTrackVertex(idx, { source: "chart" });
    }
  });

  chartView.setMetaFormatter(({ idx, xVal }) => {
    const track = state.currentTrack;
    if (!track) return "";
    const unit = track.unit || (settings.unitSystem === "imperial" ? "mi" : "km");
    const distText = formatDistance(Number(xVal) || 0, unit);

    const totalDist = track.dist?.length ? track.dist[track.dist.length - 1] : track.trackLength || 0;
    const frac = totalDist > 0 ? clamp((Number(xVal) || 0) / totalDist, 0, 1) : 0;
    let remainingSeconds = Math.round((track.estimatedTimeSeconds || 0) * (1 - frac));
    if (track.stats?.hasTime && track.timeMs && idx != null && idx >= 0 && idx < track.timeMs.length) {
      const tMs = track.timeMs[idx];
      const endMs = track.stats.endTimeMs;
      if (Number.isFinite(tMs) && tMs > 0 && Number.isFinite(endMs) && endMs > tMs) {
        remainingSeconds = Math.round((endMs - tMs) / 1000);
      }
    }
    remainingSeconds = Math.max(0, remainingSeconds);
    const remainingText = formatDuration(remainingSeconds);

    return `${distText} • ${remainingText}`;
  });

  const worker = createTrackWorkerClient(new URL("./workers/trackWorker.js", import.meta.url));

  const state = {
    tracks: [],
    currentTrack: null,
    cursor: null,
    isUserDragging: false,
    gps: null,
    gpsStale: false,
    gpsLastFixAt: 0,
    gpsNearTrack: false,
    lastSnapResult: null,
    geoWatchId: null,
    followGps: false,
    followGpsLocked: false
  };

  function lockGpsFollow() {
    state.followGps = false;
    state.followGpsLocked = true;
  }

  const USER_RESNAP_DELAY_MS = 3000;
  let userResnapTimer = null;
  let userResnapToken = 0;

  function cancelUserResnap() {
    clearTimeout(userResnapTimer);
    userResnapTimer = null;
  }

  function scheduleUserResnapIfEligible() {
    cancelUserResnap();
    if (state.geoWatchId == null) return;
    if (state.gpsStale) return;
    if (!state.gpsNearTrack || !state.lastSnapResult?.near) return;
    if (state.isUserDragging) return;
    const token = ++userResnapToken;
    userResnapTimer = setTimeout(() => {
      userResnapTimer = null;
      if (token !== userResnapToken) return;
      if (state.geoWatchId == null) return;
      if (state.gpsStale) return;
      if (state.isUserDragging) return;
      if (!state.gpsNearTrack || !state.lastSnapResult?.near) return;
      applySnapResult(state.lastSnapResult);
    }, USER_RESNAP_DELAY_MS);
  }

  let ignoreChartCursorEvents = 0;
  function suppressChartCursorEventsOnce() {
    ignoreChartCursorEvents++;
    setTimeout(() => {
      ignoreChartCursorEvents = Math.max(0, ignoreChartCursorEvents - 1);
    }, 0);
  }

  let lastFocusBeforePanel = null;
  let lastFocusBeforeModal = null;
  let suppressBackdropClickUntil = 0;
  let restoreFocusOnPanelClose = false;
  let isWidePrev = window.matchMedia("(min-width: 900px)").matches;

  function setPanelOpen(open) {
    const isWide = window.matchMedia("(min-width: 900px)").matches;
    const appRoot = btnPanel.closest(".app") || document.querySelector(".app");
    appRoot?.classList.toggle("panel-collapsed", Boolean(isWide && !open));

    if (open) lastFocusBeforePanel = document.activeElement;
    panel.classList.toggle("open", open);
    backdrop.hidden = isWide ? true : !open;
    btnPanel.setAttribute("aria-expanded", String(open));

    if (!isWide) {
      if (open) btnOpen.focus();
      else {
        if (restoreFocusOnPanelClose) lastFocusBeforePanel?.focus?.();
        else if (panel.contains(document.activeElement)) document.activeElement?.blur?.();
        restoreFocusOnPanelClose = false;
      }
    } else if (!open) {
      if (restoreFocusOnPanelClose) lastFocusBeforePanel?.focus?.();
      else if (panel.contains(document.activeElement)) document.activeElement?.blur?.();
      restoreFocusOnPanelClose = false;
    }
  }

  // Desktop starts with the side panel open (CSS shows it open by default; this syncs aria/backdrop state).
  if (isWidePrev) setPanelOpen(true);

  function openSettingsDialog() {
    lastFocusBeforeModal = document.activeElement;
    if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
    else settingsDialog.setAttribute("open", "");
    btnSettingsClose.focus();
  }

  function closeSettingsDialog() {
    if (settingsDialog.open) settingsDialog.close();
  }

  settingsDialog.addEventListener("close", () => {
    lastFocusBeforeModal?.focus?.();
  });

  function renameTrackPrompt({ value }) {
    return new Promise((resolve) => {
      const cleanup = () => {
        btnRenameClose.removeEventListener("click", onCancel);
        btnRenameCancel.removeEventListener("click", onCancel);
        btnRenameSave.removeEventListener("click", onOk);
        renameInput.removeEventListener("keydown", onInputKeydown);
        renameDialog.removeEventListener("close", onClose);
        renameDialog.removeEventListener("cancel", onCancelEvent);
      };

      const onCancel = () => {
        if (renameDialog.open) renameDialog.close("cancel");
      };

      const onOk = () => {
        if (renameDialog.open) renameDialog.close("ok");
      };

      const onInputKeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onOk();
      };

      const onCancelEvent = (e) => {
        e.preventDefault();
        onCancel();
      };

      const onClose = () => {
        const ok = renameDialog.returnValue === "ok";
        const next = ok ? String(renameInput.value || "").trim() : null;
        cleanup();
        resolve(next);
      };

      lastFocusBeforeModal = document.activeElement;
      if (typeof renameDialog.showModal === "function") renameDialog.showModal();
      else renameDialog.setAttribute("open", "");

      renameInput.value = value || "";
      btnRenameClose.addEventListener("click", onCancel);
      btnRenameCancel.addEventListener("click", onCancel);
      btnRenameSave.addEventListener("click", onOk);
      renameInput.addEventListener("keydown", onInputKeydown);
      renameDialog.addEventListener("close", onClose);
      renameDialog.addEventListener("cancel", onCancelEvent);

      renameInput.focus();
      renameInput.select?.();
    });
  }

  renameDialog.addEventListener("close", () => {
    lastFocusBeforeModal?.focus?.();
  });

  settingsDialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeSettingsDialog();
  });

  function confirmAction({ title, message, okText, cancelText, destructive } = {}) {
    confirmTitle.textContent = title || t("confirm.title");
    confirmMessage.textContent = message || t("confirm.message");
    btnConfirmOk.textContent = okText || t("confirm.ok");
    btnConfirmCancel.textContent = cancelText || t("confirm.cancel");
    btnConfirmOk.classList.toggle("contrast", Boolean(destructive));

    return new Promise((resolve) => {
      const cleanup = () => {
        btnConfirmClose.removeEventListener("click", onCancel);
        btnConfirmCancel.removeEventListener("click", onCancel);
        btnConfirmOk.removeEventListener("click", onOk);
        confirmDialog.removeEventListener("close", onClose);
        confirmDialog.removeEventListener("cancel", onCancelEvent);
      };

      const onClose = () => {
        cleanup();
        suppressBackdropClickUntil = Date.now() + 350;
        resolve(confirmDialog.returnValue === "ok");
      };

      const onCancelEvent = (e) => {
        e.preventDefault();
        onCancel();
      };

      const onCancel = () => {
        if (confirmDialog.open) confirmDialog.close("cancel");
      };

      const onOk = () => {
        if (confirmDialog.open) confirmDialog.close("ok");
      };

      btnConfirmClose.addEventListener("click", onCancel);
      btnConfirmCancel.addEventListener("click", onCancel);
      btnConfirmOk.addEventListener("click", onOk);
      confirmDialog.addEventListener("close", onClose);
      confirmDialog.addEventListener("cancel", onCancelEvent);

      if (typeof confirmDialog.showModal === "function") confirmDialog.showModal();
      else confirmDialog.setAttribute("open", "");

      btnConfirmOk.focus();
    });
  }

  function renderHistory() {
    historyHost.innerHTML = "";

    if (state.tracks.length === 0) {
      const empty = document.createElement("article");
      empty.className = "history-item history-empty";
      empty.textContent = t("history.empty", { openGpx: t("app.openGpx") });
      historyHost.append(empty);
      return;
    }

    for (const track of state.tracks) {
      const item = document.createElement("article");
      item.className = "history-item";

      item.innerHTML = `
        <header class="history-item-top">
          <div class="history-text">
            <span class="history-title"></span>
            <small class="history-meta"></small>
          </div>
          <button class="secondary outline" type="button" aria-label="${t("history.deleteTrackAria")}" title="${t(
        "history.deleteTrackTitle"
      )}">🗑</button>
        </header>
      `;

      const title = item.querySelector(".history-title");
      const meta = item.querySelector(".history-meta");
      const delBtn = item.querySelector("button");

      if (title) title.textContent = track.name || t("history.untitled");

      if (meta) {
        const unit = settings.unitSystem === "imperial" ? "mi" : "km";
        const distFactor = unit === "mi" ? 1 / 1609.344 : 1 / 1000;
        const trackLengthM = Number.isFinite(track.trackLengthM)
          ? track.trackLengthM
          : Number.isFinite(track.trackLength) && track.trackLengthUnit === "mi"
            ? track.trackLength * 1609.344
            : Number.isFinite(track.trackLength) && track.trackLengthUnit === "km"
              ? track.trackLength * 1000
              : 0;
        const dist = formatDistance(trackLengthM * distFactor, unit);
        const eta = formatDuration(track.estimatedTimeSeconds);
        meta.textContent = `${dist} • ${eta}`;
      }

      item.addEventListener("click", async (e) => {
        if (e.target === delBtn || delBtn?.contains(e.target)) return;
        await openTrackById(track.id);
        setPanelOpen(false);
      });

      delBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await deleteTrack(track.id);
      });

      historyHost.append(item);
    }
  }

  async function refreshHistory() {
    state.tracks = await db.listTracksNewestFirst();
    renderHistory();
  }

  async function deleteTrack(trackId) {
    const ok = await confirmAction({
      title: t("confirm.deleteTrackTitle"),
      message: t("confirm.deleteTrackMessage"),
      okText: t("confirm.delete"),
      cancelText: t("confirm.cancel"),
      destructive: true
    });
    if (!ok) return;
    await db.deleteTrack(trackId);
    if (state.currentTrack?.id === trackId) {
      state.currentTrack = null;
      state.cursor = null;
      setCurrentTitle("");
      mapView.clearTrack();
      chartView.clear();
      localStorage.removeItem("lastTrackId");
    }
    await refreshHistory();
    setPanelOpen(false);
    mapView.invalidateSizeSoon();
  }

  function showMicroprogress(text) {
    microprogress.textContent = text;
    microprogress.hidden = false;
  }

  function hideMicroprogress() {
    microprogress.hidden = true;
    microprogress.textContent = "";
  }

  function setCurrentTitle(name) {
    const trackName = (name || "").trim();
    currentTitle.textContent = trackName;
    currentTitle.hidden = !trackName;
    document.title = trackName ? `${trackName} — 2Passi` : "2Passi";
  }

  function applyUnitSystemToCurrentTrack() {
    const track = state.currentTrack;
    if (!track?.distM || !track?.eleNorm) return;

    const unit = settings.unitSystem === "imperial" ? "mi" : "km";
    const distFactor = unit === "mi" ? 1 / 1609.344 : 1 / 1000;
    const eleFactor = settings.unitSystem === "imperial" ? 3.28084 : 1;

    const dist = Array.from(track.distM, (m) => m * distFactor);
    const elev = Array.from(track.eleNorm, (m) => m * eleFactor);

    track.unit = unit;
    track.distFactor = distFactor;
    track.eleFactor = eleFactor;
    track.dist = dist;
    track.elev = elev;
    track.trackLengthM = track.trackLengthM ?? (track.distM.length ? track.distM[track.distM.length - 1] : 0);
    track.trackLength = track.trackLengthM * distFactor;

    const prevCursor = state.cursor;
    chartView.setData(dist, elev, {
      distLabel: unit === "mi" ? t("chart.distanceMi") : t("chart.distanceKm"),
      elevLabel: settings.unitSystem === "imperial" ? t("chart.elevFt") : t("chart.elevM")
    });

    if (prevCursor?.kind === "vertex") chartView.setCursorIndex(prevCursor.idx);
  }

  async function renameCurrentTrack() {
    const track = state.currentTrack;
    if (!track) return;
    const next = await renameTrackPrompt({ value: track.name || "" });
    if (next == null) return;
    const record = await db.getTrack(track.id);
    if (!record) {
      showToast(t("toast.trackNotFound"));
      return;
    }
    try {
      record.gpxBlob = await setGpxTrackName(record.gpxBlob, next);
    } catch (e) {
      showToast(e?.message || t("toast.importFailed"));
      return;
    }
    record.name = next;
    await db.putTrack(record);
    track.name = next;
    setCurrentTitle(next);
    await refreshHistory();
  }

  async function openTrackFromBlob({ id, name, description, gpxBlob, addedAt, photoIds = [] }) {
    setCurrentTitle("");
    chartView.clear({ message: t("chart.processing") });

    const parsed = await parseGpxBlob(gpxBlob, { fallbackName: name });
    const displayName = (parsed.name || name || "").trim();
    setCurrentTitle(displayName);
    mapView.setTrack(parsed.latlngs);
    mapView.fitToTrack();

    const unit = settings.unitSystem === "imperial" ? "mi" : "km";
    const distFactor = unit === "mi" ? 1 / 1609.344 : 1 / 1000;
    const eleFactor = settings.unitSystem === "imperial" ? 3.28084 : 1;

    const { distM, eleNorm, stats } = await worker.processTrack({
      id,
      lat: parsed.lat,
      lon: parsed.lon,
      ele: parsed.ele,
      timeMs: parsed.timeMs
    });

    const dist = Array.from(distM, (m) => m * distFactor);
    const elev = Array.from(eleNorm, (m) => m * eleFactor);

    chartView.setData(dist, elev, {
      distLabel: unit === "mi" ? t("chart.distanceMi") : t("chart.distanceKm"),
      elevLabel: settings.unitSystem === "imperial" ? t("chart.elevFt") : t("chart.elevM")
    });

    const totalDistM = distM.length ? distM[distM.length - 1] : 0;
    const trackLength = totalDistM * distFactor;

    let estimatedTimeSeconds = 0;
    if (stats.hasTime && stats.startTimeMs && stats.endTimeMs && stats.endTimeMs > stats.startTimeMs) {
      estimatedTimeSeconds = Math.round((stats.endTimeMs - stats.startTimeMs) / 1000);
    } else {
      const paceSec = settings.unitSystem === "imperial" ? settings.pace.secondsPerMi : settings.pace.secondsPerKm;
      estimatedTimeSeconds = Math.round(trackLength * paceSec);
    }

    const record = {
      id,
      addedAt,
      name: parsed.name || name,
      description: description ?? parsed.description ?? "",
      gpxBlob,
      trackLength,
      trackLengthUnit: unit,
      trackLengthM: totalDistM,
      estimatedTimeSeconds,
      photoIds
    };

    await db.putTrack(record);
    await refreshHistory();

    state.currentTrack = {
      id,
      name: record.name,
      description: record.description,
      latlngs: parsed.latlngs,
      bounds: parsed.bounds,
      dist,
      elev,
      distM,
      eleNorm,
      stats,
      trackLength,
      trackLengthM: totalDistM,
      estimatedTimeSeconds,
      timeMs: parsed.timeMs,
      unit,
      eleFactor,
      distFactor
    };

    state.cursor = { kind: "vertex", idx: 0 };
    updateCursorFromTrackVertex(0, { source: "open" });

    localStorage.setItem("lastTrackId", id);

    queueAutoCacheTiles();
  }

  async function openTrackById(id) {
    const record = await db.getTrack(id);
    if (!record) {
      showToast(t("toast.trackNotFound"));
      return;
    }
    await openTrackFromBlob(record);
  }

  async function importGpxFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(t("toast.fileTooLarge", { max: MAX_FILE_SIZE_MB }));
      return;
    }

    const id = crypto.randomUUID();
    const addedAt = Date.now();
    const name = file.name.replace(/\.gpx$/i, "");

    await openTrackFromBlob({
      id,
      addedAt,
      name,
      description: "",
      gpxBlob: file
    });
  }

  function updateCursorFromTrackVertex(idx, { source }) {
    const track = state.currentTrack;
    if (!track) return;
    const latlng = track.latlngs[idx];
    if (!latlng) return;

    mapView.setCursor({ lat: latlng[0], lon: latlng[1] });

    if (source !== "chart") {
      suppressChartCursorEventsOnce();
      chartView.setCursorIndex(idx);
    }
  }

  function queueAutoCacheTiles() {
    const track = state.currentTrack;
    if (!track) return;

    const zFit = mapView.getZoom();
    const zooms = [zFit, Math.min(19, zFit + 1)];
    const bbox = track.bounds;
    if (!bbox) return;

    sw.requestTileAutoCache({
      tileTemplate: settings.tile.template,
      bbox,
      zooms,
      paddingRatio: 0.03
    });
  }

  function segmentDistM(i, t) {
    const track = state.currentTrack;
    if (!track?.distM || track.distM.length < 2) return 0;
    const idx = Math.max(0, Math.min(track.distM.length - 2, i));
    const tt = Math.max(0, Math.min(1, t));
    const d0 = track.distM[idx];
    const d1 = track.distM[idx + 1];
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) return 0;
    return d0 + tt * (d1 - d0);
  }

  function segmentEleNormM(i, t) {
    const track = state.currentTrack;
    if (!track?.eleNorm || track.eleNorm.length < 2) return 0;
    const idx = Math.max(0, Math.min(track.eleNorm.length - 2, i));
    const tt = Math.max(0, Math.min(1, t));
    const e0 = track.eleNorm[idx];
    const e1 = track.eleNorm[idx + 1];
    if (!Number.isFinite(e0) || !Number.isFinite(e1)) return 0;
    return e0 + tt * (e1 - e0);
  }

  // After the user moves the cursor manually, snap back to GPS after a short delay
  // (only if GPS is active and near the track).
  function maybeResumeAutoSnap() {
    scheduleUserResnapIfEligible();
  }

  function applySnapResult(res) {
    if (!res?.near) return;
    if (!state.currentTrack) return;
    mapView.setCursor({ lat: res.lat, lon: res.lon });
    suppressChartCursorEventsOnce();
    const distM = segmentDistM(res.i, res.t);
    const eleM = segmentEleNormM(res.i, res.t);
    chartView.setCursorXY(distM * state.currentTrack.distFactor, eleM * state.currentTrack.eleFactor);
  }

  let gpsStaleTimer = null;
  function setGpsStale(stale) {
    const next = Boolean(stale);
    if (state.gpsStale === next) return;
    state.gpsStale = next;
    mapView.setGpsStale(next);
    if (next) {
      lockGpsFollow();
      cancelUserResnap();
    }
  }

  function startGpsWatch() {
    if (state.geoWatchId != null) return;
    if (!("geolocation" in navigator)) {
      showToast(t("toast.geoNotSupported"));
      return;
    }

    state.gpsStale = false;
    state.gpsLastFixAt = 0;
    state.followGps = false;
    state.followGpsLocked = false;
    btnLocate.classList.remove("outline");
    btnLocate.setAttribute("aria-pressed", "true");

    clearInterval(gpsStaleTimer);
    gpsStaleTimer = setInterval(() => {
      if (state.geoWatchId == null) return;
      if (!state.gps || !state.gpsLastFixAt) return;
      setGpsStale(Date.now() - state.gpsLastFixAt > GPS_STALE_AFTER_MS);
    }, 1000);

    state.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        state.gps = { lat: latitude, lon: longitude, accuracyM: accuracy, ts: pos.timestamp };
        state.gpsLastFixAt = Date.now();
        mapView.setGps({ lat: latitude, lon: longitude, accuracyM: accuracy });
        setGpsStale(false);
        if (!state.followGpsLocked) {
          if (!state.followGps) state.followGps = true;
          mapView.panToGps();
        }
        maybeSnapGpsToTrack();
      },
      (err) => {
        const code = Number(err?.code) || 0;
        if (code === 1) {
          showToast(err.message || t("toast.geoPermissionDenied"));
          stopGpsWatch();
          return;
        }
        setGpsStale(true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000
      }
    );
  }

  function stopGpsWatch() {
    if (state.geoWatchId == null) return;
    navigator.geolocation.clearWatch(state.geoWatchId);
    state.geoWatchId = null;
    state.gps = null;
    state.gpsLastFixAt = 0;
    clearInterval(gpsStaleTimer);
    gpsStaleTimer = null;
    setGpsStale(false);
    state.gpsNearTrack = false;
    state.lastSnapResult = null;
    mapView.clearGps();
    state.followGps = false;
    state.followGpsLocked = false;
    cancelUserResnap();
    btnLocate.classList.add("outline");
    btnLocate.setAttribute("aria-pressed", "false");
  }

  let lastSnapAt = 0;
  function maybeSnapGpsToTrack() {
    if (!state.currentTrack || !state.gps) return;
    const now = Date.now();
    if (now - lastSnapAt < 500) return;
    lastSnapAt = now;

    const maxNear = Math.max(30, 2 * (state.gps.accuracyM || 0));

    worker
      .snapToTrack({
        lat: state.gps.lat,
        lon: state.gps.lon,
        maxDistanceM: maxNear
      })
      .then((res) => {
        state.lastSnapResult = res;
        state.gpsNearTrack = Boolean(res?.near);
        if (state.isUserDragging) return;
        if (res?.near) applySnapResult(res);
      })
      .catch(() => {});
  }

  function renderSettings() {
    const paceUnit = settings.unitSystem === "imperial" ? "min/mi" : "min/km";
    settingsBody.innerHTML = `
      <form id="settingsForm">
        <label>
          ${t("settings.language")}
          <select id="setLang" name="lang">
            <option value="auto">${t("settings.languageAuto")}</option>
            <option value="it">${t("settings.languageIt")}</option>
            <option value="en">${t("settings.languageEn")}</option>
            <option value="de">${t("settings.languageDe")}</option>
          </select>
        </label>

        <label>
          ${t("settings.unitSystem")}
          <select id="setUnitSystem" name="unitSystem">
            <option value="metric">${t("settings.unitMetric")}</option>
            <option value="imperial">${t("settings.unitImperial")}</option>
          </select>
        </label>

        <label>
          ${t("settings.timeEstimate", { paceUnit })}
          <small>${t("settings.timeEstimateHelp")}</small>
          <input id="setPace" name="pace" type="number" inputmode="decimal" min="1" step="0.1" />
        </label>

	        <hr />
	
	        <label>${t("settings.pruneLabel")}</label>
	        <fieldset role="group">
	          <select id="setTilesRetention">
	            <option value="604800">${t("settings.retention.w1")}</option>
	            <option value="1209600">${t("settings.retention.w2")}</option>
	            <option value="1814400">${t("settings.retention.w3")}</option>
	            <option value="2419200">${t("settings.retention.w4")}</option>
	            <option value="2592000">${t("settings.retention.m1")}</option>
	            <option value="5184000">${t("settings.retention.m2")}</option>
	            <option value="7776000">${t("settings.retention.m3")}</option>
	          </select>
	          <button id="btnTilesPrune" type="button">${t("settings.pruneAction")}</button>
	        </fieldset>

	        <div class="settings-tiles-footer">
	          <button class="secondary" id="btnTilesClear" type="button">${t("settings.clearOffline")}</button>
	          <small id="storageInfo"></small>
	        </div>
	      </form>
	    `;

    const settingsForm = settingsBody.querySelector("#settingsForm");
    settingsForm?.addEventListener("submit", (e) => e.preventDefault());

    const langSel = settingsBody.querySelector("#setLang");
    const unitSel = settingsBody.querySelector("#setUnitSystem");
    const paceInput = settingsBody.querySelector("#setPace");
    const btnTilesClear = settingsBody.querySelector("#btnTilesClear");
    const retentionSel = settingsBody.querySelector("#setTilesRetention");
    const btnTilesPrune = settingsBody.querySelector("#btnTilesPrune");
    const storageInfo = settingsBody.querySelector("#storageInfo");

    async function refreshStorageInfo({ retries = 1, delayMs = 350 } = {}) {
      if (!storageInfo) return;
      if (!("storage" in navigator) || !("estimate" in navigator.storage)) {
        storageInfo.textContent = "";
        storageInfo.hidden = true;
        return;
      }

      storageInfo.hidden = false;
      for (let i = 0; i < retries; i++) {
        try {
          const e = await navigator.storage.estimate();
          const usage = e.usage ? (e.usage / (1024 * 1024)).toFixed(1) : "?";
          const quota = e.quota ? (e.quota / (1024 * 1024)).toFixed(0) : "?";
          storageInfo.textContent = t("settings.spaceUsed", { usage, quota });
        } catch {
          // ignore
        }

        if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    if (langSel) langSel.value = getLangPreference();
    langSel?.addEventListener("change", async () => {
      setLang(langSel.value);
      applyTranslationsToStaticUI();
      renderSettings();
      applyUnitSystemToCurrentTrack();
      await refreshHistory();
      settingsBody.querySelector("#setLang")?.focus?.();
    });

    if (unitSel) unitSel.value = settings.unitSystem || "metric";
    unitSel?.addEventListener("change", async () => {
      const next = unitSel.value === "imperial" ? "imperial" : "metric";
      if (settings.unitSystem === next) return;
      settings.unitSystem = next;
      saveSettings(settings);
      renderSettings();
      applyUnitSystemToCurrentTrack();
      await refreshHistory();
    });

    if (paceInput) {
      const paceMin = settings.unitSystem === "imperial" ? settings.pace.secondsPerMi / 60 : settings.pace.secondsPerKm / 60;
      paceInput.value = String(Math.round(paceMin * 10) / 10);
    }
    if (retentionSel) {
      const s = String(settings.tile?.retentionSeconds ?? 2592000);
      retentionSel.value = s;
    }

    paceInput?.addEventListener("change", () => {
      const val = Number.parseFloat(paceInput.value);
      if (!Number.isFinite(val) || val <= 0) return;
      const seconds = Math.round(val * 60);
      if (settings.unitSystem === "imperial") settings.pace.secondsPerMi = seconds;
      else settings.pace.secondsPerKm = seconds;
      saveSettings(settings);
      showToast(t("toast.saved"));
    });

    retentionSel?.addEventListener("change", () => {
      const seconds = Number.parseInt(retentionSel.value || "0", 10);
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      settings.tile.retentionSeconds = seconds;
      saveSettings(settings);
    });

    btnTilesClear?.addEventListener("click", async () => {
      const ok = await confirmAction({
        title: t("settings.clearOffline"),
        message: t("settings.clearOfflineConfirm"),
        okText: t("confirm.delete"),
        cancelText: t("confirm.cancel"),
        destructive: true
      });
      if (!ok) return;
      showMicroprogress(t("settings.clearing"));
      try {
        await sw.deleteAllTiles();
        showToast(t("settings.cleared"));
        await refreshStorageInfo({ retries: 4 });
      } catch (e) {
        showToast(e?.message || t("settings.clearFailed"));
      } finally {
        hideMicroprogress();
      }
    });

    btnTilesPrune?.addEventListener("click", async () => {
      const seconds = Number.parseInt(retentionSel?.value || String(settings.tile?.retentionSeconds ?? 0), 10);
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      showMicroprogress(t("settings.pruning"));
      try {
        settings.tile.retentionSeconds = seconds;
        saveSettings(settings);
        const res = await sw.pruneTilesOlderThan({ maxAgeSeconds: seconds });
        showToast(t("settings.pruned", { count: res.deleted }));
        await refreshStorageInfo({ retries: 3 });
      } catch (e) {
        showToast(e?.message || t("settings.pruneFailed"));
      } finally {
        hideMicroprogress();
      }
    });

    refreshStorageInfo({ retries: 2 });
  }

  function togglePanelFromButton() {
    const open = !panel.classList.contains("open");
    setPanelOpen(open);
    mapView.invalidateSizeSoon();
  }

  let panelToggleFromPointer = false;
  btnPanel.addEventListener("pointerdown", () => {
    panelToggleFromPointer = true;
  });
  btnPanel.addEventListener("click", () => {
    togglePanelFromButton();
    if (panelToggleFromPointer) btnPanel.blur?.();
    panelToggleFromPointer = false;
  });
  btnPanel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    panelToggleFromPointer = false;
    restoreFocusOnPanelClose = panel.classList.contains("open");
    togglePanelFromButton();
  });
  backdrop.addEventListener("click", () => {
    if (settingsDialog.open || confirmDialog.open) return;
    if (Date.now() < suppressBackdropClickUntil) return;
    setPanelOpen(false);
    mapView.invalidateSizeSoon();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (panel.classList.contains("open")) {
      e.preventDefault();
      restoreFocusOnPanelClose = true;
      setPanelOpen(false);
      mapView.invalidateSizeSoon();
    }
  });

  btnOpen.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    try {
      const file = fileInput.files?.[0] ?? null;
      fileInput.value = "";
      await importGpxFile(file);
      setPanelOpen(false);
    } catch (e) {
      showToast(e?.message || t("toast.importFailed"));
    }
  });

  let resolveLaunchOpen = null;
  const launchOpenSignal = new Promise((resolve) => {
    resolveLaunchOpen = resolve;
  });

  if (globalThis.launchQueue?.setConsumer) {
    globalThis.launchQueue.setConsumer((launchParams) => {
      const handles = launchParams?.files || [];
      if (!handles.length) return;
      resolveLaunchOpen?.(true);
      resolveLaunchOpen = null;

      (async () => {
        for (const handle of handles) {
          const file = await handle.getFile();
          if (!file) continue;
          await importGpxFile(file);
        }
        setPanelOpen(false);
      })().catch(() => {
        showToast(t("toast.importFailed"));
      });
    });
  } else {
    resolveLaunchOpen?.(false);
    resolveLaunchOpen = null;
  }

  btnSettings.addEventListener("click", () => {
    setPanelOpen(false);
    renderSettings();
    openSettingsDialog();
  });
  btnSettingsClose.addEventListener("click", () => closeSettingsDialog());

  btnFit.addEventListener("click", () => {
    lockGpsFollow();
    mapView.fitToTrack();
  });
  btnLocate.addEventListener("click", () => {
    if (state.geoWatchId == null) startGpsWatch();
    else stopGpsWatch();
  });

  currentTitle.addEventListener("click", () => {
    renameCurrentTrack().catch(() => {});
  });

  sw.onProgress((p) => {
    if (p.type === "tileAutoCacheProgress") {
      showMicroprogress(t("settings.cacheProgress", { done: p.done, total: p.total }));
      if (p.done >= p.total) setTimeout(() => hideMicroprogress(), 500);
    }
  });

  window.addEventListener("resize", () => {
    const isWideNow = window.matchMedia("(min-width: 900px)").matches;
    if (isWideNow !== isWidePrev) {
      setPanelOpen(isWideNow);
      isWidePrev = isWideNow;
    }
    mapView.invalidateSizeSoon();
    chartView.resizeSoon();
  });

  await refreshHistory();
  applyTranslationsToStaticUI();
  renderSettings();

  const openedViaLaunchQueue = await Promise.race([
    launchOpenSignal,
    new Promise((resolve) => setTimeout(() => resolve(false), 600))
  ]);
  if (!openedViaLaunchQueue) {
    const last = localStorage.getItem("lastTrackId");
    if (last) openTrackById(last).catch(() => {});
  }
}
