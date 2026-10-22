import assert from "node:assert/strict";
import test from "node:test";
import { rankBridgeCandidates } from "../bridge-ranking";
import {
  buildTasteAnalysisEvidence,
  loadTasteAnalysis,
} from "./taste-analysis";

const sharedTagId = "urn:tag:genre:brand:fashion";

function tasteResult(tagIds: string[], subtype?: string) {
  return {
    success: true,
    results: {
      tags: tagIds.map((tag_id) => ({
        tag_id,
        name: tag_id.split(":").at(-1),
        ...(subtype ? { subtype } : {}),
      })),
    },
  };
}

function evidenceFor(
  interestA: unknown,
  interestB: unknown,
  candidateTags: unknown = [
    {
      id: sharedTagId,
      name: "Fashion",
      type: "urn:tag:genre:brand",
    },
  ],
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
    tasteResult([sharedTagId], "urn:tag:genre:brand"),
    tasteResult([sharedTagId], "urn:tag:genre:brand"),
  );

  assert.equal(evidence.length, 2);
  assert.match(evidence[0]?.label ?? "", /Input A/);
  assert.match(evidence[0]?.value ?? "", new RegExp(sharedTagId));
  assert.match(
    evidence[0]?.value ?? "",
    /Cultural\/domain tag overlap observed/,
  );
  assert.match(
    evidence[0]?.value ?? "",
    /Cultural\/domain evidence: "fashion" \/ candidate tag "Fashion"/,
  );
  assert.match(
    evidence[0]?.value ?? "",
    /not proof of a cultural relationship or shared audience/,
  );
  assert.match(evidence[1]?.label ?? "", /Input B/);
  assert.match(evidence[1]?.value ?? "", new RegExp(sharedTagId));
});

test("reports a one-sided exact tag match without implying a match for the other input", () => {
  const evidence = evidenceFor(
    tasteResult([sharedTagId], "urn:tag:genre:brand"),
    tasteResult([]),
  );

  assert.match(
    evidence[0]?.value ?? "",
    /Cultural\/domain tag overlap observed/,
  );
  assert.match(evidence[1]?.value ?? "", /No exact tag-ID overlap observed/);
});

test("classifies known generic operational subtypes separately", () => {
  const evidence = evidenceFor(
    tasteResult(
      ["urn:tag:credit_card:place:american_express"],
      "urn:tag:credit_card:place",
    ),
    tasteResult(
      ["urn:tag:cost_description:place:expensive"],
      "urn:tag:cost_description:place",
    ),
    [
      {
        id: "urn:tag:credit_card:place:american_express",
        name: "American Express",
        type: "urn:tag:credit_card:place",
      },
      {
        id: "urn:tag:cost_description:place:expensive",
        name: "Expensive",
        type: "urn:tag:cost_description:place",
      },
    ],
  );

  assert.match(
    evidence[0]?.value ?? "",
    /Generic operational attribute overlap observed/,
  );
  assert.match(
    evidence[0]?.value ?? "",
    /"american_express" \/ candidate tag "American Express" \(urn:tag:credit_card:place:american_express\)/,
  );
  assert.match(
    evidence[1]?.value ?? "",
    /Generic operational attributes: "expensive" \/ candidate tag "Expensive"/,
  );
});

test("leaves unknown subtype IDs unclassified", () => {
  const evidence = evidenceFor(
    tasteResult(["urn:tag:style:qloo:genre_bending"], "urn:tag:style:qloo"),
    tasteResult([]),
    [
      {
        id: "urn:tag:style:qloo:genre_bending",
        name: "Genre Bending",
        type: "urn:tag:style:qloo",
      },
    ],
  );

  assert.match(evidence[0]?.value ?? "", /Unclassified tag overlap observed/);
  assert.match(
    evidence[0]?.value ?? "",
    /Unclassified tags: "genre_bending" \/ candidate tag "Genre Bending"/,
  );
});

test("missing or conflicting subtype metadata remains unclassified", () => {
  const missingTasteSubtype = evidenceFor(
    tasteResult([sharedTagId]),
    tasteResult([]),
    [{ id: sharedTagId, name: "Fashion", type: "urn:tag:genre:brand" }],
  );
  const missingCandidateType = evidenceFor(
    tasteResult([sharedTagId], "urn:tag:genre:brand"),
    tasteResult([]),
    [{ id: sharedTagId, name: "Fashion" }],
  );
  const conflicting = evidenceFor(
    tasteResult([sharedTagId], "urn:tag:genre:brand"),
    tasteResult([]),
    [{ id: sharedTagId, name: "Fashion", type: "urn:tag:credit_card:place" }],
  );

  assert.match(
    missingTasteSubtype[0]?.value ?? "",
    /Unclassified tag overlap observed/,
  );
  assert.match(
    missingCandidateType[0]?.value ?? "",
    /Unclassified tag overlap observed/,
  );
  assert.match(
    conflicting[0]?.value ?? "",
    /Unclassified tag overlap observed/,
  );
});

test("reports no observed overlap only when both tag lists are complete", () => {
  const evidence = evidenceFor(
    tasteResult(["urn:tag:genre:brand:other-a"]),
    tasteResult(["urn:tag:genre:brand:other-b"]),
    [{ id: sharedTagId, name: "Fashion" }],
  );

  assert.ok(
    evidence.every(({ value }) =>
      value.includes("No exact tag-ID overlap observed"),
    ),
  );
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

  assert.ok(
    missingCandidateTags.every(({ value }) =>
      value.includes("unavailable or incomplete"),
    ),
  );
  assert.match(missingTasteTags[0]?.value ?? "", /unavailable or incomplete/);
  assert.match(
    missingTasteTags[1]?.value ?? "",
    /Unclassified tag overlap observed/,
  );
});

test("incomplete responses label any observed match as potentially partial", () => {
  const evidence = evidenceFor(
    {
      success: true,
      results: {
        tags: [
          {
            tag_id: sharedTagId,
            name: "Fashion",
            subtype: "urn:tag:genre:brand",
          },
          { name: "Malformed tag without an ID" },
        ],
      },
    },
    tasteResult([]),
  );

  assert.match(
    evidence[0]?.value ?? "",
    /Cultural\/domain tag overlap observed/,
  );
  assert.match(evidence[0]?.value ?? "", /list may be partial/);
});

test("malformed responses do not become negative matches", () => {
  const malformedStructure = evidenceFor(
    { results: { tags: [{ name: "Fashion" }] } },
    tasteResult([sharedTagId]),
    [{ id: sharedTagId, name: "Fashion" }],
  );
  const rejectedResponse = evidenceFor(
    { success: false, results: { tags: [] } },
    tasteResult([sharedTagId]),
  );

  assert.match(malformedStructure[0]?.value ?? "", /unavailable or incomplete/);
  assert.match(
    malformedStructure[1]?.value ?? "",
    /Unclassified tag overlap observed/,
  );
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

  const evidence = buildTasteAnalysisEvidence({
    candidateTags: [
      {
        id: sharedTagId,
        name: "Fashion",
        type: "urn:tag:genre:brand",
      },
    ],
    interestA: "Input A",
    tasteAnalysisA: results[0]?.payload,
    interestB: "Input B",
    tasteAnalysisB: results[1]?.payload,
  });
  assert.match(evidence[0]?.value ?? "", /unavailable or incomplete/);
  assert.match(evidence[1]?.value ?? "", /Unclassified tag overlap observed/);

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
        entities: [
          {
            entity_id: "candidate",
            name: "Candidate",
            tags: [],
            query: { affinity: 0.7 },
          },
          {
            entity_id: "candidate-with-match",
            name: "Candidate with matching taste tag",
            tags: [{ id: sharedTagId, name: "Fashion" }],
            query: { affinity: 0.4 },
          },
        ],
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
    withFailedTaste.map(({ id, score, confidence }) => ({
      id,
      score,
      confidence,
    })),
    withoutTaste.map(({ id, score, confidence }) => ({
      id,
      score,
      confidence,
    })),
  );
  assert.match(
    withFailedTaste[0]?.evidence.find(({ label }) => label.includes("Input A"))
      ?.value ?? "",
    /unavailable or incomplete/,
  );
});
