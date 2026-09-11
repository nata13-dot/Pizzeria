import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_POLL_MS,
  FALLBACK_POLL_MS,
  REALTIME_BACKUP_POLL_MS,
  coalescedReloadDelay,
  operationalPollInterval,
} from "./refreshPolicy.ts";

test("polling adapts to realtime and application state", () => {
  assert.equal(operationalPollInterval(true, true), REALTIME_BACKUP_POLL_MS);
  assert.equal(operationalPollInterval(false, true), FALLBACK_POLL_MS);
  assert.equal(operationalPollInterval(true, false), BACKGROUND_POLL_MS);
});

test("events are coalesced and do not immediately repeat a recent load", () => {
  assert.equal(coalescedReloadDelay(10_000, 10_000), 800);
  assert.equal(coalescedReloadDelay(9_700, 10_000), 500);
  assert.equal(coalescedReloadDelay(9_000, 10_000), 400);
});
