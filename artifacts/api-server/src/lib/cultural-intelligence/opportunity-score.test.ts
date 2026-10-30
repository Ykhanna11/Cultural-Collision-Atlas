import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPPORTUNITY_METHODOLOGY_VERSION,
  scoreOpportunityComponents,
} from "./opportunity-score";
import type { NormalizedAffinityEvidence } from "./evidence";
import type { CulturalOverlapResult } from "./overlap";
import type { GeographicIntelligenceSummary } from "./geographic";

const overlap: CulturalOverlapResult = {
  status: "complete",
  matchingTags: [],
  leftOnlyTags: [],
  rightOnlyTags: [],
  jaccard: {
    status: "available",
    value: 0.5,
    intersectionSize: 1,
    unionSize: 2,
  },
  coverage: {
    leftStatus: "complete",
    rightStatus: "complete",
    leftTagCount: 1,
    rightTagCount: 2,
    matchingTagCount: 1,
  },
  sourceReferences: ["taste:a", "taste:b"],
};

const geography: GeographicIntelligenceSummary = {
  requestedBounds: { south: 0, west: 0, north: 1, east: 1 },
  observedBounds: { south: 0, west: 0, north: 1, east: 1 },
  heatmap: {
    status: "returned",
    source: "Qloo Insights API",
    pointCount: 2,
    duplicateCount: 0,
    invalidCoordinateCount: 0,
    points: [
      { latitude: 0.2, longitude: 0.2, affinity: 0.4 },
      { latitude: 0.8, longitude: 0.8, affinity: 0.8 },
    ],
  },
  venues: {
    status: "returned",
    source: "Overture Maps Places",
    recordCount: 1,
    duplicateCount: 0,
    invalidCoordinateCount: 0,
    categoryCounts: [{ category: "culture", count: 1 }],
    records: [],
  },
  overtureCoverage: { status: "covered", bounds: { south: 0, west: 0, north: 1, east: 1 } },
  coverage: "complete",
  sourceSeparation: "Separate provider collections.",
};

function jointAffinity(value = 0.75): NormalizedAffinityEvidence {
  return {
    provider: "qloo_api",
    evidenceType: "recommendation",
    query: {
      analysisReference: "analysis-1",
      requestReference: "joint-1",
      scope: "joint_interest",
      inputEntityIds: ["a", "b"],
      recommendationType: "urn:entity:brand",
      city: "London",
    },
    candidate: { entityId: "candidate", name: "Candidate", tags: [], localityCityEntityId: null },
    providerValues: {
      affinity: { state: "returned", value, providerValue: value },
      affinityRank: { state: "returned", value: 2, providerValue: 2 },
    },
    explainability: {
      coverage: "both_inputs_attributed",
      providerValue: null,
      inputAttributions: [],
      invalidSignalCount: 0,
    },
    completeness: { status: "complete", missingFields: [], invalidFields: [] },
    source: { reference: "Qloo Insights API", providerTimestamp: null, observedAt: "2026-10-30T12:00:00.000Z" },
  };
}

test("calculates independent cultural, overlap, geographic, readiness, and coverage components", () => {
  const result = scoreOpportunityComponents({
    jointAffinity: jointAffinity(),
    overlap,
    geography,
    venueReadiness: { score: 61, sourceReferences: ["overture:overture-1"] },
  });
  assert.equal(result.methodologyVersion, OPPORTUNITY_METHODOLOGY_VERSION);
  assert.equal(result.components.culturalAffinity.score, 75);
  assert.equal(result.components.descriptorOverlap.score, 50);
  assert.equal(result.components.geographicSignal.score, 60);
  assert.equal(result.components.venueReadiness.score, 61);
  assert.equal(result.components.evidenceCompleteness.score, 100);
  assert.equal(result.composite.status, "unavailable");
  assert.equal(result.composite.score, null);
});

test("keeps missing values explicitly unavailable and does not convert affinity rank", () => {
  const missingAffinity = jointAffinity();
  missingAffinity.providerValues.affinity = { state: "missing", value: null };
  const result = scoreOpportunityComponents({
    jointAffinity: missingAffinity,
    overlap: { ...overlap, jaccard: { ...overlap.jaccard, status: "unavailable", value: null, reason: "incomplete_tag_sets" } },
    geography: { ...geography, heatmap: { ...geography.heatmap, status: "empty", points: [], pointCount: 0 } },
    venueReadiness: null,
  });
  assert.equal(result.components.culturalAffinity.status, "unavailable");
  assert.match(result.components.culturalAffinity.reason ?? "", /rank is not converted/);
  assert.equal(result.components.descriptorOverlap.status, "unavailable");
  assert.equal(result.components.geographicSignal.status, "unavailable");
  assert.equal(result.components.venueReadiness.status, "unavailable");
  assert.equal(result.components.evidenceCompleteness.score, 0);
});

test("uses repeatable output and identifies venue readiness as operational only", () => {
  const input = {
    jointAffinity: jointAffinity(0.333),
    overlap,
    geography,
    venueReadiness: { score: 61.2, sourceReferences: ["venue:id-1", "venue:id-1"] },
  };
  const first = scoreOpportunityComponents(input);
  assert.deepEqual(first, scoreOpportunityComponents(input));
  assert.equal(first.components.venueReadiness.score, 61);
  assert.match(first.components.venueReadiness.explanation ?? "", /operational readiness only/);
});

test("does not expose a composite without approved weights", () => {
  const result = scoreOpportunityComponents({
    jointAffinity: null,
    overlap,
    geography,
    venueReadiness: null,
  });
  assert.equal(result.composite.score, null);
  assert.match(result.composite.reason, /No product-approved/);
  assert.ok(result.assumptions.length > 0);
  assert.ok(result.limitations.some((limitation) => /campaign success/.test(limitation)));
});