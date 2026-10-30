import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEMAP_ATTRIBUTION_HTML,
  BASEMAP_ATTRIBUTION_TEXT,
  OPENFREEMAP_STYLE_URL,
  shouldFallbackFromBasemapError,
} from "./map-config.ts";

test("uses the documented no-key OpenFreeMap dark vector style", () => {
  assert.equal(
    OPENFREEMAP_STYLE_URL,
    "https://tiles.openfreemap.org/styles/dark",
  );
  assert.doesNotMatch(OPENFREEMAP_STYLE_URL, /api.?key|token=/i);
});

test("keeps visible attribution links for OpenFreeMap, OpenMapTiles, and OSM contributors", () => {
  assert.match(BASEMAP_ATTRIBUTION_HTML, /https:\/\/openfreemap\.org/);
  assert.match(BASEMAP_ATTRIBUTION_HTML, /https:\/\/www\.openmaptiles\.org/);
  assert.match(
    BASEMAP_ATTRIBUTION_HTML,
    /https:\/\/www\.openstreetmap\.org\/copyright/,
  );
  assert.match(BASEMAP_ATTRIBUTION_TEXT, /OpenFreeMap/);
  assert.match(BASEMAP_ATTRIBUTION_TEXT, /OpenMapTiles/);
  assert.match(BASEMAP_ATTRIBUTION_TEXT, /OpenStreetMap contributors \(ODbL\)/);
});

test("fails closed for provider errors instead of leaving broken tiles visible", () => {
  assert.equal(shouldFallbackFromBasemapError(403), true);
  assert.equal(shouldFallbackFromBasemapError(404), true);
  assert.equal(shouldFallbackFromBasemapError(503), true);
  assert.equal(shouldFallbackFromBasemapError(undefined), true);
  assert.equal(shouldFallbackFromBasemapError(200), false);
});
