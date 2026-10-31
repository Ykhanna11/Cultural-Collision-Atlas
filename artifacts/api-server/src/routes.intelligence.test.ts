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

test("opportunity-discovery endpoint generates candidates for valid analysis state", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
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
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: validReference, candidateId }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as {
    status: "ok" | "insufficient_evidence";
    opportunities: Array<{ title: string; verifiedEvidence: Array<{ sourceReference?: string }>; inferredSuggestions: Array<{ supportingEvidenceReferences: string[] }> }>;
  };
  assert.equal(body.status, "ok");
  assert.ok(body.opportunities.length > 0);
  assert.ok(body.opportunities.every((candidate) => candidate.verifiedEvidence.length > 0));
  assert.ok(body.opportunities.every((candidate) => candidate.inferredSuggestions.every((suggestion) => {
    return suggestion.supportingEvidenceReferences.every((ref) =>
      candidate.verifiedEvidence.some((evidence) => evidence.sourceReference === ref),
    );
  })));
});

test("opportunity-discovery endpoint rejects stale and mismatched analysis references", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  globalThis.fetch = async () => new Response(JSON.stringify({ results: { heatmap: [] } }), { status: 200, headers: { "content-type": "application/json" } });

  const expiredReference = cacheDiscoveryAnalysis(cachedDiscovery, Date.now() - (31 * 60 * 1000));
  const validReference = cacheDiscoveryAnalysis(cachedDiscovery);
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const expired = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: expiredReference, candidateId }),
  });
  assert.equal(expired.status, 410);

  const mismatched = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: validReference, candidateId: "other-candidate" }),
  });
  assert.equal(mismatched.status, 400);
});

test("opportunity-discovery endpoint keeps missing geographic evidence honest and limited", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
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
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: validReference, candidateId }),
  });

  const body = await response.json() as {
    status: string;
    opportunities: Array<{ missingEvidence: string[]; inferredSuggestions: Array<{ activationFormats: string[] }> }>;
  };
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.ok(body.opportunities.every((candidate) => candidate.missingEvidence.some((entry) => /geographic/i.test(entry))));
  assert.ok(body.opportunities.every((candidate) => candidate.inferredSuggestions.every((suggestion) => suggestion.activationFormats.every((format) => !/geographic|heatmap/i.test(format)))));
});

test("opportunity-discovery endpoint rejects unknown analysis references with the existing stale-analysis semantics", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  globalThis.fetch = async () => new Response(JSON.stringify({ results: { heatmap: [] } }), { status: 200, headers: { "content-type": "application/json" } });

  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: "unknown-analysis-reference", candidateId }),
  });

  assert.equal(response.status, 410);
  const body = await response.json() as { error: string };
  assert.match(body.error, /expired or is unavailable/i);
});

test("opportunity-discovery endpoint ignores client-submitted evidence and trusts server-side analysis only", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
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
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      analysisReference: validReference,
      candidateId,
      evidence: [{ sourceReference: "client-fabricated-ref" }],
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as {
    opportunities: Array<{ inferredSuggestions: Array<{ supportingEvidenceReferences: string[] }> }>;
  };
  assert.ok(body.opportunities.every((candidate) => candidate.inferredSuggestions.every((suggestion) => !suggestion.supportingEvidenceReferences.includes("client-fabricated-ref"))));
});

test("opportunity-discovery endpoint returns insufficient evidence when cultural signals are missing", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
  globalThis.fetch = async () => new Response(JSON.stringify({ results: { heatmap: [] } }), { status: 200, headers: { "content-type": "application/json" } });

  const insufficientDiscovery = {
    ...cachedDiscovery,
    jointResults: { success: true, results: { entities: [] } },
    tasteAnalysisA: { success: true, results: { tags: [] } },
    tasteAnalysisB: { success: true, results: { tags: [] } },
  };
  const reference = cacheDiscoveryAnalysis(insufficientDiscovery);
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    globalThis.fetch = originalFetch;
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: reference, candidateId }),
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { status: string; opportunities: unknown[]; reason?: string };
  assert.equal(body.status, "insufficient_evidence");
  assert.deepEqual(body.opportunities, []);
  assert.match(body.reason ?? "", /Insufficient evidence/i);
});

test("opportunity-discovery endpoint is deterministic for identical inputs", async (context) => {
  const originalFetch = globalThis.fetch;
  process.env.QLOO_API_KEY = "local-test-placeholder";
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
    delete process.env.QLOO_API_KEY;
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const first = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: validReference, candidateId }),
  });
  const second = await originalFetch(`http://127.0.0.1:${address.port}/api/opportunities/intelligence/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ analysisReference: validReference, candidateId }),
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), await second.json());
});