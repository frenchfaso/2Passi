<p align="center">
  <img src="public/icons/2passi.png" width="96" alt="2Passi logo" />
</p>

<h1 align="center">2Passi</h1>

<p align="center">
  Local-first GPX viewer PWA with map and elevation chart.<br />
  <a href="https://frenchfaso.github.io/2Passi/">Open 2Passi</a>
</p>

## Key features

- GPX import + track history
- Synced marker between map and elevation chart (drag from the chart)
- GPS with “snap to track” when you’re close
- Local cache for map tiles you have viewed, with storage cleanup
- Metric/imperial units + track renaming

## Quick start

1. Open the menu → import a `.gpx` file or pick one from history.
2. Drag on the elevation chart to move the marker.
3. Enable GPS to see your position and (if close) snap to the track.
4. In Settings you can change units, pace and cached-map retention.

## Privacy and map data

GPX files and track history are stored locally in your browser. 2Passi has no
application backend and does not upload GPX files. Map tiles are requested
directly from the configured map provider, which can receive your IP address
and the geographic area being viewed. 2Passi does not bulk-download or
prefetch map tiles.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright). The public
OpenStreetMap tile service is subject to its
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Development

Requires Node.js 20.19 or newer and npm 11.6.1.

```sh
npm ci
npm test
npm run dev
```

Build the GitHub Pages variant with:

```sh
BASE_PATH=/2Passi/ npm run build
```

## License

2Passi is released under the [MIT License](LICENSE). Third-party components
retain their own licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
