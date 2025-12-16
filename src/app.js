export function createAppRoot() {
  const app = document.createElement("div");
  app.className = "app";

  app.innerHTML = `
    <header class="topbar">
      <button
        id="btnPanel"
        type="button"
        class="secondary outline"
        aria-label="Toggle menu"
        aria-controls="panel"
        aria-expanded="false"
        title="Menu"
      >
        <span aria-hidden="true">☰</span>
      </button>
      <strong class="topbar-title" id="currentTitle">2Passi</strong>
    </header>

    <aside class="panel" id="panel" aria-label="Menu">
      <header class="panel-header">
        <strong>Menu</strong>
        <button
          id="btnPanelClose"
          type="button"
          class="secondary outline"
          aria-label="Close menu"
          title="Close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <div class="panel-content">
        <nav class="panel-menu" aria-label="Actions">
          <button id="btnOpen" type="button">Open GPX</button>
          <button id="btnSettings" type="button" class="secondary">Settings</button>
        </nav>

        <div class="history" id="history" aria-label="History"></div>
      </div>
    </aside>

    <main class="main">
      <section class="map-wrap">
        <div id="map" class="map" aria-label="Map"></div>
        <div class="map-overlay">
          <button id="btnFit" type="button" class="secondary outline">Fit</button>
          <button id="btnLocate" type="button" class="secondary outline" aria-pressed="false">GPS</button>
          <button id="btnFollow" type="button" class="secondary outline" aria-pressed="false" disabled>Follow</button>
        </div>
      </section>
      <section class="chart-wrap">
        <header class="chart-header">
          <strong>Elevation</strong>
          <small class="chart-meta" id="chartMeta"></small>
        </header>
        <div id="chart" class="chart" aria-label="Elevation chart"></div>
      </section>
    </main>

    <div class="backdrop" id="backdrop" hidden></div>

    <dialog id="settingsDialog" aria-labelledby="settingsTitle">
      <article>
        <header>
          <button class="close" id="btnSettingsClose" aria-label="Close settings"></button>
          <h3 id="settingsTitle">Settings</h3>
        </header>
        <div id="settingsBody"></div>
      </article>
    </dialog>

    <dialog id="confirmDialog" aria-labelledby="confirmTitle">
      <article>
        <header>
          <button class="close" id="btnConfirmClose" aria-label="Close"></button>
          <h3 id="confirmTitle">Confirm</h3>
        </header>
        <p id="confirmMessage"></p>
        <footer>
          <button class="secondary" id="btnConfirmCancel" type="button">Cancel</button>
          <button id="btnConfirmOk" type="button">Delete</button>
        </footer>
      </article>
    </dialog>

    <input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/octet-stream,text/xml" hidden />

    <div class="toast-host" id="toastHost" aria-live="polite" aria-relevant="additions"></div>
    <article class="microprogress" id="microprogress" hidden role="status" aria-live="polite"></article>
  `;

  return app;
}
