import "@picocss/pico/css/pico.min.css";
import "leaflet/dist/leaflet.css";
import "uplot/dist/uPlot.min.css";
import "./styles.css";
import { createAppRoot } from "./app";
import { initController } from "./controller";

import { registerSW } from "virtual:pwa-register";

const app = createAppRoot();
document.querySelector("#app")?.append(app);

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const host = document.querySelector("#toastHost");
    if (!host) return;
    const toast = document.createElement("article");
    toast.className = "toast";
    toast.innerHTML = `
      <p>New version available.</p>
      <footer>
        <button type="button">Update</button>
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
