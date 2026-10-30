import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cacheDiscoveryAnalysis,
  cacheGeographicAnalysis,
  getCachedDiscoveryAnalysis,
  getCachedGeographicAnalysis,
  type CachedDiscoveryAnalysis,
} from "./analysis-cache";
import type { GeographicIntelligenceSummary } from "./geographic";

const analysis: Omit<CachedDiscoveryAnalysis, "analysisReference"> = {
  input: {
    interestA: "Interest A",
    interestAId: "interest-a-id",
    interestB: "Interest B",
    interestBId: "interest-b-id",
    city: "London",
    recommendationType: "urn:entity:brand",
  },
  resultsA: { results: { entities: [] } },
  resultsB: { results: { entities: [] } },
  jointResults: { results: { entities: [] } },
  tasteAnalysisA: null,
  tasteAnalysisB: null,
  candidates: [{
    id: "candidate-1",
    name: "Candidate",
    explanation: "Evidence-backed result.",
    score: 0,
    scoreDescription: "No numeric signal returned.",
    confidence: "low",
    evidence: [],
  }],
  createdAt: "2026-10-30T12:00:00.000Z",
};

test("reuses cached Discovery evidence for its originating candidate", () => {
  const reference = cacheDiscoveryAnalysis(analysis, 1000);
  const lookup = getCachedDiscoveryAnalysis(reference, "candidate-1", 1500);
  assert.equal(lookup.status, "found");
  if (lookup.status === "found") {
    assert.equal(lookup.analysis.analysisReference, reference);
    const { analysisReference: _reference, ...cachedAnalysis } = lookup.analysis;
    assert.deepEqual(cachedAnalysis, analysis);
  }
});

test("rejects an unrelated candidate for an otherwise valid analysis reference", () => {
  const reference = cacheDiscoveryAnalysis(analysis, 1000);
  assert.deepEqual(getCachedDiscoveryAnalysis(reference, "other-candidate", 1500), {
    status: "candidate_not_found",
  });
});

test("expires cached provider evidence after its bounded TTL", () => {
  const reference = cacheDiscoveryAnalysis(analysis, 1000);
  assert.deepEqual(getCachedDiscoveryAnalysis(reference, "candidate-1", 30 * 60 * 1000 + 1000), {
    status: "expired",
  });
});

test("reuses geographic results only for an identical bounded request", () => {
  const reference = cacheDiscoveryAnalysis(analysis, 1000);
  const lookup = getCachedDiscoveryAnalysis(reference, "candidate-1", 1500);
  assert.equal(lookup.status, "found");
  if (lookup.status !== "found") return;
  const request = {
    city: "London",
    entityId: "candidate-1",
    bounds: { south: 51.4, west: -0.3, north: 51.6, east: 0 },
    categories: ["culture"],
    limit: 25,
  };
  const summary = {
    requestedBounds: request.bounds,
    observedBounds: null,
    heatmap: {
      status: "empty",
      source: "Qloo Insights API",
      pointCount: 0,
      duplicateCount: 0,
      invalidCoordinateCount: 0,
      points: [],
    },
    venues: {
      status: "empty",
      source: "Overture Maps Places",
      recordCount: 0,
      duplicateCount: 0,
      invalidCoordinateCount: 0,
      categoryCounts: [],
      records: [],
    },
    overtureCoverage: { status: "unknown", bounds: null },
    coverage: "partial",
    sourceSeparation: "Sources remain distinct.",
  } as GeographicIntelligenceSummary;

  cacheGeographicAnalysis(lookup.analysis, request, summary);
  assert.deepEqual(getCachedGeographicAnalysis(lookup.analysis, request), summary);
  assert.equal(
    getCachedGeographicAnalysis(lookup.analysis, { ...request, query: "changed" }),
    undefined,
  );
});