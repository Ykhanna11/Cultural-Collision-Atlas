import assert from "node:assert/strict";
import test from "node:test";
import { rankBridgeCandidates } from "../bridge-ranking";
import {
  buildTasteAnalysisEvidence,
  loadTasteAnalysis,
} from "./taste-analysis";

const sharedTagId = "urn:tag:genre:brand:fashion";

function tasteResult(tagIds: string[]) {
  return {
    success: true,
    results: {
      tags: tagIds.map((tag_id) => ({ tag_id, name: tag_id.split(":").at(-1) })),
    },
  };
}

function evidenceFor(
  interestA: unknown,
  interestB: unknown,
  candidateTags: unknown = [{ id: sharedTagId, name: "Fashion" }],
) {
  return buildTasteAnalysisEvidence({
    candidateTags,
    interestA: "Input A",
    tasteAnalysisA: interestA,
    interestB: "Input B",
    tasteAnalysisB: interestB,
  });
}

test("reports exact tag matches separately for both inputs", () => {
  const evidence = evidenceFor(
    tasteResult([sharedTagId]),
    tasteResult([sharedTagId]),
  );

  assert.equal(evidence.length, 2);
  assert.match(evidence[0]?.value ?? "", /Input A/);
  assert.match(evidence[0]?.value ?? "", new RegExp(sharedTagId));
  assert.match(evidence[1]?.value ?? "", /Input B/);
  assert.match(evidence[1]?.value ?? "", new RegExp(sharedTagId));
});

test("reports a one-sided exact tag match without implying a match for the other input", () => {
  const evidence = evidenceFor(tasteResult([sharedTagId]), tasteResult([]));

  assert.match(evidence[0]?.value ?? "", /Exact matching tag IDs observed/);
  assert.match(evidence[1]?.value ?? "", /No exact tag-ID overlap observed/);
});

test("reports no observed overlap only when both tag lists are complete", () => {
  const evidence = evidenceFor(
    tasteResult(["urn:tag:genre:brand:other-a"]),
    tasteResult(["urn:tag:genre:brand:other-b"]),
    [{ id: sharedTagId, name: "Fashion" }],
  );

  assert.ok(evidence.every(({ value }) => value.includes("No exact tag-ID overlap observed")));
});

test("missing candidate or Taste Analysis tags are unavailable, not negative matches", () => {
  const missingCandidateTags = evidenceFor(
    tasteResult([sharedTagId]),
    tasteResult([sharedTagId]),
    null,
  );
  const missingTasteTags = evidenceFor(
    { success: true, results: {} },
    tasteResult([sharedTagId]),
  );

  assert.ok(missingCandidateTags.every(({ value }) => value.includes("unavailable or incomplete")));
  assert.match(missingTasteTags[0]?.value ?? "", /unavailable or incomplete/);
  assert.match(missingTasteTags[1]?.value ?? "", /Exact matching tag IDs observed/);
});

test("malformed responses and tag objects do not become negative matches", () => {
  const malformedStructure = evidenceFor(
    { results: { tags: [{ name: "Fashion" }] } },
    tasteResult([sharedTagId]),
    [{ id: sharedTagId }],
  );
  const rejectedResponse = evidenceFor(
    { success: false, results: { tags: [] } },
    tasteResult([sharedTagId]),
  );

  assert.ok(malformedStructure.every(({ value }) => value.includes("unavailable or incomplete")));
  assert.match(rejectedResponse[0]?.value ?? "", /unavailable or incomplete/);
});

test("Taste Analysis request failures remain optional and duplicate entity IDs are reused", async () => {
  const requestedIds: string[] = [];
  const results = await loadTasteAnalysis(
    ["input-a", "input-b", "input-a"],
    async (entityId) => {
      requestedIds.push(entityId);
      if (entityId === "input-a") throw new Error("API unavailable");
      return tasteResult([sharedTagId]);
    },
  );

  assert.deepEqual(requestedIds.sort(), ["input-a", "input-b"]);
  assert.ok(results[0]?.error instanceof Error);
  assert.deepEqual(results[0], results[2]);
  assert.deepEqual(results[1]?.payload, tasteResult([sharedTagId]));

  const input = {
    interestA: "Input A",
    interestAId: "input-a",
    interestB: "Input B",
    interestBId: "input-b",
    recommendationType: "urn:entity:brand" as const,
    resultsA: { results: { entities: [] } },
    resultsB: { results: { entities: [] } },
    jointResults: {
      results: {
        entities: [{
          entity_id: "candidate",
          name: "Candidate",
          tags: [],
          query: { affinity: 0.7 },
        }, {
          entity_id: "candidate-with-match",
          name: "Candidate with matching taste tag",
          tags: [{ id: sharedTagId, name: "Fashion" }],
          query: { affinity: 0.4 },
        }],
      },
    },
  };
  const withoutTaste = rankBridgeCandidates(input);
  const withFailedTaste = rankBridgeCandidates({
    ...input,
    tasteAnalysis: {
      interestA: results[0]?.payload,
      interestB: results[1]?.payload,
    },
  });

  assert.deepEqual(
    withFailedTaste.map(({ id, score, confidence }) => ({ id, score, confidence })),
    withoutTaste.map(({ id, score, confidence }) => ({ id, score, confidence })),
  );
  assert.match(
    withFailedTaste[0]?.evidence.find(({ label }) => label.includes("Input A"))?.value ?? "",
    /unavailable or incomplete/,
  );
});
