import "@picocss/pico/css/pico.min.css";
import "leaflet/dist/leaflet.css";
import "uplot/dist/uPlot.min.css";
import "./styles.css";
import { createAppRoot } from "./app";
import { initController } from "./controller";

import { registerSW } from "virtual:pwa-register";
import { getLang, t } from "./lib/i18n";

document.documentElement.lang = getLang();

const app = createAppRoot();
document.querySelector("#app")?.append(app);

const updateSW = registerSW({
  immediate: true,
  scope: import.meta.env.BASE_URL,
  onNeedRefresh() {
    const host = document.querySelector("#toastHost");
    if (!host) return;
    const toast = document.createElement("article");
    toast.className = "toast";
    toast.innerHTML = `
      <p>${t("pwa.updateAvailable")}</p>
      <footer>
        <button type="button">${t("pwa.update")}</button>
      </footer>
    `;
    const btn = toast.querySelector("button");
    btn?.addEventListener("click", async () => {
      await updateSW(true);
    });
    host.append(toast);
    setTimeout(() => toast.remove(), 10000);
  }
});

initController().catch((e) => {
  const msg = e?.message || String(e);
  console.error(e);
  const host = document.querySelector("#toastHost");
  if (host) {
    const toast = document.createElement("article");
    toast.className = "toast";
    toast.textContent = msg;
    host.append(toast);
  }
});
