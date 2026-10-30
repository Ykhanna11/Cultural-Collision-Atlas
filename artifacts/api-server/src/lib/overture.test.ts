import assert from "node:assert/strict";
import { test } from "node:test";
import {
  overtureAddress,
  overtureCategories,
  overtureTaxonomies,
  parseOvertureVenueRecord,
  overtureVenueProvider,
  OvertureDataUnavailableError,
} from "./overture";

test("parses a synthetic Overture point fixture", () => {
  const venue = parseOvertureVenueRecord({
    id: "fixture-place-1",
    name: { primary: "Synthetic Museum" },
    taxonomy: { primary: "museum", alternatives: ["art_gallery"] },
    addresses: [{ freeform: "1 Test Street", locality: "London", country: "GB" }],
    geometry: JSON.stringify({ type: "Point", coordinates: [-0.12, 51.5] }),
  }, "fixture-release");
  assert.ok(venue);
  assert.equal(venue.provider, "overture");
  assert.equal(venue.providerVenueId, "overture-fixture-place-1");
  assert.equal(venue.name, "Synthetic Museum");
  assert.equal(venue.latitude, 51.5);
  assert.equal(venue.longitude, -0.12);
  assert.equal(venue.address, "1 Test Street, London, GB");
  assert.deepEqual(venue.categories, ["museum", "culture"]);
  assert.match(venue.attribution, /fixture-release/);
});

test("rejects missing names, invalid geometry and coordinates", () => {
  assert.equal(parseOvertureVenueRecord({ id: "fixture-place-2", geometry: JSON.stringify({ type: "Point", coordinates: [-0.1, 51.5] }) }), undefined);
  assert.equal(parseOvertureVenueRecord({ id: "fixture-place-3", name: { primary: "Bad point" }, geometry: JSON.stringify({ type: "Point", coordinates: [-181, 51.5] }) }), undefined);
  assert.equal(parseOvertureVenueRecord({ id: "fixture-place-4", name: { primary: "Bad type" }, geometry: JSON.stringify({ type: "Polygon", coordinates: [] }) }), undefined);
});

test("maps Overture taxonomy into application categories", () => {
  assert.deepEqual(overtureTaxonomies({ primary: "museum", alternatives: ["art_gallery", "cafe"] }), ["museum", "art_gallery", "cafe"]);
  assert.deepEqual(overtureCategories(["museum", "art_gallery"]), ["museum", "culture"]);
  assert.deepEqual(overtureCategories(["italian_restaurant"]), ["restaurant"]);
  assert.deepEqual(overtureCategories(["coffee_shop"]), ["cafe"]);
});

test("handles missing addresses and malformed address data safely", () => {
  assert.equal(overtureAddress(undefined), undefined);
  assert.equal(overtureAddress({}), undefined);
  assert.equal(overtureAddress([{ freeform: "10 Example Road" }]), "10 Example Road");
});

test("normalizes published Overture Places fields without inventing unavailable facts", () => {
  const venue = parseOvertureVenueRecord({
    id: "fixture-place-5",
    name: "Fixture Bookshop",
    basic_category: "retail",
    taxonomy: { primary: "book_store", hierarchy: ["shopping", "book_store"], alternates: ["bookshop"] },
    addresses: [{ freeform: "10 Example Road", locality: "London", country: "GB" }],
    websites: ["https://example.test"],
    phones: ["+440000000000"],
    operating_status: "open",
    sources: [{ dataset: "fixture", license: "CDLA-Permissive-2.0", provider: "fixture", record_id: "source-1", version: "test" }],
    geometry: Buffer.from([1, 1, 0, 0, 0, 36, 151, 118, 197, 231, 169, 200, 191, 127, 245, 184, 111, 181, 185, 73, 64]),
  }, "fixture-release");
  assert.ok(venue);
  assert.equal(venue.name, "Fixture Bookshop");
  assert.equal(venue.website, "https://example.test");
  assert.equal(venue.phone, "+440000000000");
  assert.equal(venue.openingHours, undefined);
  assert.equal(venue.sourceMetadata?.basicCategory, "retail");
  assert.deepEqual(venue.sourceMetadata?.taxonomy, ["book_store", "shopping", "bookshop"]);
  assert.equal(venue.sourceMetadata?.sources?.[0]?.recordId, "source-1");
  assert.equal(venue.sourceMetadata?.operatingStatus, "open");
});

test("reports a missing local Overture dataset as unavailable", async () => {
  const original = process.env.OVERTURE_DATA_DIR;
  process.env.OVERTURE_DATA_DIR = "/tmp/cca-overture-missing-test";
  try {
    await assert.rejects(
      overtureVenueProvider.search({
        bbox: { west: -0.2, south: 51.45, east: -0.05, north: 51.55 },
        categories: [],
        limit: 5,
      }),
      OvertureDataUnavailableError,
    );
  } finally {
    if (original === undefined) delete process.env.OVERTURE_DATA_DIR;
    else process.env.OVERTURE_DATA_DIR = original;
  }
});

test("real Overture London GeoParquet integration", { skip: !process.env.OVERTURE_DATA_DIR }, async () => {
  const bbox = { west: -0.2, south: 51.45, east: -0.05, north: 51.55 };
  const venues = await overtureVenueProvider.search({ bbox, categories: ["restaurant"], query: "Wagamama", limit: 1 });
  assert.equal(venues.length, 1);
  assert.match(venues[0].name, /Wagamama/i);
  assert.equal(venues[0].provider, "overture");
  assert.ok(venues[0].latitude >= bbox.south && venues[0].latitude <= bbox.north);
  assert.ok(venues[0].longitude >= bbox.west && venues[0].longitude <= bbox.east);
  assert.ok(venues[0].website);
  assert.ok(venues[0].sourceMetadata?.sources?.length);

  const empty = await overtureVenueProvider.search({ bbox, categories: [], query: "no-real-venue-matches-this", limit: 5 });
  assert.deepEqual(empty, []);

  const page = await overtureVenueProvider.search({ bbox, categories: [], limit: 10 });
  assert.ok(page.length <= 10);
  assert.equal(new Set(page.map((venue) => venue.providerVenueId)).size, page.length);
});
