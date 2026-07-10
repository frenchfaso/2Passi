const METERS_PER_MILE = 1609.344;

export function recordedDurationSeconds(stats) {
  const start = Number(stats?.startTimeMs);
  const end = Number(stats?.endTimeMs);
  if (!stats?.hasTime || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 1000);
}

export function estimatedDurationSecondsFromPace(totalDistanceM, settings) {
  const distanceM = Number(totalDistanceM);
  if (!Number.isFinite(distanceM) || distanceM < 0) return 0;

  const imperial = settings?.unitSystem === "imperial";
  const distance = imperial ? distanceM / METERS_PER_MILE : distanceM / 1000;
  const paceSeconds = imperial ? Number(settings?.pace?.secondsPerMi) : Number(settings?.pace?.secondsPerKm);
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) return 0;
  return Math.round(distance * paceSeconds);
}
