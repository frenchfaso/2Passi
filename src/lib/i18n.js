const STRINGS = {
  it: {
    app: {
      menu: "Menu",
      toggleMenu: "Apri/chiudi menu",
      close: "Chiudi",
      closeMenu: "Chiudi menu",
      actions: "Azioni",
      history: "Cronologia",
      openGpx: "Apri GPX",
      settings: "Impostazioni",
      map: "Mappa",
      elevation: "Dislivello",
      elevationChart: "Grafico dislivello",
      fit: "Adatta",
      gps: "GPS",
      follow: "Segui"
    },
    track: {
      renameAria: "Rinomina traccia",
      renameTitle: "Rinomina traccia",
      renameLabel: "Nome traccia",
      renameSave: "Salva"
    },
    confirm: {
      title: "Conferma",
      message: "Sei sicuro?",
      ok: "OK",
      cancel: "Annulla",
      delete: "Elimina",
      deleteTrackTitle: "Eliminare traccia?",
      deleteTrackMessage: "Rimuoverà la traccia dalla cronologia locale."
    },
    history: {
      empty: 'Nessuna traccia. Tocca “{openGpx}” per importarne una.',
      untitled: "Traccia senza titolo",
      deleteTrackAria: "Elimina traccia",
      deleteTrackTitle: "Elimina"
    },
    toast: {
      saved: "Salvato.",
      trackNotFound: "Traccia non trovata.",
      fileTooLarge: "File troppo grande (>{max}MB).",
      importFailed: "Importazione non riuscita.",
      geoNotSupported: "Geolocalizzazione non supportata.",
      geoPermissionDenied: "Permesso geolocalizzazione negato."
    },
    errors: {
      failed: "Operazione non riuscita.",
      timeout: "Timeout.",
      swNoController: "Service worker non disponibile.",
      workerError: "Errore interno.",
      workerTimeout: "Operazione troppo lenta (timeout).",
      gpxParseError: "File GPX non valido (errore parsing XML).",
      gpxNoPoints: "Nessun punto <trkpt> trovato nel GPX.",
      gpxNotEnoughPoints: "Punti validi insufficienti."
    },
    chart: {
      processing: "Elaborazione…",
      distanceMi: "Distanza (mi)",
      distanceKm: "Distanza (km)",
      elevFt: "Dislivello Δ (ft)",
      elevM: "Dislivello Δ (m)"
    },
    settings: {
      title: "Impostazioni",
      close: "Chiudi impostazioni",
      language: "Lingua",
      languageAuto: "Auto",
      languageIt: "Italiano",
      languageEn: "English",
      languageDe: "Deutsch",
      unitSystem: "Unità di misura",
      unitMetric: "Metrico (km, m)",
      unitImperial: "Imperiale (mi, ft)",
      timeEstimate: "Stima tempo ({paceUnit})",
      timeEstimateHelp: "Usata solo se il GPX non contiene orari.",
      spaceUsed: "Spazio usato: {usage}MB / {quota}MB",
      clearOffline: "Cancella tile offline",
      clearOfflineConfirm: "Cancellare tutti i tile offline?",
      clearing: "Cancellazione tile…",
      cleared: "Tile offline cancellati.",
      clearFailed: "Errore durante la cancellazione dei tile.",
      pruneLabel: "Cancella tile non usati da…",
      pruneAction: "Cancella",
      pruning: "Pulizia tile…",
      pruned: "Eliminati {count} tile.",
      pruneFailed: "Errore durante la pulizia dei tile.",
      cacheProgress: "Cache tile… {done}/{total}",
      leafletAttribution: "Reso possibile dalla fantastica {leaflet}",
      retention: {
        w1: "1 settimana",
        w2: "2 settimane",
        w3: "3 settimane",
        w4: "4 settimane",
        m1: "1 mese",
        m2: "2 mesi",
        m3: "3 mesi"
      }
    },
    pwa: {
      updateAvailable: "Nuova versione disponibile.",
      update: "Aggiorna"
    }
  },
  en: {
    app: {
      menu: "Menu",
      toggleMenu: "Toggle menu",
      close: "Close",
      closeMenu: "Close menu",
      actions: "Actions",
      history: "History",
      openGpx: "Open GPX",
      settings: "Settings",
      map: "Map",
      elevation: "Elevation",
      elevationChart: "Elevation chart",
      fit: "Fit",
      gps: "GPS",
      follow: "Follow"
    },
    track: {
      renameAria: "Rename track",
      renameTitle: "Rename track",
      renameLabel: "Track name",
      renameSave: "Save"
    },
    confirm: {
      title: "Confirm",
      message: "Are you sure?",
      ok: "OK",
      cancel: "Cancel",
      delete: "Delete",
      deleteTrackTitle: "Delete track?",
      deleteTrackMessage: "This will remove the track from your local history."
    },
    history: {
      empty: 'No tracks yet. Tap “{openGpx}” to import one.',
      untitled: "Untitled track",
      deleteTrackAria: "Delete track",
      deleteTrackTitle: "Delete"
    },
    toast: {
      saved: "Saved.",
      trackNotFound: "Track not found.",
      fileTooLarge: "File too large (>{max}MB).",
      importFailed: "Import failed.",
      geoNotSupported: "Geolocation not supported.",
      geoPermissionDenied: "Geolocation permission denied."
    },
    errors: {
      failed: "Operation failed.",
      timeout: "Timeout.",
      swNoController: "Service worker not available.",
      workerError: "Internal error.",
      workerTimeout: "Operation timed out.",
      gpxParseError: "Invalid GPX file (XML parse error).",
      gpxNoPoints: "No <trkpt> points found in GPX.",
      gpxNotEnoughPoints: "Not enough valid points."
    },
    chart: {
      processing: "Processing…",
      distanceMi: "Distance (mi)",
      distanceKm: "Distance (km)",
      elevFt: "Elev Δ (ft)",
      elevM: "Elev Δ (m)"
    },
    settings: {
      title: "Settings",
      close: "Close settings",
      language: "Language",
      languageAuto: "Auto",
      languageIt: "Italiano",
      languageEn: "English",
      languageDe: "Deutsch",
      unitSystem: "Units",
      unitMetric: "Metric (km, m)",
      unitImperial: "Imperial (mi, ft)",
      timeEstimate: "Time estimate ({paceUnit})",
      timeEstimateHelp: "Used only if the GPX has no timestamps.",
      spaceUsed: "Storage used: {usage}MB / {quota}MB",
      clearOffline: "Clear offline tiles",
      clearOfflineConfirm: "Clear all offline tiles?",
      clearing: "Clearing tiles…",
      cleared: "Offline tiles cleared.",
      clearFailed: "Failed to clear offline tiles.",
      pruneLabel: "Delete tiles not used for…",
      pruneAction: "Delete",
      pruning: "Cleaning tiles…",
      pruned: "Deleted {count} tiles.",
      pruneFailed: "Failed to clean tiles.",
      cacheProgress: "Caching tiles… {done}/{total}",
      leafletAttribution: "Made possible by the awesome {leaflet}",
      retention: {
        w1: "1 week",
        w2: "2 weeks",
        w3: "3 weeks",
        w4: "4 weeks",
        m1: "1 month",
        m2: "2 months",
        m3: "3 months"
      }
    },
    pwa: {
      updateAvailable: "New version available.",
      update: "Update"
    }
  },
  de: {
    app: {
      menu: "Menü",
      toggleMenu: "Menü ein-/ausblenden",
      close: "Schließen",
      closeMenu: "Menü schließen",
      actions: "Aktionen",
      history: "Verlauf",
      openGpx: "GPX öffnen",
      settings: "Einstellungen",
      map: "Karte",
      elevation: "Höhenprofil",
      elevationChart: "Höhenprofil-Diagramm",
      fit: "Anpassen",
      gps: "GPS",
      follow: "Folgen"
    },
    track: {
      renameAria: "Track umbenennen",
      renameTitle: "Track umbenennen",
      renameLabel: "Trackname",
      renameSave: "Speichern"
    },
    confirm: {
      title: "Bestätigen",
      message: "Bist du sicher?",
      ok: "OK",
      cancel: "Abbrechen",
      delete: "Löschen",
      deleteTrackTitle: "Track löschen?",
      deleteTrackMessage: "Der Track wird aus deinem lokalen Verlauf entfernt."
    },
    history: {
      empty: 'Noch keine Tracks. Tippe auf “{openGpx}”, um einen zu importieren.',
      untitled: "Track ohne Titel",
      deleteTrackAria: "Track löschen",
      deleteTrackTitle: "Löschen"
    },
    toast: {
      saved: "Gespeichert.",
      trackNotFound: "Track nicht gefunden.",
      fileTooLarge: "Datei zu groß (>{max}MB).",
      importFailed: "Import fehlgeschlagen.",
      geoNotSupported: "Geolokalisierung wird nicht unterstützt.",
      geoPermissionDenied: "Geolokalisierungszugriff verweigert."
    },
    errors: {
      failed: "Vorgang fehlgeschlagen.",
      timeout: "Zeitüberschreitung.",
      swNoController: "Service Worker nicht verfügbar.",
      workerError: "Interner Fehler.",
      workerTimeout: "Zeitüberschreitung.",
      gpxParseError: "Ungültige GPX-Datei (XML-Parserfehler).",
      gpxNoPoints: "Keine <trkpt>-Punkte im GPX gefunden.",
      gpxNotEnoughPoints: "Nicht genügend gültige Punkte."
    },
    chart: {
      processing: "Verarbeitung…",
      distanceMi: "Distanz (mi)",
      distanceKm: "Distanz (km)",
      elevFt: "Höhe Δ (ft)",
      elevM: "Höhe Δ (m)"
    },
    settings: {
      title: "Einstellungen",
      close: "Einstellungen schließen",
      language: "Sprache",
      languageAuto: "Auto",
      languageIt: "Italiano",
      languageEn: "English",
      languageDe: "Deutsch",
      unitSystem: "Einheiten",
      unitMetric: "Metrisch (km, m)",
      unitImperial: "Imperial (mi, ft)",
      timeEstimate: "Zeitabschätzung ({paceUnit})",
      timeEstimateHelp: "Wird nur verwendet, wenn der GPX keine Zeitstempel hat.",
      spaceUsed: "Belegt: {usage}MB / {quota}MB",
      clearOffline: "Offline-Tiles löschen",
      clearOfflineConfirm: "Alle Offline-Tiles löschen?",
      clearing: "Tiles löschen…",
      cleared: "Offline-Tiles gelöscht.",
      clearFailed: "Offline-Tiles konnten nicht gelöscht werden.",
      pruneLabel: "Tiles löschen, ungenutzt seit…",
      pruneAction: "Löschen",
      pruning: "Tiles bereinigen…",
      pruned: "{count} Tiles gelöscht.",
      pruneFailed: "Tiles konnten nicht bereinigt werden.",
      cacheProgress: "Tiles werden zwischengespeichert… {done}/{total}",
      leafletAttribution: "Ermöglicht durch die awesome {leaflet}",
      retention: {
        w1: "1 Woche",
        w2: "2 Wochen",
        w3: "3 Wochen",
        w4: "4 Wochen",
        m1: "1 Monat",
        m2: "2 Monate",
        m3: "3 Monate"
      }
    },
    pwa: {
      updateAvailable: "Neue Version verfügbar.",
      update: "Aktualisieren"
    }
  }
};

function normalizeLang(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "ita") return "it";
  if (v === "eng") return "en";
  if (v === "deu" || v === "ger") return "de";
  if (v.startsWith("it")) return "it";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("de")) return "de";
  return null;
}

const LANG_KEY = "2passi:lang:v1";

function loadLangPreference() {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    const n = normalizeLang(raw);
    return n;
  } catch {
    return null;
  }
}

function detectLang() {
  const langs = [];
  try {
    if (Array.isArray(navigator.languages)) langs.push(...navigator.languages);
    if (navigator.language) langs.push(navigator.language);
  } catch {
    // ignore
  }
  for (const l of langs) {
    const n = normalizeLang(l);
    if (n) return n;
  }
  return "en";
}

let currentLang = loadLangPreference() ?? detectLang();

function getByPath(obj, path) {
  const parts = String(path || "").split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : null;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function getLang() {
  return currentLang;
}

export function getLangPreference() {
  return loadLangPreference() ?? "auto";
}

export function setLang(next) {
  const normalized = normalizeLang(next);
  try {
    if (!next || String(next).toLowerCase() === "auto") localStorage.removeItem(LANG_KEY);
    else if (normalized) localStorage.setItem(LANG_KEY, normalized);
  } catch {
    // ignore
  }
  currentLang = normalized ?? detectLang();
  return currentLang;
}

export function t(key, vars) {
  const k = String(key || "");
  const msg = getByPath(STRINGS[currentLang], k) ?? getByPath(STRINGS.en, k) ?? k;
  return interpolate(msg, vars);
}
