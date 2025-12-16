import uPlot from "uplot";

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
  let touchActive = false;

  function destroyPlot() {
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
        drag: { setScale: false, x: false, y: false },
        points: { show: false }
      },
      axes: [
        {
          label: distLabel,
          stroke: "rgba(229,231,235,0.7)",
          grid: { stroke: "rgba(148,163,184,0.12)" }
        },
        {
          label: elevLabel,
          stroke: "rgba(229,231,235,0.7)",
          grid: { stroke: "rgba(148,163,184,0.12)" }
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

            if (metaHost) metaHost.textContent = `${xVal.toFixed(2)} • ${yVal.toFixed(0)}`;

            if (markerEl) {
              const left = uPlotInstance.valToPos(xVal, "x");
              const top = uPlotInstance.valToPos(yVal, "y");
              markerEl.style.left = `${left}px`;
              markerEl.style.top = `${top}px`;
            }

            markerOverride = null;
            onCursorIndexChange?.(idx);
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
      onUserDragEnd?.();
    });
    u.over.addEventListener("pointercancel", (e) => {
      if (!pointerDown) return;
      if (touchActive && e.pointerType === "touch") return;
      e.preventDefault();
      pointerDown = false;
      onUserDragEnd?.();
    });

    u.over.addEventListener(
      "touchstart",
      (e) => {
        if (!u) return;
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
        onUserDragEnd?.();
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
    u.setCursor({ left, top });
  }

  function setCursorIndex(idx) {
    if (!u || !data) return;
    const safeIdx = clamp(idx, 0, data[0].length - 1);
    const x = data[0][safeIdx];
    setCursorDist(x);
  }

  function setCursorDist(xVal) {
    if (!u) return;
    const left = u.valToPos(xVal, "x");
    const top = u.over.clientHeight ? u.over.clientHeight / 2 : 0;
    u.setCursor({ left, top });
  }

  function setCursorXY(xVal, yVal) {
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
  }

  return {
    clear,
    setData,
    setCursorIndex,
    setCursorDist,
    setCursorXY,
    resizeSoon
  };
}
