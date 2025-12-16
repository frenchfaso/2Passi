import { t } from "./lib/i18n";

export function createAppRoot() {
  const app = document.createElement("div");
  app.className = "app";

  app.innerHTML = `
    <header class="topbar">
      <button
        id="btnPanel"
        type="button"
        class="secondary outline"
        aria-label="${t("app.toggleMenu")}"
        aria-controls="panel"
        aria-expanded="false"
        title="${t("app.menu")}"
      >
        <span aria-hidden="true">☰</span>
      </button>
      <strong class="topbar-title" id="currentTitle">2Passi</strong>
    </header>

    <aside class="panel" id="panel" aria-label="${t("app.menu")}">
      <header class="panel-header">
        <strong>${t("app.menu")}</strong>
        <button
          id="btnPanelClose"
          type="button"
          class="secondary outline"
          aria-label="${t("app.closeMenu")}"
          title="${t("app.closeMenu")}"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="panel-content">
        <nav class="panel-menu" aria-label="${t("app.actions")}">
          <button id="btnOpen" type="button">${t("app.openGpx")}</button>
          <button id="btnSettings" type="button" class="secondary">${t("app.settings")}</button>
        </nav>

        <div class="history" id="history" aria-label="${t("app.history")}"></div>
      </div>
    </aside>

    <main class="main">
      <section class="map-wrap">
        <div id="map" class="map" aria-label="${t("app.map")}"></div>
        <div class="map-overlay">
          <button id="btnFit" type="button" class="secondary outline">${t("app.fit")}</button>
          <button id="btnLocate" type="button" class="secondary outline" aria-pressed="false">${t("app.gps")}</button>
          <button id="btnFollow" type="button" class="secondary outline" aria-pressed="false" disabled>${t("app.follow")}</button>
        </div>
      </section>
      <section class="chart-wrap">
        <header class="chart-header">
          <strong>${t("app.elevation")}</strong>
          <small class="chart-meta" id="chartMeta"></small>
        </header>
        <div id="chart" class="chart" aria-label="${t("app.elevationChart")}"></div>
      </section>
    </main>

    <div class="backdrop" id="backdrop" hidden></div>

    <dialog id="settingsDialog" aria-labelledby="settingsTitle">
      <article>
        <header>
          <button class="close" id="btnSettingsClose" aria-label="${t("settings.close")}"></button>
          <h3 id="settingsTitle">${t("settings.title")}</h3>
        </header>
        <div id="settingsBody"></div>
      </article>
    </dialog>

    <dialog id="confirmDialog" aria-labelledby="confirmTitle">
      <article>
        <header>
          <button class="close" id="btnConfirmClose" aria-label="${t("app.close")}"></button>
          <h3 id="confirmTitle">${t("confirm.title")}</h3>
        </header>
        <p id="confirmMessage"></p>
        <footer>
          <button class="secondary" id="btnConfirmCancel" type="button">${t("confirm.cancel")}</button>
          <button id="btnConfirmOk" type="button">${t("confirm.delete")}</button>
        </footer>
      </article>
    </dialog>

    <input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/octet-stream,text/xml" hidden />

    <div class="toast-host" id="toastHost" aria-live="polite" aria-relevant="additions"></div>
    <article class="microprogress" id="microprogress" hidden role="status" aria-live="polite"></article>
  `;

  return app;
}
