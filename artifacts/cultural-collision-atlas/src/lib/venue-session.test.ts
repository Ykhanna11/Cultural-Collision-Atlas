import assert from "node:assert/strict";
import { test } from "node:test";
import { clearSelectedVenueSession, clearVenueDraftSession } from "./venue-session.ts";

test("clears venue context without clearing unrelated session keys", () => {
  const removed: string[] = [];
  clearSelectedVenueSession({ removeItem: (key) => removed.push(key) });
  assert.deepEqual(removed, ["atlas:selected-venue", "atlas:selected-venues", "atlas:selected-venue-suitability", "atlas:selected-venue-suitabilities"]);
});

test("clears working draft separately", () => {
  const removed: string[] = [];
  clearVenueDraftSession({ removeItem: (key) => removed.push(key) });
  assert.deepEqual(removed, ["atlas:draft-plan"]);
});
