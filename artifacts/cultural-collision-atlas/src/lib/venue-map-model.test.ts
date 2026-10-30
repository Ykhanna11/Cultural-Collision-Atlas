import assert from "node:assert/strict";
import test from "node:test";
import type { Venue } from "@workspace/api-client-react";
import {
  bindVenueMarkerSelection,
  venueMarkerModels,
  venuePopupDetails,
} from "./venue-map-model.ts";

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    provider: "overture",
    providerVenueId: "overture-real-venue-1",
    name: "Actual Community Venue",
    latitude: 51.5,
    longitude: -0.12,
    categories: ["culture", "event_space"],
    attribution: "Overture Maps Foundation; source licenses apply.",
    retrievedAt: new Date("2026-10-30T12:00:00.000Z"),
    ...overrides,
  };
}

test("renders one marker model per actual venue identity with selected state", () => {
  const venue = makeVenue();
  const models = venueMarkerModels(
    [
      venue,
      { ...venue },
      makeVenue({ providerVenueId: "overture-real-venue-2" }),
    ],
    undefined,
    [venue.providerVenueId],
  );

  assert.equal(models.length, 2);
  assert.deepEqual(models[0]?.coordinates, [-0.12, 51.5]);
  assert.equal(models[0]?.providerVenueId, "overture-real-venue-1");
  assert.equal(models[0]?.selected, true);
  assert.match(models[0]?.className ?? "", /venue-map-marker-selected/);
  assert.match(
    models[0]?.accessibleLabel ?? "",
    /selected for activation plan/,
  );
});

test("popup details contain only provider-supplied venue facts and attribution", () => {
  const venue = makeVenue({ address: "1 Example Road" });
  assert.deepEqual(venuePopupDetails(venue), {
    name: "Actual Community Venue",
    categories: "culture, event_space",
    address: "1 Example Road",
    coordinates: "51.50000, -0.12000",
    providerId: "overture-real-venue-1",
    attribution: "Overture Maps Foundation; source licenses apply.",
  });
  assert.equal(venuePopupDetails(makeVenue()).address, "Address not provided");
});

test("marker activation passes the original venue record to existing selection behavior", () => {
  const venue = makeVenue();
  const markerTarget = new EventTarget();
  let selected: Venue | undefined;
  bindVenueMarkerSelection(markerTarget, venue, (value) => {
    selected = value;
  });
  markerTarget.dispatchEvent(new Event("click"));
  assert.equal(selected, venue);
});
