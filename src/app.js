import { t } from "./lib/i18n";

export function createAppRoot() {
  const logoSrc = `${import.meta.env.BASE_URL}icons/icon-192.png`;
  const appVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
  const appVersionText = appVersion ? `v ${appVersion}` : "";

  const app = document.createElement("div");
  app.className = "app";

	  app.innerHTML = `
	    <header class="topbar">
	      <div
	        id="btnPanel"
	        class="topbar-logo-btn"
	        role="button"
	        tabindex="0"
	        aria-label="${t("app.toggleMenu")}"
	        aria-controls="panel"
	        aria-expanded="false"
	        title="${t("app.menu")}"
	      >
	        <div class="topbar-logo-wrap" aria-hidden="true">
	          <img class="brand-logo" src="${logoSrc}" alt="" decoding="async" />
	        </div>
	      </div>
		      <div class="topbar-center">
		        <strong class="app-title">2Passi</strong>
            <small class="app-version" ${appVersionText ? "" : "hidden"}>${appVersionText}</small>
		      </div>
		      <div class="topbar-spacer" aria-hidden="true"></div>
		    </header>

	    <aside class="panel" id="panel" aria-label="${t("app.menu")}">
	      <div class="panel-content">
	        <div class="history" id="history" aria-label="${t("app.history")}"></div>
	        <nav class="panel-menu" aria-label="${t("app.actions")}">
	          <button id="btnOpen" type="button">${t("app.openGpx")}</button>
	          <button id="btnSettings" type="button" class="secondary">${t("app.settings")}</button>
            <div class="menu-credits">
              <small class="menu-credits-title" id="menuCreditsTitle">${t("app.creditsTitle")}</small>
              <small class="menu-credits-links" id="menuCreditsLinks">
                <a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a> ·
                <a href="https://github.com/leeoniya/uPlot" target="_blank" rel="noopener noreferrer">uPlot</a> ·
                <a href="https://github.com/jakearchibald/idb" target="_blank" rel="noopener noreferrer">idb</a>
              </small>
            </div>
	        </nav>
	      </div>
	    </aside>

    <main class="main">
      <section class="map-wrap">
        <div id="map" class="map" aria-label="${t("app.map")}"></div>
	        <div class="map-overlay">
	          <button id="btnFit" type="button" class="secondary outline">${t("app.fit")}</button>
	          <button id="btnLocate" type="button" class="secondary outline" aria-pressed="false">${t("app.gps")}</button>
	        </div>
	      </section>
	      <section class="chart-wrap">
	        <header class="chart-header">
	          <button
	            type="button"
	            class="track-title track-title-btn"
	            id="currentTitle"
	            hidden
	            aria-label="${t("track.renameAria")}"
	            title="${t("track.renameAria")}"
	          ></button>
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

	    <dialog id="renameDialog" aria-labelledby="renameTitle">
	      <article>
	        <header>
	          <button class="close" id="btnRenameClose" aria-label="${t("app.close")}"></button>
	          <h3 id="renameTitle">${t("track.renameTitle")}</h3>
	        </header>
	        <label>
	          <span id="renameLabelText">${t("track.renameLabel")}</span>
	          <input id="renameInput" type="text" autocomplete="off" spellcheck="false" maxlength="120" />
	        </label>
	        <footer>
	          <button class="secondary" id="btnRenameCancel" type="button">${t("confirm.cancel")}</button>
	          <button id="btnRenameSave" type="button">${t("track.renameSave")}</button>
	        </footer>
	      </article>
	    </dialog>

    <input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/octet-stream,text/xml" hidden />

    <div class="toast-host" id="toastHost" aria-live="polite" aria-relevant="additions"></div>
	    <article class="microprogress" id="microprogress" hidden role="status" aria-live="polite"></article>
	  `;

  return app;
}
