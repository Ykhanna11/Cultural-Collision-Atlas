import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareQlooAffinityQueries,
  describeAffinityScopeComparison,
  normalizeQlooAffinityQuery,
} from "./affinity";
import type { AffinityQueryContext } from "./evidence";

const entityA = "10000000-0000-4000-8000-000000000001";
const entityB = "10000000-0000-4000-8000-000000000002";
const candidateId = "20000000-0000-4000-8000-000000000001";
const observedAt = "2026-10-30T12:00:00.000Z";

function context(overrides: Partial<AffinityQueryContext> = {}): AffinityQueryContext {
  return {
    analysisReference: "discovery-test-1",
    requestReference: "single-interest-a",
    scope: "single_interest",
    inputEntityIds: [entityA],
    recommendationType: "urn:entity:brand",
    city: "London",
    cityEntityId: "30000000-0000-4000-8000-000000000001",
    observedAt,
    ...overrides,
  };
}

function response(candidate: Record<string, unknown> = {}) {
  return {
    success: true,
    results: {
      entities: [{
        entity_id: candidateId,
        name: "Evidence-backed candidate",
        query: {
          affinity: 0.72,
          affinity_rank: 3,
          explainability: {
            "signal.interests.entities": [
              { entity_id: entityA, score: 0.4 },
              { entity_id: entityB, score: 0.2 },
            ],
          },
        },
        tags: [{ id: "urn:tag:genre:brand:fashion", name: "Fashion" }],
        properties: { locality: { city: { entity_id: "30000000-0000-4000-8000-000000000001" } } },
        ...candidate,
      }],
    },
  };
}

test("normalizes complete single-interest and joint-interest responses", () => {
  const single = normalizeQlooAffinityQuery(response(), context());
  const joint = normalizeQlooAffinityQuery(response(), context({
    requestReference: "joint-interest",
    scope: "joint_interest",
    inputEntityIds: [entityA, entityB],
  }));

  assert.equal(single.status, "complete");
  assert.equal(joint.status, "complete");
  assert.equal(single.evidence[0].query.scope, "single_interest");
  assert.deepEqual(joint.evidence[0].query.inputEntityIds, [entityA, entityB]);
  assert.deepEqual(joint.evidence[0].providerValues.affinity, {
    state: "returned",
    value: 0.72,
    providerValue: 0.72,
  });
  assert.deepEqual(joint.evidence[0].providerValues.affinityRank, {
    state: "returned",
    value: 3,
    providerValue: 3,
  });
  assert.equal(joint.evidence[0].explainability.coverage, "both_inputs_attributed");
  assert.equal(joint.evidence[0].source.providerTimestamp, null);
  assert.equal(joint.evidence[0].source.observedAt, observedAt);
});

test("keeps missing affinity distinct from zero and from a missing rank", () => {
  const noAffinity = normalizeQlooAffinityQuery(response({
    query: { affinity_rank: 4, explainability: { "signal.interests.entities": [] } },
  }), context());
  const noRank = normalizeQlooAffinityQuery(response({
    query: { affinity: 0, explainability: { "signal.interests.entities": [] } },
  }), context());

  assert.equal(noAffinity.evidence[0].providerValues.affinity.state, "missing");
  assert.equal(noAffinity.evidence[0].providerValues.affinity.value, null);
  assert.equal(noAffinity.evidence[0].providerValues.affinityRank.state, "returned");
  assert.equal(noRank.evidence[0].providerValues.affinity.state, "returned");
  assert.equal(noRank.evidence[0].providerValues.affinity.value, 0);
  assert.equal(noRank.evidence[0].providerValues.affinityRank.state, "missing");
});

test("marks explainability unavailable without fabricating attribution", () => {
  const normalized = normalizeQlooAffinityQuery(response({ query: { affinity: 0.5 } }), context());
  assert.equal(normalized.evidence[0].explainability.coverage, "unavailable");
  assert.deepEqual(normalized.evidence[0].explainability.inputAttributions, []);
  assert.ok(normalized.evidence[0].completeness.missingFields.includes("explainability"));
});

test("preserves valid candidates and marks malformed sibling results as partial", () => {
  const valid = response();
  const payload: unknown = {
    ...valid,
    results: {
      entities: [
        ...valid.results.entities,
        { entity_id: 17, name: "Malformed candidate" },
      ],
    },
  };
  const normalized = normalizeQlooAffinityQuery(payload, context());
  assert.equal(normalized.status, "partial");
  assert.equal(normalized.invalidCandidateCount, 1);
  assert.equal(normalized.evidence.length, 1);
  assert.equal(normalized.evidence[0].candidate.entityId, candidateId);
});

test("retains malformed provider values as invalid rather than coercing them", () => {
  const normalized = normalizeQlooAffinityQuery(response({
    query: {
      affinity: "0.7",
      affinity_rank: 1.5,
      explainability: { "signal.interests.entities": [{ entity_id: entityA, score: "high" }] },
    },
  }), context());
  const evidence = normalized.evidence[0];

  assert.equal(normalized.status, "partial");
  assert.equal(evidence.providerValues.affinity.state, "invalid");
  if (evidence.providerValues.affinity.state === "invalid") {
    assert.equal(evidence.providerValues.affinity.providerValue, "0.7");
  }
  assert.equal(evidence.providerValues.affinityRank.state, "invalid");
  if (evidence.providerValues.affinityRank.state === "invalid") {
    assert.equal(evidence.providerValues.affinityRank.providerValue, 1.5);
  }
  assert.equal(evidence.explainability.coverage, "partial");
  assert.equal(evidence.explainability.invalidSignalCount, 1);
});

test("rejects malformed response envelopes distinctly from unavailable and empty", () => {
  assert.equal(normalizeQlooAffinityQuery(null, context()).status, "unavailable");
  assert.equal(normalizeQlooAffinityQuery({ results: { entities: [] } }, context()).status, "empty");
  assert.equal(normalizeQlooAffinityQuery({ results: {} }, context()).status, "invalid");
});

test("compares candidate presence across compatible single and joint scopes without comparing affinity numerically", () => {
  const single = normalizeQlooAffinityQuery(response(), context());
  const joint = normalizeQlooAffinityQuery(response(), context({
    requestReference: "joint-interest",
    scope: "joint_interest",
    inputEntityIds: [entityA, entityB],
  }));
  const comparison = compareQlooAffinityQueries([single, joint]);

  assert.equal(comparison.status, "compatible_context");
  assert.equal(comparison.candidates.length, 1);
  assert.deepEqual(comparison.candidates[0].observations.map(({ scope, evidence }) => ({ scope, present: Boolean(evidence) })), [
    { scope: "single_interest", present: true },
    { scope: "joint_interest", present: true },
  ]);
  assert.equal(comparison.candidates[0].numericComparison.status, "not_performed");
  assert.match(describeAffinityScopeComparison(comparison, candidateId), /not numerically compared/);
});

test("refuses comparisons across incompatible locality contexts", () => {
  const single = normalizeQlooAffinityQuery(response(), context());
  const otherCity = normalizeQlooAffinityQuery(response(), context({
    requestReference: "other-city",
    city: "Paris",
    cityEntityId: "30000000-0000-4000-8000-000000000099",
  }));
  const comparison = compareQlooAffinityQueries([single, otherCity]);

  assert.equal(comparison.status, "incompatible_context");
  assert.match(comparison.reason ?? "", /Geographic query context differs/);
  assert.equal(comparison.candidates.length, 0);
});

test("preserves candidate IDs, returned attribution, source references, and partial query status", () => {
  const query = normalizeQlooAffinityQuery(response(), context({
    requestReference: "qloo.single.interest-a",
  }));
  const evidence = query.evidence[0];

  assert.equal(evidence.provider, "qloo_api");
  assert.equal(evidence.query.requestReference, "qloo.single.interest-a");
  assert.deepEqual(evidence.query.inputEntityIds, [entityA]);
  assert.equal(evidence.candidate.entityId, candidateId);
  assert.equal(evidence.candidate.localityCityEntityId, "30000000-0000-4000-8000-000000000001");
  assert.equal(evidence.source.reference, "Qloo Insights API");
  assert.equal(evidence.explainability.providerValue?.["signal.interests.entities"] instanceof Array, true);
  assert.equal(evidence.explainability.coverage, "one_input_attributed");
});

test("comparison output is deterministic for fixed provider data and observation time", () => {
  const inputs = [
    normalizeQlooAffinityQuery(response(), context()),
    normalizeQlooAffinityQuery(response(), context({
      requestReference: "joint-interest",
      scope: "joint_interest",
      inputEntityIds: [entityA, entityB],
    })),
  ];
  assert.deepEqual(compareQlooAffinityQueries(inputs), compareQlooAffinityQueries(inputs));
});