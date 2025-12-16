import { parseGpxBlob } from "./lib/gpx";
import { createTrackWorkerClient } from "./lib/trackWorkerClient";
import { createMapView } from "./lib/mapView";
import { createChartView } from "./lib/chartView";
import { formatDateTime, formatDistance, formatDuration } from "./lib/format";
import { openAppDb } from "./lib/db";
import { loadSettings, saveSettings, getDefaultSettings } from "./lib/settings";
import { createSwClient } from "./lib/swClient";
import { showToast } from "./lib/toast";
import { getLangPreference, setLang, t } from "./lib/i18n";

const MAX_FILE_SIZE_MB = 30;
const GPS_STALE_AFTER_MS = 12_000;

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

export async function initController() {
  const btnPanel = byId("btnPanel");
  const btnPanelClose = byId("btnPanelClose");
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

  const fileInput = byId("fileInput");
  const historyHost = byId("history");
  const currentTitle = byId("currentTitle");
  const chartMeta = byId("chartMeta");
  const microprogress = byId("microprogress");

  const btnFit = byId("btnFit");
  const btnLocate = byId("btnLocate");
  const btnFollow = byId("btnFollow");

  const db = await openAppDb();
  const sw = createSwClient();

  let settings = loadSettings() ?? getDefaultSettings();

  const mapView = createMapView(byId("map"), {
    tileTemplate: settings.tile.template,
    tileAttribution: settings.tile.attribution,
    onCursorDragStart() {
      state.isUserDragging = true;
    },
    onCursorDragMove(latlng) {
      state.lastUserCursorLatLng = { lat: latlng.lat, lon: latlng.lng };
      requestUserCursorSnap({ lat: latlng.lat, lon: latlng.lng });
    },
    onCursorDragEnd(latlng) {
      state.isUserDragging = false;
      state.lastUserCursorLatLng = { lat: latlng.lat, lon: latlng.lng };
      maybeResumeAutoSnap();
    }
  });

  const chartView = createChartView(byId("chart"), chartMeta, {
    onUserDragStart() {
      state.isUserDragging = true;
    },
    onUserDragEnd() {
      state.isUserDragging = false;
      maybeResumeAutoSnap();
    },
    onCursorIndexChange(idx) {
      if (ignoreChartCursorEvents > 0) return;
      if (!state.currentTrack) return;
      state.cursor = { kind: "vertex", idx };
      updateCursorFromTrackVertex(idx, { source: "chart" });
    }
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
    lastUserCursorLatLng: null,
    geoWatchId: null,
    followGps: false
  };

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

  function setPanelOpen(open) {
    const isWide = window.matchMedia("(min-width: 900px)").matches;
    if (isWide) return;

    if (open) lastFocusBeforePanel = document.activeElement;
    panel.classList.toggle("open", open);
    backdrop.hidden = !open;
    btnPanel.setAttribute("aria-expanded", String(open));

    if (open) btnPanelClose.focus();
    else lastFocusBeforePanel?.focus?.();
  }

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
      empty.className = "history-item";
      empty.textContent = t("history.empty", { openGpx: t("app.openGpx") });
      historyHost.append(empty);
      return;
    }

    for (const track of state.tracks) {
      const item = document.createElement("article");
      item.className = "history-item";

      item.innerHTML = `
        <header class="history-item-top">
          <strong class="history-title"></strong>
          <button class="secondary outline" type="button" aria-label="${t("history.deleteTrackAria")}" title="${t(
        "history.deleteTrackTitle"
      )}">🗑</button>
        </header>
        <small class="history-meta"></small>
      `;

      const title = item.querySelector(".history-title");
      const meta = item.querySelector(".history-meta");
      const delBtn = item.querySelector("button");

      if (title) title.textContent = track.name || t("history.untitled");

      if (meta) {
        const date = formatDateTime(track.addedAt);
        const dist = formatDistance(track.trackLength, track.trackLengthUnit);
        const eta = formatDuration(track.estimatedTimeSeconds);
        meta.textContent = `${date} • ${dist} • ${eta}`;
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

    const totalDist = distM.length ? distM[distM.length - 1] : 0;
    const trackLength = totalDist * distFactor;

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

  const USER_SNAP_MIN_INTERVAL_MS = 80;
  let lastUserSnapSentAt = 0;
  let userSnapTimer = null;
  let userSnapInFlight = false;
  let userSnapDesired = null;

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

  function requestUserCursorSnap(pos) {
    userSnapDesired = pos;
    scheduleUserSnap();
  }

  function scheduleUserSnap() {
    if (!userSnapDesired) return;
    if (userSnapInFlight) return;
    const now = Date.now();
    const wait = Math.max(0, USER_SNAP_MIN_INTERVAL_MS - (now - lastUserSnapSentAt));
    clearTimeout(userSnapTimer);
    userSnapTimer = setTimeout(runUserSnap, wait);
  }

  async function runUserSnap() {
    userSnapTimer = null;
    if (userSnapInFlight) return;
    const pos = userSnapDesired;
    if (!pos) return;
    if (!state.currentTrack) return;

    userSnapInFlight = true;
    lastUserSnapSentAt = Date.now();

    try {
      const res = await worker.nearestPoint({ lat: pos.lat, lon: pos.lon });
      if (!res || !state.currentTrack) return;
      state.cursor = { kind: "segment", i: res.i, t: res.t };
      mapView.setCursor({ lat: res.lat, lon: res.lon });
      suppressChartCursorEventsOnce();
      const distM = segmentDistM(res.i, res.t);
      const eleM = segmentEleNormM(res.i, res.t);
      chartView.setCursorXY(distM * state.currentTrack.distFactor, eleM * state.currentTrack.eleFactor);
    } catch {
      // ignore
    } finally {
      userSnapInFlight = false;
      if (userSnapDesired && userSnapDesired !== pos) scheduleUserSnap();
    }
  }

  function maybeResumeAutoSnap() {
    if (!state.gps || !state.currentTrack) return;
    if (!state.gpsNearTrack || !state.lastSnapResult?.near) return;
    if (state.isUserDragging) return;
    applySnapResult(state.lastSnapResult);
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
  }

  function startGpsWatch() {
    if (state.geoWatchId != null) return;
    if (!("geolocation" in navigator)) {
      showToast(t("toast.geoNotSupported"));
      return;
    }

    state.gpsStale = false;
    state.gpsLastFixAt = 0;
    state.followGps = true;
    btnLocate.classList.remove("outline");
    btnLocate.setAttribute("aria-pressed", "true");
    btnFollow.disabled = false;
    btnFollow.classList.toggle("outline", !state.followGps);
    btnFollow.setAttribute("aria-pressed", String(state.followGps));

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
        if (state.followGps) mapView.panToGps();
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
    btnLocate.classList.add("outline");
    btnLocate.setAttribute("aria-pressed", "false");
    btnFollow.classList.add("outline");
    btnFollow.setAttribute("aria-pressed", "false");
    btnFollow.disabled = true;
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
          ${t("settings.timeEstimate", { paceUnit })}
          <small>${t("settings.timeEstimateHelp")}</small>
          <input id="setPace" name="pace" type="number" inputmode="decimal" min="1" step="0.1" />
        </label>

        <hr />

        <small id="storageInfo"></small>

        <button class="secondary" id="btnTilesClear" type="button">${t("settings.clearOffline")}</button>

        <label>${t("settings.pruneLabel")}</label>
        <fieldset role="group">
          <select id="setTilesRetention">
            <option value="604800">${t("settings.retention.w1")}</option>
            <option value="1209600">${t("settings.retention.w2")}</option>
            <option value="2592000">${t("settings.retention.m1")}</option>
            <option value="5184000">${t("settings.retention.m2")}</option>
            <option value="7776000">${t("settings.retention.m3")}</option>
          </select>
          <button id="btnTilesPrune" type="button">${t("settings.pruneAction")}</button>
        </fieldset>
      </form>
    `;

    const settingsForm = settingsBody.querySelector("#settingsForm");
    settingsForm?.addEventListener("submit", (e) => e.preventDefault());

    const langSel = settingsBody.querySelector("#setLang");
    const paceInput = settingsBody.querySelector("#setPace");
    const btnTilesClear = settingsBody.querySelector("#btnTilesClear");
    const retentionSel = settingsBody.querySelector("#setTilesRetention");
    const btnTilesPrune = settingsBody.querySelector("#btnTilesPrune");
    const storageInfo = settingsBody.querySelector("#storageInfo");

    if (langSel) langSel.value = getLangPreference();
    langSel?.addEventListener("change", () => {
      setLang(langSel.value);
      window.location.reload();
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
      if (!confirm(t("settings.clearOfflineConfirm"))) return;
      showMicroprogress(t("settings.clearing"));
      try {
        await sw.deleteAllTiles();
        showToast(t("settings.cleared"));
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
      } catch (e) {
        showToast(e?.message || t("settings.pruneFailed"));
      } finally {
        hideMicroprogress();
      }
    });

    if ("storage" in navigator && "estimate" in navigator.storage) {
      navigator.storage
        .estimate()
        .then((e) => {
          const usage = e.usage ? (e.usage / (1024 * 1024)).toFixed(1) : "?";
          const quota = e.quota ? (e.quota / (1024 * 1024)).toFixed(0) : "?";
          if (storageInfo) storageInfo.textContent = t("settings.spaceUsed", { usage, quota });
        })
        .catch(() => {});
    }
  }

  btnPanel.addEventListener("click", () => {
    const open = !panel.classList.contains("open");
    setPanelOpen(open);
    mapView.invalidateSizeSoon();
  });
  btnPanelClose.addEventListener("click", () => {
    setPanelOpen(false);
    mapView.invalidateSizeSoon();
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

  btnSettings.addEventListener("click", () => {
    setPanelOpen(false);
    renderSettings();
    openSettingsDialog();
  });
  btnSettingsClose.addEventListener("click", () => closeSettingsDialog());

  btnFit.addEventListener("click", () => mapView.fitToTrack());
  btnLocate.addEventListener("click", () => {
    if (state.geoWatchId == null) startGpsWatch();
    else stopGpsWatch();
  });
  btnFollow.addEventListener("click", () => {
    if (state.geoWatchId == null) return;
    state.followGps = !state.followGps;
    btnFollow.classList.toggle("outline", !state.followGps);
    btnFollow.setAttribute("aria-pressed", String(state.followGps));
    if (state.followGps) mapView.panToGps();
  });

  sw.onProgress((p) => {
    if (p.type === "tileAutoCacheProgress") {
      showMicroprogress(t("settings.cacheProgress", { done: p.done, total: p.total }));
      if (p.done >= p.total) setTimeout(() => hideMicroprogress(), 500);
    }
  });

  window.addEventListener("resize", () => {
    mapView.invalidateSizeSoon();
    chartView.resizeSoon();
  });

  await refreshHistory();
  renderSettings();

  const last = localStorage.getItem("lastTrackId");
  if (last) {
    openTrackById(last).catch(() => {});
  }
}
