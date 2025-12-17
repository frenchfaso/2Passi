import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";

function normalizeBasePath(value) {
  if (!value) return "/";
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  base: normalizeBasePath(process.env.BASE_PATH),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.ico",
        "favicon-16.png",
        "favicon-32.png",
        "apple-touch-icon.png",
        "icons/*.png"
      ],
      manifest: {
        name: "2Passi",
        short_name: "2Passi",
        description: "Lightweight GPX viewer with history and elevation",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        file_handlers: [
          {
            action: ".",
            accept: {
              "application/gpx+xml": [".gpx"],
              "application/xml": [".gpx"],
              "text/xml": [".gpx"],
              "application/octet-stream": [".gpx"]
            }
          }
        ],
        launch_handler: {
          client_mode: ["focus-existing", "navigate-existing"]
        },
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
