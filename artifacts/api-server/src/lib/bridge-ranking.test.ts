import assert from "node:assert/strict";
import { test } from "node:test";
import { rankBridgeCandidates } from "./bridge-ranking";

const defaultExplainability = {
  "signal.interests.entities": [
    { entity_id: "input-a", score: 0.4 },
    { entity_id: "input-b", score: 0.3 },
  ],
};

function candidate(
  id = "bridge-candidate",
  query: Record<string, unknown> = {
    affinity: 0.72,
    affinity_rank: 2,
    explainability: defaultExplainability,
  },
) {
  return {
    entity_id: id,
    name: `Candidate ${id}`,
    query,
  };
}

function response(entities: Record<string, unknown>[] = []) {
  return { success: true, results: { entities } };
}

function rank(overrides: Record<string, unknown> = {}) {
  return rankBridgeCandidates({
    interestA: "Input A",
    interestAId: "input-a",
    interestB: "Input B",
    interestBId: "input-b",
    recommendationType: "urn:entity:brand",
    resultsA: response([candidate()]),
    resultsB: response([candidate()]),
    jointResults: response([candidate()]),
    ...overrides,
  } as Parameters<typeof rankBridgeCandidates>[0]);
}

function evidenceFor(
  bridge: ReturnType<typeof rank>[number],
  label: string,
) {
  const item = bridge.evidence.find((evidenceItem) => evidenceItem.label === label);
  assert.ok(item, `Expected evidence item: ${label}`);
  return item;
}

test("emits complete joint, A-only, B-only, and attribution evidence", () => {
  const [bridge] = rank();
  assert.ok(bridge);
  assert.equal(bridge.score, 72);
  assert.equal(bridge.confidence, "high");
  assert.match(
    evidenceFor(bridge, "Joint-interest comparison · Brands").value,
    /Qloo affinity: 0.72 \(provider-returned\)/,
  );
  assert.match(
    evidenceFor(bridge, "Supporting single-interest comparison: Input A").value,
    /Query scope: A-only/,
  );
  assert.match(
    evidenceFor(bridge, "Supporting single-interest comparison: Input B").value,
    /Query scope: B-only/,
  );
  assert.match(
    evidenceFor(bridge, "Per-result input attribution").value,
    /both supplied interests/,
  );
});

test("distinguishes unavailable and empty single-interest results", () => {
  const [bridge] = rank({
    resultsA: null,
    resultsB: response(),
  });
  assert.ok(bridge);
  assert.match(
    evidenceFor(bridge, "A-only query results").value,
    /A-only query was unavailable/,
  );
  assert.match(
    evidenceFor(bridge, "B-only query results").value,
    /B-only query returned no candidates/,
  );
});

test("records a missing candidate from a completed single-interest query", () => {
  const [bridge] = rank({
    resultsA: response([candidate("another-candidate")]),
  });
  assert.ok(bridge);
  assert.match(
    evidenceFor(bridge, "A-only query results").value,
    /candidate was not returned by the A-only query \(query status: complete\)/,
  );
});

test("preserves missing affinity separately from a returned rank", () => {
  const [bridge] = rank({
    jointResults: response([candidate("bridge-candidate", {
      affinity_rank: 4,
      explainability: defaultExplainability,
    })]),
  });
  assert.ok(bridge);
  assert.equal(bridge.score, 25);
  assert.match(
    evidenceFor(bridge, "Joint-interest comparison · Brands").value,
    /Qloo affinity: missing\. Qloo affinity rank: 4 \(provider-returned\)/,
  );
});

test("reports missing explainability without fabricating attribution", () => {
  const [bridge] = rank({
    jointResults: response([candidate("bridge-candidate", {
      affinity: 0.5,
      affinity_rank: 2,
    })]),
  });
  assert.ok(bridge);
  assert.equal(bridge.confidence, "low");
  assert.match(
    evidenceFor(bridge, "Joint-interest comparison · Brands").value,
    /Explainability coverage: unavailable/,
  );
  assert.match(
    evidenceFor(bridge, "Per-result input attribution").value,
    /was not returned/,
  );
});

test("does not calculate affinity differences across single and joint scopes", () => {
  const [bridge] = rank({
    resultsA: response([candidate("bridge-candidate", {
      affinity: 0.95,
      affinity_rank: 1,
      explainability: defaultExplainability,
    })]),
    jointResults: response([candidate("bridge-candidate", {
      affinity: 0.2,
      affinity_rank: 8,
      explainability: defaultExplainability,
    })]),
  });
  assert.ok(bridge);
  const comparison = evidenceFor(bridge, "Affinity by query scope").value;
  assert.match(comparison, /single_interest/);
  assert.match(comparison, /joint_interest/);
  assert.match(comparison, /not numerically compared or converted to deltas/);
  assert.doesNotMatch(comparison, /delta\s*=|difference\s*=/i);
});

test("returns no fabricated candidates for an empty joint result", () => {
  assert.deepEqual(rank({ jointResults: response() }), []);
});

test("attributes only positive explainability signals matching selected inputs", () => {
  const [bridge] = rank({
    jointResults: response([candidate("bridge-candidate", {
      affinity: 0.6,
      affinity_rank: 2,
      explainability: {
        "signal.interests.entities": [
          { entity_id: "input-a", score: 0.5 },
          { entity_id: "input-b", score: 0 },
          { entity_id: "unselected-input", score: 0.9 },
        ],
      },
    })]),
  });
  assert.ok(bridge);
  assert.equal(bridge.confidence, "medium");
  assert.match(
    evidenceFor(bridge, "Per-result input attribution").value,
    /Input A \(0.5\) only/,
  );
  assert.doesNotMatch(
    evidenceFor(bridge, "Per-result input attribution").value,
    /Input B|unselected-input/,
  );
});

test("adds exact selected-interest overlap with Jaccard and source entity IDs", () => {
  const [bridge] = rank({
    tasteAnalysis: {
      interestA: {
        success: true,
        results: {
          tags: [
            { tag_id: "genre:shared", name: "Shared", subtype: "urn:tag:genre:music" },
            { tag_id: "genre:a", name: "Only A", subtype: "urn:tag:genre:music" },
          ],
        },
      },
      interestB: {
        success: true,
        results: {
          tags: [
            { tag_id: "genre:shared", name: "Shared", subtype: "urn:tag:genre:music" },
            { tag_id: "genre:b", name: "Only B", subtype: "urn:tag:genre:music" },
          ],
        },
      },
    },
  });
  assert.ok(bridge);
  const evidence = evidenceFor(bridge, "Taste Analysis overlap · Shared input descriptors");
  assert.match(evidence.value, /genre:shared/);
  assert.match(evidence.value, /Jaccard similarity: 0\.333/);
  assert.match(evidence.source, /input-a/);
  assert.match(evidence.source, /input-b/);
});