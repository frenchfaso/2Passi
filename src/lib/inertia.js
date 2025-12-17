function defaultNowMs() {
  return globalThis.performance && typeof globalThis.performance.now === "function" ? globalThis.performance.now() : Date.now();
}

/**
 * Scalar inertia runner (1D).
 * Collect samples during drag via `sample(value)`, then call `startFromSamples()`.
 */
export function createInertia({
  sampleWindowMs = 140,
  startVelocityThreshold = 0.05,
  stopVelocityThreshold = 0.01,
  tauMs = 200,
  maxDurationMs = 0,
  getBounds,
  apply,
  onDone,
  nowMs = defaultNowMs
} = {}) {
  let rafId = 0;
  let lastTs = 0;
  let startTs = 0;
  let velocity = 0;
  let value = 0;
  let samples = [];

  function cancel() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastTs = 0;
    startTs = 0;
    velocity = 0;
    samples = [];
  }

  function resetSamples() {
    samples = [];
  }

  function sample(v) {
    const ts = nowMs();
    samples.push({ ts, v });
    const cutoff = ts - sampleWindowMs;
    while (samples.length > 2 && samples[0].ts < cutoff) samples.shift();
  }

  function startFromSamples() {
    if (rafId) return true;
    if (samples.length < 2) return false;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.ts - first.ts;
    if (!(dt > 0)) return false;

    const v0 = (last.v - first.v) / dt;
    if (Math.abs(v0) < startVelocityThreshold) return false;

    value = last.v;
    velocity = v0;
    lastTs = nowMs();
    startTs = lastTs;

    const step = () => {
      const ts = nowMs();
      const dtStep = ts - lastTs;
      lastTs = ts;

      const bounds = typeof getBounds === "function" ? getBounds() : null;
      if (!bounds || !Number.isFinite(bounds.min) || !Number.isFinite(bounds.max) || bounds.max <= bounds.min) {
        rafId = 0;
        onDone?.(value);
        return;
      }

      velocity *= Math.exp(-dtStep / tauMs);
      value += velocity * dtStep;

      const min = bounds.min;
      const max = bounds.max;
      if (value < min) value = min;
      if (value > max) value = max;

      const ok = apply?.(value);
      if (ok === false) {
        rafId = 0;
        onDone?.(value);
        return;
      }

      if (
        Math.abs(velocity) <= stopVelocityThreshold ||
        (value <= min && velocity < 0) ||
        (value >= max && velocity > 0) ||
        (maxDurationMs > 0 && ts - startTs >= maxDurationMs)
      ) {
        rafId = 0;
        onDone?.(value);
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return true;
  }

  return {
    cancel,
    resetSamples,
    sample,
    startFromSamples,
    get running() {
      return Boolean(rafId);
    }
  };
}

