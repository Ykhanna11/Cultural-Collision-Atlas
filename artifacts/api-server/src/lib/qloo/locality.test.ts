import assert from "node:assert/strict";
import test from "node:test";
import {
  parseQlooEntityResults,
  responseContainsCityLocality,
} from "./entities";
import {
  localityStatusForCandidate,
  rankBridgeCandidates,
} from "../bridge-ranking";

const newYorkCityId = "81E61924-6CEE-4AB4-93D3-282A5C784AB8";
const newYorkStateId = "BDFC9271-4583-412E-84D8-F285BB8220FE";
const miamiBeachCityId = "32F51EAE-C064-4296-B699-A3B27B7F84EB";

test("locality search retains same-name city and state results with context", () => {
  const entities = parseQlooEntityResults({
    results: [
      {
        entity_id: newYorkStateId,
        name: "New York",
        properties: { place: "state", admin_level: 4 },
      },
      {
        entity_id: newYorkCityId,
        name: "New York",
        properties: {
          place: "city",
          admin_level: 5,
          ancestors: [{ name: "New York", place: "state" }],
        },
      },
    ],
  });

  assert.equal(entities.length, 2);
  assert.deepEqual(
    entities.map(({ name, placeType, administrativeLevel }) => ({
      name,
      placeType,
      administrativeLevel,
    })),
    [
      { name: "New York", placeType: "state", administrativeLevel: 4 },
      { name: "New York", placeType: "city", administrativeLevel: 5 },
    ],
  );
  assert.deepEqual(entities[1]?.ancestorNames, ["New York"]);
});

test("locality search keeps ambiguous same-name choices instead of resolving one", () => {
  const entities = parseQlooEntityResults({
    results: [
      {
        entity_id: "86BAEBAE-2980-43B6-9E75-2A5CDB898628",
        name: "Brooklyn",
        properties: { place: "suburb", ancestors: [{ name: "New York" }] },
      },
      {
        entity_id: "E8DC52F4-985C-4B02-8518-0385E567C57C",
        name: "Brooklyn",
        properties: { place: "county" },
      },
    ],
  });

  assert.equal(entities.length, 2);
  assert.notEqual(entities[0]?.id, entities[1]?.id);
});

test("selected locality validation accepts only the exact Qloo city entity", () => {
  const response = {
    results: [
      {
        entity_id: newYorkStateId,
        properties: { place: "state" },
      },
      {
        entity_id: newYorkCityId,
        properties: { place: "city" },
      },
    ],
  };

  assert.equal(responseContainsCityLocality(response, newYorkCityId), true);
  assert.equal(responseContainsCityLocality(response, newYorkStateId), false);
  assert.equal(
    responseContainsCityLocality(response, "00000000-0000-0000-0000-000000000000"),
    false,
  );
});

test("Place locality status compares exact valid city IDs only", () => {
  assert.equal(
    localityStatusForCandidate("urn:entity:place", newYorkCityId, newYorkCityId),
    "matches_selected_city",
  );
  assert.equal(
    localityStatusForCandidate("urn:entity:place", miamiBeachCityId, newYorkCityId),
    "outside_selected_city",
  );
});

test("Place ranking preserves the returned city entity ID and classification", () => {
  const candidates = rankBridgeCandidates({
    interestA: "Input A",
    interestAId: "input-a",
    interestB: "Input B",
    interestBId: "input-b",
    recommendationType: "urn:entity:place",
    selectedCityEntityId: newYorkCityId,
    resultsA: { results: { entities: [] } },
    resultsB: { results: { entities: [] } },
    jointResults: {
      results: {
        entities: [{
          entity_id: "candidate",
          name: "Candidate place",
          properties: {
            locality: { city: { entity_id: newYorkCityId } },
          },
          query: { affinity: 0.8 },
        }],
      },
    },
  });

  assert.equal(candidates[0]?.localityCityEntityId, newYorkCityId);
  assert.equal(candidates[0]?.localityStatus, "matches_selected_city");
});

test("Place ranking prioritizes exact-city candidates and retains fallback results", () => {
  const candidates = rankBridgeCandidates({
    interestA: "Input A",
    interestAId: "input-a",
    interestB: "Input B",
    interestBId: "input-b",
    recommendationType: "urn:entity:place",
    selectedCityEntityId: newYorkCityId,
    resultsA: { results: { entities: [] } },
    resultsB: { results: { entities: [] } },
    jointResults: {
      results: {
        entities: [
          {
            entity_id: "outside-city",
            name: "Outside city",
            properties: {
              locality: { city: { entity_id: miamiBeachCityId } },
            },
            query: {
              affinity: 0.99,
              explainability: {
                "signal.interests.entities": [
                  { entity_id: "input-a", score: 0.8 },
                  { entity_id: "input-b", score: 0.7 },
                ],
              },
            },
          },
          {
            entity_id: "missing-city",
            name: "Missing city",
            properties: { locality: { city: {} } },
            query: { affinity: 0.85 },
          },
          {
            entity_id: "exact-city",
            name: "Exact city",
            properties: {
              locality: { city: { entity_id: newYorkCityId } },
            },
            query: { affinity: 0.2 },
          },
        ],
      },
    },
  });

  assert.deepEqual(
    candidates.map(({ id, localityStatus }) => ({ id, localityStatus })),
    [
      { id: "exact-city", localityStatus: "matches_selected_city" },
      { id: "outside-city", localityStatus: "outside_selected_city" },
      { id: "missing-city", localityStatus: "unavailable" },
    ],
  );
  assert.equal(candidates.length, 3);
});

test("Brand and Destination ranking order remains independent of locality", () => {
  const jointResults = {
    results: {
      entities: [
        {
          entity_id: "high-attribution",
          name: "High attribution",
          properties: {
            locality: { city: { entity_id: miamiBeachCityId } },
          },
          query: {
            affinity: 0.2,
            explainability: {
              "signal.interests.entities": [
                { entity_id: "input-a", score: 0.8 },
                { entity_id: "input-b", score: 0.7 },
              ],
            },
          },
        },
        {
          entity_id: "lower-attribution",
          name: "Lower attribution",
          properties: {
            locality: { city: { entity_id: newYorkCityId } },
          },
          query: { affinity: 0.99 },
        },
      ],
    },
  };
  for (const recommendationType of [
    "urn:entity:brand",
    "urn:entity:destination",
  ] as const) {
    const candidates = rankBridgeCandidates({
      interestA: "Input A",
      interestAId: "input-a",
      interestB: "Input B",
      interestBId: "input-b",
      recommendationType,
      selectedCityEntityId: newYorkCityId,
      resultsA: { results: { entities: [] } },
      resultsB: { results: { entities: [] } },
      jointResults,
    });

    assert.deepEqual(
      candidates.map(({ id }) => id),
      ["high-attribution", "lower-attribution"],
    );
    assert.ok(
      candidates.every(({ localityStatus }) => localityStatus === undefined),
    );
  }
});

test("missing or malformed locality IDs produce unavailable status", () => {
  assert.equal(
    localityStatusForCandidate("urn:entity:place", null, newYorkCityId),
    "unavailable",
  );
  assert.equal(
    localityStatusForCandidate("urn:entity:place", "not-a-qloo-id", newYorkCityId),
    "unavailable",
  );
  assert.equal(
    localityStatusForCandidate("urn:entity:place", newYorkCityId, "not-a-qloo-id"),
    "unavailable",
  );
});

test("Destination and Brand candidates do not receive city match labels", () => {
  assert.equal(
    localityStatusForCandidate("urn:entity:destination", newYorkCityId, newYorkCityId),
    undefined,
  );
  assert.equal(
    localityStatusForCandidate("urn:entity:brand", newYorkStateId, newYorkCityId),
    undefined,
  );
});
