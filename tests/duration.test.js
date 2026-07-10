import test from "node:test";
import assert from "node:assert/strict";

import { estimatedDurationSecondsFromPace, recordedDurationSeconds } from "../src/lib/duration.js";

test("uses recorded timestamps only when they form a positive duration", () => {
  assert.equal(recordedDurationSeconds({ hasTime: true, startTimeMs: 1_000, endTimeMs: 61_000 }), 60);
  assert.equal(recordedDurationSeconds({ hasTime: true, startTimeMs: 1_000, endTimeMs: 1_000 }), null);
  assert.equal(recordedDurationSeconds({ hasTime: false, startTimeMs: 1_000, endTimeMs: 61_000 }), null);
});

test("estimates metric duration from distance and pace", () => {
  const settings = {
    unitSystem: "metric",
    pace: { secondsPerKm: 720, secondsPerMi: 1200 }
  };
  assert.equal(estimatedDurationSecondsFromPace(5_000, settings), 3_600);
});

test("estimates imperial duration from distance and pace", () => {
  const settings = {
    unitSystem: "imperial",
    pace: { secondsPerKm: 720, secondsPerMi: 1200 }
  };
  assert.equal(estimatedDurationSecondsFromPace(1609.344 * 3, settings), 3_600);
});

test("rejects invalid distances and pace values", () => {
  const settings = { unitSystem: "metric", pace: { secondsPerKm: 0 } };
  assert.equal(estimatedDurationSecondsFromPace(-1, settings), 0);
  assert.equal(estimatedDurationSecondsFromPace(1_000, settings), 0);
});
