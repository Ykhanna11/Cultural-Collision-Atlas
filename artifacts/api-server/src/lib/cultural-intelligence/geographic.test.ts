import assert from "node:assert/strict";
import { test } from "node:test";
import {
  summarizeGeographicIntelligence,
  type GeographicIntelligenceInput,
} from "./geographic";
import type { Venue } from "../venue-source";

const bounds = { south: 10, west: 20, north: 12, east: 22 };

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    provider: "overture",
    providerVenueId: "overture-1",
    name: "Actual Venue",
    latitude: 11,
    longitude: 21,
    categories: ["culture"],
    attribution: "Overture Maps Foundation",
    retrievedAt: "2026-10-30T12:00:00.000Z",
    ...overrides,
  };
}

function input(overrides: Partial<GeographicIntelligenceInput> = {}): GeographicIntelligenceInput {
  return {
    bounds,
    heatmapStatus: "returned",
    heatmapPoints: [{ latitude: 11, longitude: 21, affinity: 0.6 }],
    venueStatus: "returned",
    venues: [venue()],
    overtureCoverage: { south: 9, west: 19, north: 13, east: 23 },
    ...overrides,
  };
}

test("keeps returned Qloo points and venue identities separate in the same bounded area", () => {
  const summary = summarizeGeographicIntelligence(input());
  assert.equal(summary.heatmap.pointCount, 1);
  assert.equal(summary.heatmap.points[0]?.affinity, 0.6);
  assert.equal(summary.venues.records[0]?.providerVenueId, "overture-1");
  assert.notEqual(summary.heatmap.points[0], summary.venues.records[0]);
  assert.match(summary.sourceSeparation, /never treated as the same entity/);
  assert.deepEqual(summary.observedBounds, { south: 11, west: 21, north: 11, east: 21 });
});

test("includes points and venues on inclusive bounding-box boundaries", () => {
  const summary = summarizeGeographicIntelligence(input({
    heatmapPoints: [
      { latitude: bounds.south, longitude: bounds.west },
      { latitude: bounds.north, longitude: bounds.east },
      { latitude: 12.01, longitude: 21 },
    ],
    venues: [venue({ latitude: bounds.north, longitude: bounds.east })],
  }));
  assert.equal(summary.heatmap.pointCount, 2);
  assert.equal(summary.venues.recordCount, 1);
});

test("deduplicates exact heatmap rows and venue provider IDs without merging their sources", () => {
  const point = { latitude: 11, longitude: 21, affinity: 0.6 };
  const sameVenue = venue();
  const summary = summarizeGeographicIntelligence(input({
    heatmapPoints: [point, { ...point }, { ...point, affinity: 0.7 }],
    venues: [sameVenue, { ...sameVenue }],
  }));
  assert.equal(summary.heatmap.pointCount, 2);
  assert.equal(summary.heatmap.duplicateCount, 1);
  assert.equal(summary.venues.recordCount, 1);
  assert.equal(summary.venues.duplicateCount, 1);
});

test("rejects missing and invalid coordinates while preserving valid records", () => {
  const summary = summarizeGeographicIntelligence(input({
    heatmapPoints: [
      { latitude: 11, longitude: 21 },
      { latitude: Number.NaN, longitude: 20 },
    ],
    venues: [
      venue(),
      venue({ providerVenueId: "invalid", latitude: 91 }),
      venue({ providerVenueId: "missing", longitude: Number.NaN }),
    ],
  }));
  assert.equal(summary.heatmap.pointCount, 1);
  assert.equal(summary.heatmap.invalidCoordinateCount, 1);
  assert.equal(summary.venues.recordCount, 1);
  assert.equal(summary.venues.invalidCoordinateCount, 2);
});

test("summarizes venue categories and data-source availability", () => {
  const summary = summarizeGeographicIntelligence(input({
    venues: [
      venue({ providerVenueId: "one", categories: ["culture", "museum"] }),
      venue({ providerVenueId: "two", categories: ["culture"] }),
    ],
  }));
  assert.deepEqual(summary.venues.categoryCounts, [
    { category: "culture", count: 2 },
    { category: "museum", count: 1 },
  ]);
  assert.equal(summary.overtureCoverage.status, "covered");
  assert.equal(summary.coverage, "complete");
});

test("marks partially covered and outside Overture areas honestly", () => {
  const partial = summarizeGeographicIntelligence(input({
    overtureCoverage: { south: 11, west: 21, north: 13, east: 23 },
  }));
  const outside = summarizeGeographicIntelligence(input({
    overtureCoverage: { south: 30, west: 40, north: 32, east: 42 },
  }));
  assert.equal(partial.overtureCoverage.status, "partial");
  assert.equal(partial.coverage, "partial");
  assert.equal(outside.overtureCoverage.status, "outside");
  assert.equal(outside.coverage, "partial");
});

test("represents empty and unavailable sources without inventing evidence", () => {
  const empty = summarizeGeographicIntelligence(input({
    heatmapStatus: "empty",
    heatmapPoints: [],
    venueStatus: "empty",
    venues: [],
  }));
  const unavailable = summarizeGeographicIntelligence(input({
    heatmapStatus: "unavailable",
    heatmapPoints: [],
    venueStatus: "unavailable",
    venues: [],
  }));
  assert.equal(empty.heatmap.pointCount, 0);
  assert.equal(empty.venues.recordCount, 0);
  assert.equal(empty.observedBounds, null);
  assert.equal(unavailable.coverage, "unavailable");
});

test("rejects invalid analysis bounds", () => {
  assert.throws(
    () => summarizeGeographicIntelligence(input({
      bounds: { south: 12, west: 20, north: 10, east: 22 },
    })),
    /valid, ordered bounds/,
  );
});