import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { createApp } from "./app";
import { cacheDiscoveryAnalysis } from "./lib/cultural-intelligence/analysis-cache";

const candidateId = "qloo-candidate-1";

const cachedDiscovery = {
  input: {
    interestA: "Interest A",
    interestAId: "interest-a-id",
    interestB: "Interest B",
    interestBId: "interest-b-id",
    city: "London",
    recommendationType: "urn:entity:brand" as const,
  },
  resultsA: { results: { entities: [] } },
  resultsB: { results: { entities: [] } },
  jointResults: {
    success: true,
    results: {
      entities: [{
        entity_id: candidateId,
        name: "Bridge candidate",
        query: {
          affinity: 0.72,
          explainability: {
            "signal.interests.entities": [
              { entity_id: "interest-a-id", score: 0.6 },
              { entity_id: "interest-b-id", score: 0.3 },
            ],
          },
        },
      }],
    },
  },
  tasteAnalysisA: {
    success: true,
    results: {
      tags: [{ tag_id: "tag-shared", name: "Shared", subtype: "urn:tag:genre:music" }],
    },
  },
  tasteAnalysisB: {
    success: true,
    results: {
      tags: [{ tag_id: "tag-shared", name: "Shared", subtype: "urn:tag:genre:music" }],
    },
  },
  candidates: [{
    id: candidateId,
    name: "Bridge candidate",
    explanation: "Aggregate recommendation evidence only.",
    score: 72,
    scoreDescription: "Provider affinity scaled for display only.",
    confidence: "high" as const,
    evidence: [],
  }],
  createdAt: "2026-10-30T12:00:00.000Z",
};

test("unified analysis endpoint reuses cached Discovery evidence and returns independently scored components", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.QLOO_API_KEY;
  const originalOvertureDirectory = process.env.OVERTURE_DATA_DIR;
  const originalOverpassUrl = process.env.OVERPASS_URL;
  let qlooRequests = 0;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  process.env.OVERTURE_DATA_DIR = "/nonexistent/overture-fixture-for-intelligence-test";
  delete process.env.OVERPASS_URL;
  globalThis.fetch = async () => {
    qlooRequests += 1;
    return new Response(JSON.stringify({
      results: {
        heatmap: [{
          location: { latitude: 51.5, longitude: -0.12 },
          query: { affinity: 0.6, affinity_rank: 3 },
        }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const analysisReference = cacheDiscoveryAnalysis(cachedDiscovery);
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = originalApiKey;
    if (originalOvertureDirectory === undefined) delete process.env.OVERTURE_DATA_DIR;
    else process.env.OVERTURE_DATA_DIR = originalOvertureDirectory;
    if (originalOverpassUrl === undefined) delete process.env.OVERPASS_URL;
    else process.env.OVERPASS_URL = originalOverpassUrl;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: candidateId,
      analysisReference,
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
      limit: 25,
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as {
    summary: { heatmap: { pointCount: number }; venues: { status: string; records: unknown[] } };
    analysis: {
      candidateId: string;
      affinity: { jointAffinity: number; attributionCoverage: string };
      overlap: { jaccard: { value: number | null } };
      scores: { components: Record<string, { status: string; score: number | null }>; composite: { score: null } };
      recommendations: Array<{ evidenceReferences: string[] }>;
    };
  };
  assert.ok(body.summary, JSON.stringify(body));
  assert.equal(body.summary.heatmap.pointCount, 1);
  assert.equal(body.summary.venues.status, "unavailable");
  assert.deepEqual(body.summary.venues.records, []);
  assert.equal(body.analysis.candidateId, candidateId);
  assert.equal(body.analysis.affinity.jointAffinity, 0.72);
  assert.equal(body.analysis.affinity.attributionCoverage, "both_inputs_attributed");
  assert.equal(body.analysis.overlap.jaccard.value, 1);
  assert.equal(body.analysis.scores.components.geographicSignal.score, 60);
  assert.equal(body.analysis.scores.components.venueReadiness.status, "unavailable");
  assert.equal(body.analysis.scores.composite.score, null);
  assert.equal(body.analysis.recommendations.length, 1);
  assert.ok(body.analysis.recommendations[0]?.evidenceReferences.includes(`Qloo Insights API · ${candidateId}`));
  assert.equal(qlooRequests, 1, "only the new heatmap request should call Qloo");
});

test("rejects expired discovery analysis references", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.QLOO_API_KEY;
  const originalOvertureDirectory = process.env.OVERTURE_DATA_DIR;
  const originalOverpassUrl = process.env.OVERPASS_URL;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  process.env.OVERTURE_DATA_DIR = "/nonexistent/overture-fixture-for-intelligence-test";
  delete process.env.OVERPASS_URL;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: { heatmap: [] } }), { status: 200, headers: { "content-type": "application/json" } });

  const expiredReference = cacheDiscoveryAnalysis(cachedDiscovery, Date.now() - (31 * 60 * 1000));
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = originalApiKey;
    if (originalOvertureDirectory === undefined) delete process.env.OVERTURE_DATA_DIR;
    else process.env.OVERTURE_DATA_DIR = originalOvertureDirectory;
    if (originalOverpassUrl === undefined) delete process.env.OVERPASS_URL;
    else process.env.OVERPASS_URL = originalOverpassUrl;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: candidateId,
      analysisReference: expiredReference,
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
      limit: 25,
    }),
  });
  assert.equal(response.status, 410);
  const body = await response.json() as { error: string };
  assert.match(body.error, /expired or is unavailable/i);
});

test("rejects mismatched candidate IDs for a valid analysis reference", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.QLOO_API_KEY;
  const originalOvertureDirectory = process.env.OVERTURE_DATA_DIR;
  const originalOverpassUrl = process.env.OVERPASS_URL;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  process.env.OVERTURE_DATA_DIR = "/nonexistent/overture-fixture-for-intelligence-test";
  delete process.env.OVERPASS_URL;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: { heatmap: [] } }), { status: 200, headers: { "content-type": "application/json" } });

  const validReference = cacheDiscoveryAnalysis(cachedDiscovery);
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = originalApiKey;
    if (originalOvertureDirectory === undefined) delete process.env.OVERTURE_DATA_DIR;
    else process.env.OVERTURE_DATA_DIR = originalOvertureDirectory;
    if (originalOverpassUrl === undefined) delete process.env.OVERPASS_URL;
    else process.env.OVERPASS_URL = originalOverpassUrl;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: "other-candidate",
      analysisReference: validReference,
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
      limit: 25,
    }),
  });
  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.match(body.error, /does not belong to this Discovery analysis/i);
});

test("rejects selected venue readiness when the venue is outside the bounded geographic result", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.QLOO_API_KEY;
  const originalOvertureDirectory = process.env.OVERTURE_DATA_DIR;
  const originalOverpassUrl = process.env.OVERPASS_URL;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  process.env.OVERTURE_DATA_DIR = "/nonexistent/overture-fixture-for-intelligence-test";
  delete process.env.OVERPASS_URL;
  globalThis.fetch = async () => new Response(JSON.stringify({ results: { heatmap: [{ location: { latitude: 51.5, longitude: -0.12 }, query: { affinity: 0.6, affinity_rank: 3 } }] } }), { status: 200, headers: { "content-type": "application/json" } });

  const validReference = cacheDiscoveryAnalysis(cachedDiscovery);
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = originalApiKey;
    if (originalOvertureDirectory === undefined) delete process.env.OVERTURE_DATA_DIR;
    else process.env.OVERTURE_DATA_DIR = originalOvertureDirectory;
    if (originalOverpassUrl === undefined) delete process.env.OVERPASS_URL;
    else process.env.OVERPASS_URL = originalOverpassUrl;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: "London",
      entityId: candidateId,
      analysisReference: validReference,
      selectedVenueId: "venue-not-in-bounds",
      bounds: { south: 51.45, west: -0.2, north: 51.55, east: -0.05 },
      categories: [],
      limit: 25,
    }),
  });
  assert.equal(response.status, 400);
  const body = await response.json() as { error: string };
  assert.match(body.error, /not part of this bounded geographic result/i);
});