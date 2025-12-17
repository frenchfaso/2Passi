const SETTINGS_KEY = "2passi:settings:v1";

export function getDefaultSettings() {
  return {
    unitSystem: "metric",
    pace: {
      secondsPerKm: 12 * 60,
      secondsPerMi: 20 * 60
    },
    tile: {
      template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      retentionSeconds: 2592000
    }
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { theme: _theme, ...rest } = parsed || {};
    const defaults = getDefaultSettings();
    return {
      ...defaults,
      ...rest,
      pace: { ...defaults.pace, ...(rest.pace || {}) },
      tile: { ...defaults.tile, ...(rest.tile || {}) }
    };
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
