import assert from "node:assert/strict";
import { test } from "node:test";
import { AnalyzeGeographicIntelligenceResponse } from "@workspace/api-zod";
import type { Venue } from "../venue-source";
import type { GeographicIntelligenceSummary } from "./geographic";
import { analyzeUnifiedOpportunity } from "./analyze";
import type { CachedDiscoveryAnalysis } from "./analysis-cache";

const candidateId = "qloo-candidate-1";
const sharedTagId = "urn:tag:genre:music:shared";

function actualVenue(): Venue {
  return {
    provider: "overture",
    providerVenueId: "overture-venue-1",
    name: "Actual Culture Hall",
    latitude: 51.5,
    longitude: -0.12,
    categories: ["culture", "event_space"],
    attribution: "Overture Maps Foundation; source license applies.",
    retrievedAt: "2026-10-30T12:00:00.000Z",
  };
}

function discoveryContext(): CachedDiscoveryAnalysis {
  const explainability = {
    "signal.interests.entities": [
      { entity_id: "interest-a-id", score: 0.6 },
      { entity_id: "interest-b-id", score: 0.4 },
    ],
  };
  return {
    analysisReference: "00000000-0000-4000-8000-000000000001",
    input: {
      interestA: "Interest A",
      interestAId: "interest-a-id",
      interestB: "Interest B",
      interestBId: "interest-b-id",
      city: "London",
      recommendationType: "urn:entity:brand",
    },
    resultsA: {
      success: true,
      results: {
        entities: [{ entity_id: candidateId, name: "Bridge candidate", query: { affinity: 0.5 } }],
      },
    },
    resultsB: {
      success: true,
      results: {
        entities: [{ entity_id: candidateId, name: "Bridge candidate", query: { affinity: 0.4 } }],
      },
    },
    jointResults: {
      success: true,
      results: {
        entities: [{
          entity_id: candidateId,
          name: "Bridge candidate",
          query: { affinity: 0.72, explainability },
        }],
      },
    },
    tasteAnalysisA: {
      success: true,
      results: {
        tags: [
          { tag_id: sharedTagId, name: "Shared music", subtype: "urn:tag:genre:music" },
          { tag_id: "urn:tag:genre:music:a-only", name: "Interest A style", subtype: "urn:tag:genre:music" },
        ],
      },
    },
    tasteAnalysisB: {
      success: true,
      results: {
        tags: [
          { tag_id: sharedTagId, name: "Shared music", subtype: "urn:tag:genre:music" },
          { tag_id: "urn:tag:genre:music:b-only", name: "Interest B style", subtype: "urn:tag:genre:music" },
        ],
      },
    },
    candidates: [{
      id: candidateId,
      name: "Bridge candidate",
      explanation: "Aggregate recommendation evidence only.",
      score: 72,
      scoreDescription: "Provider affinity scaled for display; not a probability.",
      confidence: "high",
      evidence: [],
    }],
    createdAt: "2026-10-30T12:00:00.000Z",
  };
}

function geography(): GeographicIntelligenceSummary {
  const venue = actualVenue();
  return {
    requestedBounds: { south: 51.4, west: -0.3, north: 51.6, east: 0 },
    observedBounds: { south: venue.latitude, west: venue.longitude, north: venue.latitude, east: venue.longitude },
    heatmap: {
      status: "returned",
      source: "Qloo Insights API",
      pointCount: 1,
      duplicateCount: 0,
      invalidCoordinateCount: 0,
      points: [{ latitude: 51.5, longitude: -0.12, affinity: 0.6, affinityRank: 4 }],
    },
    venues: {
      status: "returned",
      source: "Overture Maps Places",
      recordCount: 1,
      duplicateCount: 0,
      invalidCoordinateCount: 0,
      categoryCounts: [{ category: "culture", count: 1 }, { category: "event_space", count: 1 }],
      records: [venue],
    },
    overtureCoverage: {
      status: "covered",
      bounds: { south: 51, west: -1, north: 52, east: 0.5 },
    },
    coverage: "complete",
    sourceSeparation: "Heatmap signals and venue records are distinct provider entities.",
  };
}

test("composes cached affinity, distinct/shared descriptors, geography, scores, and evidence-driven venue options", () => {
  const result = analyzeUnifiedOpportunity({
    context: discoveryContext(),
    candidateId,
    geography: geography(),
  });

  assert.equal(result.version, "opportunity-analysis/1");
  assert.equal(result.affinity.queryStatuses.joint, "partial");
  assert.equal(result.affinity.jointAffinity, 0.72);
  assert.equal(result.affinity.attributionCoverage, "both_inputs_attributed");
  assert.deepEqual(result.overlap.matchingTags.map(({ id }) => id), [sharedTagId]);
  assert.deepEqual(result.overlap.interestAOnlyTags.map(({ id }) => id), ["urn:tag:genre:music:a-only"]);
  assert.deepEqual(result.overlap.interestBOnlyTags.map(({ id }) => id), ["urn:tag:genre:music:b-only"]);
  assert.equal(result.overlap.jaccard.value, 1 / 3);
  assert.equal(result.scores.components.culturalAffinity.score, 72);
  assert.equal(result.scores.components.descriptorOverlap.score, 33);
  assert.equal(result.scores.components.geographicSignal.score, 60);
  assert.equal(result.scores.components.venueReadiness.status, "unavailable");
  assert.equal(result.scores.components.evidenceCompleteness.score, 75);
  assert.equal(result.scores.composite.score, null);
  assert.equal(result.recommendations.length, 2);
  assert.ok(result.recommendations[1]?.evidenceReferences.includes("overture:overture-venue-1"));
  assert.match(result.recommendations[1]?.limitations.join(" ") ?? "", /does not confirm current venue availability/);
});

test("uses an actual selected venue assessment only when supplied with its source reference", () => {
  const result = analyzeUnifiedOpportunity({
    context: discoveryContext(),
    candidateId,
    geography: geography(),
    venueReadiness: {
      score: 64,
      sourceReferences: ["overture:overture-venue-1"],
    },
  });
  assert.equal(result.scores.components.venueReadiness.score, 64);
  assert.equal(result.scores.components.evidenceCompleteness.score, 100);
  assert.match(result.scores.components.venueReadiness.explanation ?? "", /operational readiness only/);
});

test("keeps missing provider signals unavailable and never creates a composite score", () => {
  const context = discoveryContext();
  context.jointResults = {
    success: true,
    results: {
      entities: [{ entity_id: candidateId, name: "Bridge candidate", query: {} }],
    },
  };
  context.tasteAnalysisA = null;
  context.tasteAnalysisB = null;
  const sparseGeography = geography();
  sparseGeography.heatmap = { ...sparseGeography.heatmap, status: "unavailable", points: [], pointCount: 0 };

  const result = analyzeUnifiedOpportunity({
    context,
    candidateId,
    geography: sparseGeography,
  });
  assert.equal(result.affinity.jointAffinityStatus, "missing");
  assert.equal(result.affinity.jointAffinity, null);
  assert.equal(result.overlap.status, "unavailable");
  assert.equal(result.scores.components.culturalAffinity.score, null);
  assert.equal(result.scores.components.geographicSignal.score, null);
  assert.equal(result.scores.composite.score, null);
  assert.match(result.scores.composite.reason, /No product-approved/);
});

test("matches the generated OpenAPI response validator", () => {
  const summary = geography();
  const analysis = analyzeUnifiedOpportunity({
    context: discoveryContext(),
    candidateId,
    geography: summary,
  });
  assert.equal(
    AnalyzeGeographicIntelligenceResponse.safeParse({ summary, analysis }).success,
    true,
  );
});