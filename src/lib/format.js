export function formatDateTime(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDistance(value, unit) {
  if (!Number.isFinite(value) || value <= 0) return `—`;
  const rounded = value < 10 ? value.toFixed(2) : value.toFixed(1);
  return `${rounded} ${unit}`;
}

