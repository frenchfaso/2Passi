import uPlot from "uplot";
import { createInertia } from "./inertia";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function createChartView(container, metaHost, { onCursorIndexChange, onUserDragStart, onUserDragEnd }) {
  let u = null;
  let data = null;
  let ro = null;
  let resizeTimer = null;
  let pointerDown = false;
  let markerEl = null;
  let markerOverride = null;
  let suppressCursorCallback = false;
  let touchActive = false;
  let formatMeta = null;
  let inertiaTop = 0;
  const inertia = createInertia({
    sampleWindowMs: 120,
    startVelocityThreshold: 0.05,
    stopVelocityThreshold: 0.01,
    tauMs: 180,
    maxDurationMs: 0,
    getBounds() {
      if (!u) return null;
      const w = u.over?.clientWidth ?? 0;
      if (!(w > 0)) return null;
      return { min: 0, max: w };
    },
    apply(left) {
      if (!u) return false;
      u.setCursor({ left, top: inertiaTop });
    },
    onDone() {
      onUserDragEnd?.();
    }
  });

  function destroyPlot() {
    inertia.cancel();
    if (u) u.destroy();
    u = null;
    data = null;
    markerEl = null;
    markerOverride = null;
  }

  function clear({ message } = {}) {
    destroyPlot();
    container.innerHTML = "";
    if (message) {
      const el = document.createElement("div");
      el.className = "chart-placeholder";
      el.textContent = message;
      container.append(el);
    }
    if (metaHost) metaHost.textContent = "";
  }

  function setMetaFormatter(fn) {
    formatMeta = typeof fn === "function" ? fn : null;
  }

  function setData(x, y, { distLabel, elevLabel }) {
    destroyPlot();
    container.innerHTML = "";

    const width = Math.max(10, container.clientWidth);
    const height = Math.max(10, container.clientHeight);

    data = [x, y];

    const opts = {
      width,
      height,
      legend: { show: false },
      cursor: {
        show: true,
        x: true,
        y: false,
        drag: { setScale: false, x: false, y: false },
        points: { show: false }
      },
      axes: [
        {
          label: distLabel,
          stroke: "rgba(71,85,105,0.9)",
          grid: { stroke: "rgba(148,163,184,0.16)" }
        },
        {
          label: elevLabel,
          stroke: "rgba(71,85,105,0.9)",
          grid: { stroke: "rgba(148,163,184,0.16)" }
        }
      ],
      scales: {
        x: { time: false },
        y: { time: false }
      },
      series: [
        {},
        {
          stroke: "#22c55e",
          width: 2
        }
      ],
      hooks: {
        setCursor: [
          (uPlotInstance) => {
            const idx = uPlotInstance.cursor.idx;
            if (idx == null || idx < 0 || !Number.isFinite(idx)) return;
            if (!data) return;

            const xValRaw = data[0][idx];
            const yValRaw = data[1][idx];
            const xVal = markerOverride?.xVal ?? xValRaw;
            const yVal = markerOverride?.yVal ?? yValRaw;

            if (metaHost) {
              const next =
                formatMeta?.({ idx, xVal, yVal, xValRaw, yValRaw }) ?? `${xVal.toFixed(2)} • ${yVal.toFixed(0)}`;
              metaHost.textContent = next ?? "";
            }

            if (markerEl) {
              const leftRaw = uPlotInstance.valToPos(xVal, "x");
              const topRaw = uPlotInstance.valToPos(yVal, "y");

              const w = uPlotInstance.over?.clientWidth ?? 0;
              const h = uPlotInstance.over?.clientHeight ?? 0;
              const pad = 8;

              const left = Number.isFinite(leftRaw) ? clamp(leftRaw, pad, Math.max(pad, w - pad)) : pad;
              const top = Number.isFinite(topRaw) ? clamp(topRaw, pad, Math.max(pad, h - pad)) : pad;

              markerEl.style.left = `${left}px`;
              markerEl.style.top = `${top}px`;
            }

            markerOverride = null;
            if (!suppressCursorCallback) onCursorIndexChange?.(idx);
          }
        ]
      }
    };

    u = new uPlot(opts, data, container);

    markerEl = document.createElement("div");
    markerEl.className = "chart-cursor dot-marker marker-track";
    markerEl.style.position = "absolute";
    markerEl.style.transform = "translate(-50%, -50%)";
    markerEl.style.pointerEvents = "none";
    markerEl.style.zIndex = "10";
    markerEl.style.left = "50%";
    markerEl.style.top = "50%";
    u.over.append(markerEl);

    u.over.addEventListener("pointerdown", (e) => {
      if (touchActive && e.pointerType === "touch") return;
      e.preventDefault();
      inertia.cancel();
      inertia.resetSamples();
      pointerDown = true;
      try {
        u.over.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      onUserDragStart?.();
      updateCursorFromEvent(e);
    });
    u.over.addEventListener("pointermove", (e) => {
      if (!pointerDown) return;
      if (touchActive && e.pointerType === "touch") return;
      e.preventDefault();
      updateCursorFromEvent(e);
    });
    u.over.addEventListener("pointerup", (e) => {
      if (!pointerDown) return;
      if (touchActive && e.pointerType === "touch") return;
      e.preventDefault();
      pointerDown = false;
      try {
        u.over.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (!inertia.startFromSamples()) onUserDragEnd?.();
    });
    u.over.addEventListener("pointercancel", (e) => {
      if (!pointerDown) return;
      if (touchActive && e.pointerType === "touch") return;
      e.preventDefault();
      pointerDown = false;
      inertia.cancel();
      onUserDragEnd?.();
    });

    u.over.addEventListener(
      "touchstart",
      (e) => {
        if (!u) return;
        inertia.cancel();
        inertia.resetSamples();
        touchActive = true;
        pointerDown = true;
        e.preventDefault();
        onUserDragStart?.();
        const t = e.touches?.[0];
        if (!t) return;
        updateCursorFromClientXY(t.clientX, t.clientY);
      },
      { passive: false }
    );
    u.over.addEventListener(
      "touchmove",
      (e) => {
        if (!pointerDown || !u) return;
        e.preventDefault();
        const t = e.touches?.[0];
        if (!t) return;
        updateCursorFromClientXY(t.clientX, t.clientY);
      },
      { passive: false }
    );
    u.over.addEventListener(
      "touchend",
      (e) => {
        if (!pointerDown) return;
        e.preventDefault();
        pointerDown = false;
        touchActive = false;
        if (!inertia.startFromSamples()) onUserDragEnd?.();
      },
      { passive: false }
    );
    u.over.addEventListener(
      "touchcancel",
      (e) => {
        if (!pointerDown) return;
        e.preventDefault();
        pointerDown = false;
        touchActive = false;
        inertia.cancel();
        onUserDragEnd?.();
      },
      { passive: false }
    );

    ro?.disconnect();
    ro = new ResizeObserver(() => resizeSoon());
    ro.observe(container);
  }

  function updateCursorFromEvent(e) {
    updateCursorFromClientXY(e.clientX, e.clientY);
  }

  function updateCursorFromClientXY(clientX, clientY) {
    if (!u) return;
    const rect = u.over.getBoundingClientRect();
    const left = clamp(clientX - rect.left, 0, rect.width);
    const top = clamp(clientY - rect.top, 0, rect.height);
    inertiaTop = top;
    if (pointerDown) inertia.sample(left);
    u.setCursor({ left, top });
  }

  function setCursorIndex(idx) {
    inertia.cancel();
    if (!u || !data) return;
    const safeIdx = clamp(idx, 0, data[0].length - 1);
    const x = data[0][safeIdx];
    const y = data[1][safeIdx];
    setCursorXY(x, y);
  }

  function setCursorDist(xVal) {
    inertia.cancel();
    if (!u) return;
    const left = u.valToPos(xVal, "x");
    const top = u.over.clientHeight ? u.over.clientHeight / 2 : 0;
    u.setCursor({ left, top });
  }

  function setCursorXY(xVal, yVal) {
    inertia.cancel();
    if (!u) return;
    markerOverride = { xVal, yVal };
    const left = u.valToPos(xVal, "x");
    const top = u.valToPos(yVal, "y");
    u.setCursor({ left, top });
  }

  function resizeSoon() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resizeNow(), 50);
  }

  function resizeNow() {
    if (!u) return;
    const width = Math.max(10, container.clientWidth);
    const height = Math.max(10, container.clientHeight);
    u.setSize({ width, height });

    const idx = u.cursor?.idx;
    if (!data || idx == null || idx < 0 || !Number.isFinite(idx)) return;
    const safeIdx = clamp(idx, 0, data[0].length - 1);
    const xVal = data[0][safeIdx];
    const yVal = data[1][safeIdx];
    suppressCursorCallback = true;
    try {
      setCursorXY(xVal, yVal);
    } finally {
      suppressCursorCallback = false;
    }
  }

  return {
    clear,
    setData,
    setCursorIndex,
    setCursorDist,
    setCursorXY,
    setMetaFormatter,
    resizeSoon
  };
}
