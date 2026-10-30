import assert from "node:assert/strict";
import { test } from "node:test";
import { SearchQlooEntitiesResponse } from "@workspace/api-zod";

process.env.QLOO_BASE_URL = "https://hackathon.api.qloo.com";
process.env.QLOO_API_KEY = "mock-only-credential";

const [{ QlooApiError, getQlooStatus }, { parseQlooEntityResults, searchQlooEntities }] =
  await Promise.all([import("./client.ts"), import("./entities.ts")]);

const nikeId = "a0c4e68e-031c-4c54-8f5a-51a48fcf6651";
const cityId = "b1d5f79f-142d-4d65-9a6b-62b59ad07762";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("parses the documented Qloo Search results array and preserves returned metadata", () => {
  const entities = parseQlooEntityResults({
    success: true,
    results: [{
      entity_id: nikeId,
      name: "Nike",
      type: "urn:entity:brand",
      subtype: "sportswear",
      properties: {
        short_description: "Athletic apparel and footwear brand",
        place: "city",
        admin_level: 5,
        ancestors: [{ name: "Oregon" }],
      },
    }],
  });

  assert.deepEqual(entities, [{
    id: nikeId,
    name: "Nike",
    type: "urn:entity:brand",
    subtype: "sportswear",
    description: "Athletic apparel and footwear brand",
    placeType: "city",
    administrativeLevel: 5,
    ancestorNames: ["Oregon"],
    source: "qloo_api",
  }]);
  assert.equal(SearchQlooEntitiesResponse.safeParse({
    source: "qloo_api",
    entities,
  }).success, true);
});

test("accepts valid results when optional metadata is missing", () => {
  assert.deepEqual(parseQlooEntityResults({
    results: [{ entity_id: nikeId, name: "Nike" }],
  }), [{
    id: nikeId,
    name: "Nike",
    type: null,
    subtype: null,
    description: null,
    placeType: null,
    administrativeLevel: null,
    ancestorNames: [],
    source: "qloo_api",
  }]);
});

test("returns an empty list only for the documented empty results array", () => {
  assert.deepEqual(parseQlooEntityResults({ success: true, results: [] }), []);
});

test("rejects unexpected response shapes instead of reporting empty results", () => {
  assert.throws(
    () => parseQlooEntityResults({ success: true, results: { entities: [] } }),
    /unrecognized response shape/,
  );
  assert.throws(
    () => parseQlooEntityResults({ success: true }),
    /unrecognized response shape/,
  );
  assert.throws(
    () => parseQlooEntityResults({ success: false, results: [] }),
    /reported an unsuccessful response/,
  );
});

test("rejects result rows with missing or invalid IDs and names", () => {
  for (const entity of [
    { name: "Nike" },
    { entity_id: "not-a-qloo-id", name: "Nike" },
    { entity_id: nikeId, name: "   " },
    null,
  ]) {
    assert.throws(
      () => parseQlooEntityResults({ results: [entity] }),
      /invalid entity_id|invalid name|was not an object/,
    );
  }
});

test("serializes category-filtered entity searches using the documented types format", async (context) => {
  let requestUrl: URL | undefined;
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    requestUrl = new URL(String(input));
    return jsonResponse({ results: [{ entity_id: nikeId, name: "Nike" }] });
  });

  const entities = await searchQlooEntities("Nike", ["urn:entity:brand"]);
  assert.equal(requestUrl?.pathname, "/search");
  assert.equal(requestUrl?.searchParams.get("query"), "Nike");
  assert.equal(requestUrl?.searchParams.get("take"), "8");
  assert.equal(requestUrl?.searchParams.get("types"), "urn:entity:brand");
  assert.equal(entities[0]?.id, nikeId);
});

test("supports Qloo locality category searches and preserves city entity IDs", async (context) => {
  let requestUrl: URL | undefined;
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    requestUrl = new URL(String(input));
    return jsonResponse({
      results: [{
        entity_id: cityId,
        name: "New York",
        type: "urn:entity:locality",
        properties: { place: "city", admin_level: 5 },
      }],
    });
  });

  const entities = await searchQlooEntities("New York", ["urn:entity:locality"]);
  assert.equal(requestUrl?.searchParams.get("types"), "urn:entity:locality");
  assert.equal(entities[0]?.id, cityId);
  assert.equal(entities[0]?.placeType, "city");
});

test("maps Qloo's documented no-results 404 to a genuine empty search", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ code: 404, reason: "Not Found", message: "No results" }, 404),
  );

  assert.deepEqual(await searchQlooEntities("No catalog match"), []);
  assert.equal(getQlooStatus().state, "verified");
});

test("preserves authentication, rate-limit, and provider failures", async (context) => {
  let status = 401;
  context.mock.method(globalThis, "fetch", async () => new Response(null, { status }));

  for (const expected of [401, 403, 429, 500, 503]) {
    status = expected;
    await assert.rejects(
      searchQlooEntities("Naruto"),
      (error: unknown) => error instanceof QlooApiError && error.status === expected,
    );
  }
});

test("preserves network failures as provider errors", async (context) => {
  context.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("network unavailable");
  });

  await assert.rejects(
    searchQlooEntities("The Beatles"),
    (error: unknown) => error instanceof QlooApiError && error.status === 502,
  );
});