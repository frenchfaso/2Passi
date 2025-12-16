# 2Passi
Lightweight, offline-first GPX viewer PWA (no backend) with map + elevation chart and a history side panel.

## Prerequisites
- Node.js + npm (this repo is set up to work with the `conda` env `2passi`).

## Setup
- Install deps: `conda run -n 2passi npm install`

## Run
- Dev server: `conda run -n 2passi npm run dev`
- Production build: `conda run -n 2passi npm run build`
- Preview build (recommended to test PWA/SW): `conda run -n 2passi npm run preview`

## Deploy (GitHub Pages)
- This repo includes a workflow that builds and deploys `dist/` to GitHub Pages on pushes to `main`.
- In GitHub: `Settings → Pages → Build and deployment → Source: GitHub Actions`.

## Notes
- Service Worker is enabled in production builds; offline tiles are cached at runtime and can be managed in Settings.
