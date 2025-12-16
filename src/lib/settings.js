const SETTINGS_KEY = "2passi:settings:v1";

export function getDefaultSettings() {
  return {
    unitSystem: "metric",
    pace: {
      secondsPerKm: 6 * 60,
      secondsPerMi: 10 * 60
    },
    tile: {
      template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { theme: _theme, ...rest } = parsed || {};
    return { ...getDefaultSettings(), ...rest };
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
