import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let dom;
let parseGpxBlob;
let setGpxTrackName;

before(async () => {
  dom = new JSDOM("");
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  ({ parseGpxBlob, setGpxTrackName } = await import("../src/lib/gpx.js"));
});

after(() => {
  dom.window.close();
  delete globalThis.DOMParser;
  delete globalThis.XMLSerializer;
});

function gpxBlob(body) {
  return new Blob(
    [`<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:vendor="urn:vendor">${body}</gpx>`],
    { type: "application/gpx+xml" }
  );
}

test("reads direct GPX metadata instead of similarly named extension elements", async () => {
  const parsed = await parseGpxBlob(
    gpxBlob(`
      <metadata><desc>Metadata description</desc></metadata>
      <trk>
        <extensions><vendor:name>Extension name</vendor:name></extensions>
        <name>Direct name</name>
        <desc>Direct description</desc>
        <trkseg>
          <trkpt lat="45" lon="9"><ele>100</ele></trkpt>
          <trkpt lat="45.01" lon="9.01"><ele>110</ele></trkpt>
        </trkseg>
      </trk>
    `)
  );

  assert.equal(parsed.name, "Direct name");
  assert.equal(parsed.description, "Direct description");
});

test("renaming inserts a direct track name without altering extension metadata", async () => {
  const source = gpxBlob(`
    <trk>
      <extensions><vendor:name>Extension name</vendor:name></extensions>
      <trkseg>
        <trkpt lat="45" lon="9" />
        <trkpt lat="45.01" lon="9.01" />
      </trkseg>
    </trk>
  `);

  const renamed = await setGpxTrackName(source, "New name");
  const xml = await renamed.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const track = doc.getElementsByTagNameNS("*", "trk")[0];
  const directName = Array.from(track.children).find((child) => child.localName === "name");
  const extensionName = doc.getElementsByTagNameNS("urn:vendor", "name")[0];

  assert.equal(directName?.textContent, "New name");
  assert.equal(extensionName?.textContent, "Extension name");
});

test("normalizes missing leading elevation without creating a false climb", async () => {
  const parsed = await parseGpxBlob(
    gpxBlob(`
      <trk><trkseg>
        <trkpt lat="45" lon="9" />
        <trkpt lat="45.01" lon="9.01"><ele>850</ele></trkpt>
      </trkseg></trk>
    `)
  );

  assert.equal(parsed.hasElevation, true);
  assert.deepEqual(Array.from(parsed.ele), [850, 850]);
});

test("marks tracks without elevation and supplies a neutral profile", async () => {
  const parsed = await parseGpxBlob(
    gpxBlob(`
      <trk><trkseg>
        <trkpt lat="45" lon="9" />
        <trkpt lat="45.01" lon="9.01" />
      </trkseg></trk>
    `)
  );

  assert.equal(parsed.hasElevation, false);
  assert.deepEqual(Array.from(parsed.ele), [0, 0]);
});
