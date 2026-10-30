import assert from "node:assert/strict";
import { test } from "node:test";
import {
  overtureAddress,
  overtureCategories,
  overtureTaxonomies,
  parseOvertureVenueRecord,
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
  assert.deepEqual(venue.categories, ["museum"]);
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
