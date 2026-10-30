import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOverpassQuery,
  fetchOverpassQuery,
  normalizeVenueCategory,
  parseOverpassVenueElements,
  radiusToBoundingBox,
  pruneExpiredCache,
  OverpassRequestError,
} from "./openstreetmap";

const originalFetch = globalThis.fetch;

test("builds the museum selector query for a bounded search", () => {
  const query = buildOverpassQuery({
    bbox: { south: 51.45, west: -0.20, north: 51.55, east: -0.05 },
    categories: ["museum"],
    limit: 10,
  });
  assert.equal(
    query,
    '[out:json][timeout:12];(nwr["tourism"="museum"](51.45,-0.2,51.55,-0.05););out center tags 10;',
  );
});

test("maps every frontend category to focused Overpass selectors", () => {
  const bbox = { south: 51.4, west: -0.2, north: 51.6, east: 0.1 };
  const queries: Record<string, string> = {
    restaurant: '[out:json][timeout:12];(nwr["amenity"="restaurant"](51.4,-0.2,51.6,0.1);nwr["cuisine"](51.4,-0.2,51.6,0.1););out center tags 25;',
    cafe: '[out:json][timeout:12];(nwr["amenity"="cafe"](51.4,-0.2,51.6,0.1););out center tags 25;',
    shopping: '[out:json][timeout:12];(nwr["shop"](51.4,-0.2,51.6,0.1);nwr["amenity"="marketplace"](51.4,-0.2,51.6,0.1););out center tags 25;',
    entertainment: '[out:json][timeout:12];(nwr["amenity"="cinema"](51.4,-0.2,51.6,0.1);nwr["amenity"="bar"](51.4,-0.2,51.6,0.1);nwr["amenity"="pub"](51.4,-0.2,51.6,0.1););out center tags 25;',
    sports: '[out:json][timeout:12];(nwr["leisure"](51.4,-0.2,51.6,0.1);nwr["sport"](51.4,-0.2,51.6,0.1););out center tags 25;',
    culture: '[out:json][timeout:12];(nwr["amenity"="arts_centre"](51.4,-0.2,51.6,0.1);nwr["amenity"="theatre"](51.4,-0.2,51.6,0.1););out center tags 25;',
    museum: '[out:json][timeout:12];(nwr["tourism"="museum"](51.4,-0.2,51.6,0.1););out center tags 25;',
    event_space: '[out:json][timeout:12];(nwr["amenity"="community_centre"](51.4,-0.2,51.6,0.1);nwr["amenity"="conference_centre"](51.4,-0.2,51.6,0.1);nwr["amenity"="events_venue"](51.4,-0.2,51.6,0.1););out center tags 25;',
  };
  for (const [category, expected] of Object.entries(queries)) {
    assert.equal(buildOverpassQuery({ bbox, categories: [category as never], limit: 25 }), expected, category);
  }
});

test("caps server-side result count at the provider maximum", () => {
  const query = buildOverpassQuery({
    bbox: { south: 51.4, west: -0.2, north: 51.6, east: 0.1 },
    categories: ["museum"],
    limit: 1000,
  });
  assert.match(query, /out center tags 50;$/);
});

test("reports upstream HTTP errors with bounded diagnostics", async () => {
  globalThis.fetch = async () => new Response("<html>upstream unavailable</html>", { status: 503 });
  try {
    await assert.rejects(
      fetchOverpassQuery("[out:json];out;"),
      (error: unknown) => {
        assert.ok(error instanceof OverpassRequestError);
        if (!(error instanceof OverpassRequestError)) return false;
        assert.equal(error.diagnostic.status, 503);
        assert.equal(error.diagnostic.timedOut, false);
        assert.equal(error.diagnostic.responseBodyExcerpt, "<html>upstream unavailable</html>");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports fetch timeout cancellation", async () => {
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("This operation was aborted", "AbortError"));
    });
  });
  try {
    await assert.rejects(
      fetchOverpassQuery("[out:json];out;", 5),
      (error: unknown) => {
        assert.ok(error instanceof OverpassRequestError);
        if (!(error instanceof OverpassRequestError)) return false;
        assert.equal(error.diagnostic.timedOut, true);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes provider tags into venue categories", () => {
  assert.deepEqual(normalizeVenueCategory({ amenity: "restaurant" }), ["restaurant"]);
  assert.deepEqual(normalizeVenueCategory({ shop: "books" }), ["shopping"]);
  assert.deepEqual(normalizeVenueCategory({ tourism: "museum" }), ["culture", "museum"]);
});

test("parses named venues and does not invent missing contact facts", () => {
  const venues = parseOverpassVenueElements({
    elements: [
      { type: "node", id: 10, lat: 40.71, lon: -74.01, tags: { name: "Community Cafe", amenity: "cafe", website: "https://example.test" } },
      { type: "way", id: 11, center: { lat: 40.72, lon: -74.02 }, tags: { name: "Museum", tourism: "museum" } },
      { type: "node", id: 12, lat: 40, lon: -74, tags: {} },
    ],
  });
  assert.equal(venues.length, 2);
  assert.equal(venues[0].providerVenueId, "node-10");
  assert.equal(venues[0].website, "https://example.test");
  assert.equal(venues[0].phone, undefined);
  assert.equal(venues[1].providerVenueId, "way-11");
});

test("normalizes a successful museum-only Overpass response", () => {
  const venues = parseOverpassVenueElements({
    elements: [
      {
        type: "node",
        id: 114,
        lat: 51.5194,
        lon: -0.1269,
        tags: {
          name: "The British Museum",
          tourism: "museum",
          website: "https://www.britishmuseum.org/",
          "addr:housenumber": "Great Russell Street",
        },
      },
      {
        type: "way",
        id: 115,
        center: { lat: 51.4975, lon: -0.1764 },
        tags: { name: "Victoria and Albert Museum", tourism: "museum" },
      },
    ],
  });
  assert.equal(venues.length, 2);
  assert.deepEqual(venues.map((venue) => venue.categories), [["culture", "museum"], ["culture", "museum"]]);
  assert.equal(venues[0].providerVenueId, "node-114");
  assert.equal(venues[0].website, "https://www.britishmuseum.org/");
  assert.equal(venues[0].provider, "openstreetmap");
  assert.equal(venues[0].attribution, "© OpenStreetMap contributors, ODbL");
});

test("deduplicates repeated provider elements", () => {
  const venues = parseOverpassVenueElements({
    elements: [
      { type: "node", id: 10, lat: 40, lon: -74, tags: { name: "One", amenity: "cafe" } },
      { type: "node", id: 10, lat: 40, lon: -74, tags: { name: "Duplicate", amenity: "cafe" } },
    ],
  });
  assert.equal(venues.length, 1);
});

test("converts a validated radius to a bounded geographic search", () => {
  const bbox = radiusToBoundingBox({ latitude: 40, longitude: -74, kilometers: 5 });
  assert.ok(bbox.north > 40 && bbox.south < 40);
  assert.ok(bbox.east > -74 && bbox.west < -74);
});

test("cache pruning remains safe", () => {
  assert.doesNotThrow(() => pruneExpiredCache());
});
