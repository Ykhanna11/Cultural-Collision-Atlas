import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attributedJointRecommendations,
  compareCulturalTagSets,
  type CulturalTagSet,
} from "./overlap";
import type { NormalizedAffinityEvidence } from "./evidence";

const culturalTag = { id: "genre:music", name: "Music", subtype: "urn:tag:genre:music" };
const operationalTag = { id: "cost:place:high", name: "High cost", subtype: "urn:tag:cost_description:place" };

function tagSet(
  tags: CulturalTagSet["tags"],
  overrides: Partial<CulturalTagSet> = {},
): CulturalTagSet {
  return {
    sourceReference: "qloo:taste-analysis:entity-a",
    status: "complete",
    tags,
    ...overrides,
  };
}

test("uses exact stable tag IDs and computes deterministic Jaccard similarity", () => {
  const result = compareCulturalTagSets(
    tagSet([culturalTag, operationalTag]),
    tagSet([
      { ...culturalTag, name: "Music category" },
      { id: "genre:books", name: "Books", subtype: "urn:tag:genre:media" },
    ], { sourceReference: "qloo:taste-analysis:entity-b" }),
  );

  assert.equal(result.status, "complete");
  assert.deepEqual(result.matchingTags.map(({ id }) => id), ["genre:music"]);
  assert.equal(result.jaccard.status, "available");
  assert.equal(result.jaccard.value, 1 / 3);
  assert.equal(result.jaccard.intersectionSize, 1);
  assert.equal(result.jaccard.unionSize, 3);
  assert.deepEqual(result.sourceReferences, [
    "qloo:taste-analysis:entity-a",
    "qloo:taste-analysis:entity-b",
  ]);
});

test("classifies cultural, operational, and unclassified shared tags", () => {
  const result = compareCulturalTagSets(
    tagSet([culturalTag, operationalTag, { id: "unknown", name: "Unknown", subtype: null }]),
    tagSet([culturalTag, operationalTag, { id: "unknown", name: "Unknown", subtype: "custom" }]),
  );

  assert.deepEqual(result.matchingTags.map(({ classification }) => classification), [
    "cultural_domain",
    "operational",
    "unclassified",
  ]);
});

test("reports a genuine zero only for complete non-empty sets", () => {
  const result = compareCulturalTagSets(
    tagSet([{ id: "genre:music", name: "Music", subtype: "urn:tag:genre:music" }]),
    tagSet([{ id: "genre:books", name: "Books", subtype: "urn:tag:genre:media" }]),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.matchingTags.length, 0);
  assert.equal(result.jaccard.value, 0);
});

test("does not calculate Jaccard from partial or unavailable sets", () => {
  const partial = compareCulturalTagSets(
    tagSet([culturalTag], { status: "partial" }),
    tagSet([culturalTag]),
  );
  const unavailable = compareCulturalTagSets(
    tagSet([], { status: "unavailable" }),
    tagSet([], { status: "unavailable", sourceReference: "qloo:taste-analysis:entity-b" }),
  );

  assert.equal(partial.status, "partial");
  assert.equal(partial.jaccard.value, null);
  assert.equal(partial.jaccard.reason, "incomplete_tag_sets");
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.jaccard.value, null);
});

test("does not assign a similarity to two complete empty tag sets", () => {
  const result = compareCulturalTagSets(tagSet([]), tagSet([]));
  assert.equal(result.status, "complete");
  assert.equal(result.jaccard.value, null);
  assert.equal(result.jaccard.reason, "empty_union");
});

test("attributes indirect connections only to positive selected-input signals on joint queries", () => {
  const base = {
    provider: "qloo_api",
    evidenceType: "recommendation",
    query: {
      analysisReference: "analysis-1",
      requestReference: "joint-1",
      scope: "joint_interest",
      inputEntityIds: ["input-a", "input-b"],
      recommendationType: "urn:entity:brand",
      city: "London",
    },
    candidate: {
      entityId: "candidate-1",
      name: "Candidate",
      tags: [],
      localityCityEntityId: null,
    },
    providerValues: {
      affinity: { state: "returned", value: 0.7, providerValue: 0.7 },
      affinityRank: { state: "missing", value: null },
    },
    explainability: {
      coverage: "both_inputs_attributed",
      providerValue: null,
      inputAttributions: [
        { entityId: "input-a", score: 0.4, matchesInput: true, positive: true },
        { entityId: "input-b", score: 0.3, matchesInput: true, positive: true },
        { entityId: "unselected", score: 0.9, matchesInput: false, positive: true },
      ],
      invalidSignalCount: 0,
    },
    completeness: { status: "complete", missingFields: [], invalidFields: [] },
    source: {
      reference: "Qloo Insights API",
      providerTimestamp: null,
      observedAt: "2026-10-30T12:00:00.000Z",
    },
  } as NormalizedAffinityEvidence;
  const singleInterest = {
    ...base,
    query: { ...base.query, scope: "single_interest" as const },
  } as NormalizedAffinityEvidence;

  const connections = attributedJointRecommendations([base, singleInterest]);
  assert.equal(connections.length, 1);
  assert.equal(connections[0]?.attribution, "both_selected_inputs");
  assert.deepEqual(connections[0]?.matchedInputEntityIds, ["input-a", "input-b"]);
  assert.equal(connections[0]?.sourceReference, "Qloo Insights API");
});