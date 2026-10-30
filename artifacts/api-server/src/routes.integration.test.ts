import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const databaseUrl = "postgres://synthetic_test_user:synthetic_test_password@127.0.0.1:1/staging_test";
const isolatedDatabaseUrl = process.env.P1_ISOLATED_DATABASE_URL;
let apiProcess: ChildProcess;
let baseUrl: string;
let appUrl: string;

async function getUnusedPort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

before(async () => {
  const port = await getUnusedPort();
  apiProcess = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      PORT: String(port),
      ...(process.env.OVERTURE_DATA_DIR && { OVERTURE_DATA_DIR: process.env.OVERTURE_DATA_DIR }),
    },
    stdio: "ignore",
  });
  baseUrl = `http://127.0.0.1:${port}/api`;
  appUrl = baseUrl.slice(0, -"/api".length);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (apiProcess.exitCode !== null || apiProcess.signalCode !== null) {
      throw new Error("API subprocess exited before becoming ready.");
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("API subprocess did not become ready.");
});

after(async () => {
  if (
    apiProcess &&
    apiProcess.exitCode === null &&
    apiProcess.signalCode === null
  ) {
    apiProcess.kill("SIGTERM");
    await once(apiProcess, "exit");
  }
});

test("the API starts without OAuth configuration and serves public feature routes", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);

  const qlooStatus = await fetch(`${baseUrl}/qloo/status`);
  assert.equal(qlooStatus.status, 200);
  assert.equal(qlooStatus.headers.has("set-cookie"), false);

  const publicRequests: Array<{
    method: string;
    path: string;
    body: unknown;
    expectedStatus: number;
  }> = [
    { method: "POST", path: "/qloo/test", body: { query: "test" }, expectedStatus: 200 },
    { method: "POST", path: "/discoveries", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/discoveries/saved", body: {}, expectedStatus: 400 },
    { method: "DELETE", path: "/discoveries/saved/not-an-id", body: null, expectedStatus: 400 },
    { method: "POST", path: "/activation-plans", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/activation-plans/agent", body: {}, expectedStatus: 400 },
    { method: "DELETE", path: "/activation-plans/not-an-id", body: null, expectedStatus: 400 },
    { method: "POST", path: "/qloo/entities/search", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/opportunities/heatmap", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/opportunities/intelligence/analyze", body: {}, expectedStatus: 400 },
  ];

  for (const { method, path, body, expectedStatus } of publicRequests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, expectedStatus, `${method} ${path}`);
    assert.equal(response.status === 401 || response.status === 403, false);
  }

  const removedAuthEndpoint = await fetch(`${baseUrl}/auth/session`);
  assert.equal(removedAuthEndpoint.status, 404);
});

test("bounded geographic analysis reports unavailable sources without fabricated records", async () => {
  const invalid = await fetch(`${baseUrl}/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: "qloo-entity-id",
      bounds: { south: 51.6, west: -0.2, north: 51.5, east: -0.05 },
    }),
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseUrl}/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: "qloo-entity-id",
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    summary: {
      heatmap: { status: string; pointCount: number; points: unknown[] };
      venues: { status: string; recordCount: number; records: unknown[] };
      coverage: string;
      sourceSeparation: string;
    };
  };
  assert.equal(body.summary.heatmap.status, "unavailable");
  assert.equal(body.summary.heatmap.pointCount, 0);
  assert.deepEqual(body.summary.heatmap.points, []);
  assert.equal(body.summary.venues.status, "unavailable");
  assert.equal(body.summary.venues.recordCount, 0);
  assert.deepEqual(body.summary.venues.records, []);
  assert.equal(body.summary.coverage, "unavailable");
  assert.match(body.summary.sourceSeparation, /never treated as the same entity/);

  const unlinkedVenue = await fetch(`${baseUrl}/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: "qloo-entity-id",
      selectedVenueId: "overture-venue-1",
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
    }),
  });
  assert.equal(unlinkedVenue.status, 400);

  const staleReference = await fetch(`${baseUrl}/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: "qloo-entity-id",
      analysisReference: "00000000-0000-4000-8000-000000000001",
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
    }),
  });
  assert.equal(staleReference.status, 410);
});

test("production serves frontend assets and falls back only for frontend routes", async () => {
  const indexResponse = await fetch(appUrl, {
    headers: { accept: "text/html" },
  });
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();
  const scriptPath = indexHtml.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(scriptPath);

  const scriptResponse = await fetch(new URL(scriptPath, appUrl));
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type") ?? "", /javascript/);
  const bundle = await scriptResponse.text();
  assert.doesNotMatch(bundle, /Continue with Google|\/api\/auth\/login|Checking sign-in/);

  const spaResponse = await fetch(`${appUrl}/saved-discoveries`, {
    headers: { accept: "text/html" },
  });
  assert.equal(spaResponse.status, 200);
  assert.equal(await spaResponse.text(), indexHtml);

  const unknownApiResponse = await fetch(`${baseUrl}/unknown-route`, {
    headers: { accept: "text/html" },
  });
  assert.equal(unknownApiResponse.status, 404);
  assert.match(
    unknownApiResponse.headers.get("content-type") ?? "",
    /application\/json/,
  );
  assert.doesNotMatch(await unknownApiResponse.text(), /<html/i);

  const missingAssetResponse = await fetch(`${appUrl}/assets/not-found.js`);
  assert.equal(missingAssetResponse.status, 404);
});

test("venue API validates geographic searches and reports missing Overture data", { skip: Boolean(process.env.OVERTURE_DATA_DIR) }, async () => {
  const statusResponse = await fetch(`${baseUrl}/opportunities/venues/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json() as { configured: boolean; state: string };
  assert.equal(status.configured, false);
  assert.equal(status.state, "unavailable");

  const missingDataResponse = await fetch(`${baseUrl}/opportunities/venues/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bbox: { west: -0.2, south: 51.45, east: -0.05, north: 51.55 }, categories: [], limit: 5 }),
  });
  assert.equal(missingDataResponse.status, 503);
  const missingData = await missingDataResponse.json() as { error: string; setupInstructions: string };
  assert.match(missingData.error, /Overture/i);
  assert.match(missingData.setupInstructions, /OVERTURE_DATA_DIR/);
  assert.doesNotMatch(JSON.stringify(missingData), /\/workspaces\//);

  const invalidSearches = [
    { bbox: { west: -0.2, south: 91, east: -0.05, north: 92 }, categories: [] },
    { radius: { latitude: 51.5, longitude: -0.1, kilometers: 0.01 }, categories: [] },
    { bbox: { west: 1, south: 51.5, east: -1, north: 51.6 }, categories: [] },
    { bbox: { west: -2, south: 50, east: 2, north: 53 }, categories: [] },
  ];
  for (const body of invalidSearches) {
    const response = await fetch(`${baseUrl}/opportunities/venues/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});

test("venue API returns and filters real London Overture records", { skip: !process.env.OVERTURE_DATA_DIR }, async () => {
  const bbox = { west: -0.2, south: 51.45, east: -0.05, north: 51.55 };
  const search = async (data: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}/opportunities/venues/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bbox, categories: [], limit: 25, ...data }),
    });
    return { response, body: await response.json() as { source: string; venues: Array<Record<string, unknown>> } };
  };

  const matching = await search({ query: "Wagamama", categories: ["restaurant"], limit: 1 });
  assert.equal(matching.response.status, 200);
  assert.equal(matching.body.source, "overture");
  assert.equal(matching.body.venues.length, 1);
  assert.match(String(matching.body.venues[0].name), /Wagamama/i);
  assert.equal(matching.body.venues[0].provider, "overture");
  assert.ok(matching.body.venues[0].sourceMetadata);

  const verifiedStatus = await fetch(`${baseUrl}/opportunities/venues/status`);
  assert.equal(verifiedStatus.status, 200);
  const verifiedStatusBody = await verifiedStatus.json() as { configured: boolean; state: string };
  assert.equal(verifiedStatusBody.configured, true);
  assert.equal(verifiedStatusBody.state, "reachable");

  const radiusResponse = await fetch(`${baseUrl}/opportunities/venues/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      radius: {
        latitude: Number(matching.body.venues[0].latitude),
        longitude: Number(matching.body.venues[0].longitude),
        kilometers: 0.1,
      },
      categories: ["restaurant"],
      query: "Wagamama",
      limit: 5,
    }),
  });
  assert.equal(radiusResponse.status, 200);
  const radiusBody = await radiusResponse.json() as { venues: Array<Record<string, unknown>> };
  assert.ok(radiusBody.venues.some((venue) => venue.providerVenueId === matching.body.venues[0].providerVenueId));

  const keyword = await search({ query: "Wagamama" });
  assert.ok(keyword.body.venues.length > 0);
  const wrongCategory = await search({ query: "Wagamama", categories: ["museum"] });
  assert.deepEqual(wrongCategory.body.venues, []);
  const empty = await search({ query: "no-real-venue-matches-this" });
  assert.equal(empty.response.status, 200);
  assert.deepEqual(empty.body.venues, []);

  const limited = await search({ limit: 1 });
  assert.ok(limited.body.venues.length <= 1);
  const bounded = await search({ limit: 50 });
  assert.ok(bounded.body.venues.length <= 50);
  assert.equal(new Set(bounded.body.venues.map((venue) => venue.providerVenueId)).size, bounded.body.venues.length);
  for (const venue of bounded.body.venues) {
    assert.ok(Number(venue.latitude) >= bbox.south && Number(venue.latitude) <= bbox.north);
    assert.ok(Number(venue.longitude) >= bbox.west && Number(venue.longitude) <= bbox.east);
  }
});

test("isolated PostgreSQL saves, lists, and retrieves venue plan context", {
  skip: !isIsolatedPhase1Database(isolatedDatabaseUrl),
}, async (context) => {
  const testDatabaseUrl = isolatedDatabaseUrl!;
  const port = await getUnusedPort();
  const child = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: "ignore",
  });
  const isolatedBaseUrl = `http://127.0.0.1:${port}/api`;
  let savedId: number | undefined;

  context.after(async () => {
    if (savedId !== undefined) {
      await fetch(`${isolatedBaseUrl}/activation-plans/${savedId}`, { method: "DELETE" }).catch(() => undefined);
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Isolated test API exited before becoming ready.");
    }
    try {
      const response = await fetch(`${isolatedBaseUrl}/healthz`);
      if (response.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (attempt === 49) throw new Error("Isolated test API did not become ready.");
  }

  const title = `P1-12 integration ${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const venues = [
    {
      provider: "overture",
      providerVenueId: "overture-p1-test-one",
      name: "Fixture Venue One",
      latitude: 51.512411,
      longitude: -0.135531,
      categories: ["restaurant"],
      attribution: "Overture Maps Foundation, overturemaps.org, test release.",
      sourceMetadata: {
        basicCategory: "restaurant",
        taxonomy: ["restaurant"],
        sources: [{ dataset: "Microsoft", license: "CDLA-Permissive-2.0", recordId: "fixture-one" }],
      },
    },
    {
      provider: "overture",
      providerVenueId: "overture-p1-test-two",
      name: "Fixture Venue Two",
      latitude: 51.49794342,
      longitude: -0.14158681,
      categories: ["restaurant"],
      attribution: "Overture Maps Foundation, overturemaps.org, test release.",
      sourceMetadata: {
        basicCategory: "restaurant",
        taxonomy: ["restaurant"],
        sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "fixture-two" }],
      },
    },
  ];
  const planBody = {
    title,
    city: "London",
    interestA: "Jazz",
    interestB: "Streetwear",
    bridgeName: "Isolated persistence test bridge",
    objective: "Verify saved venue context can be retrieved.",
    plan: {
      sections: [{ title: "Venue options", content: "Two selected test venues." }],
      source: "qloo_api",
      caveat: "Test-only cultural evidence context.",
      evidence: [],
      assumptions: [],
      planningEstimates: { budgetRange: "test-only", status: "test fixture" },
      selectedVenue: venues[0],
      selectedVenues: venues,
    },
  };

  const savedResponse = await fetch(`${isolatedBaseUrl}/activation-plans`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(planBody),
  });
  assert.equal(savedResponse.status, 201);
  const saved = await savedResponse.json() as { id: number; title: string; createdAt: string };
  savedId = saved.id;
  assert.equal(saved.title, title);
  assert.ok(saved.id > 0);

  const listResponse = await fetch(`${isolatedBaseUrl}/activation-plans`);
  assert.equal(listResponse.status, 200);
  const plans = await listResponse.json() as Array<Record<string, unknown>>;
  const reopened = plans.find((plan) => plan.id === saved.id);
  assert.ok(reopened);
  assert.equal(reopened.title, title);
  assert.equal(reopened.city, "London");
  assert.equal(reopened.interestA, "Jazz");
  assert.equal(reopened.interestB, "Streetwear");
  const reopenedContent = reopened.plan as { selectedVenues: Array<Record<string, unknown>> };
  assert.deepEqual(reopenedContent.selectedVenues.map((venue) => venue.providerVenueId), [
    "overture-p1-test-one",
    "overture-p1-test-two",
  ]);
  assert.equal(reopenedContent.selectedVenues[0].latitude, 51.512411);
  assert.equal(reopenedContent.selectedVenues[0].longitude, -0.135531);
  assert.equal(reopenedContent.selectedVenues[0].attribution, venues[0].attribution);
  assert.equal((reopenedContent.selectedVenues[0].sourceMetadata as { sources: Array<{ recordId: string }> }).sources[0].recordId, "fixture-one");
});

function isIsolatedPhase1Database(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.pathname.replace(/^\//, "") === "cca_phase1_test";
  } catch {
    return false;
  }
}
