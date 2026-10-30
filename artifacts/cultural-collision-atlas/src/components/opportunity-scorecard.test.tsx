import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeographicAnalysisResponse } from "@workspace/api-client-react";
import { OpportunityScorecard } from "./opportunity-scorecard";

type Analysis = NonNullable<GeographicAnalysisResponse["analysis"]>;

const analysis: Analysis = {
  version: "opportunity-analysis/1",
  analysisReference: "00000000-0000-4000-8000-000000000001",
  candidateId: "candidate-1",
  candidateName: "Bridge",
  affinity: {
    queryStatuses: { interestA: "complete", interestB: "partial", joint: "partial" },
    interestAEvidence: {
      queryStatus: "complete",
      inputEntityIds: ["interest-a-id"],
      candidatePresence: "returned",
      affinityStatus: "returned",
      affinity: 0.6,
      affinityRankStatus: "returned",
      affinityRank: 3,
      sourceReference: "Qloo Insights API",
    },
    interestBEvidence: {
      queryStatus: "partial",
      inputEntityIds: ["interest-b-id"],
      candidatePresence: "returned",
      affinityStatus: "returned",
      affinity: 0.4,
      affinityRankStatus: "returned",
      affinityRank: 5,
      sourceReference: "Qloo Insights API",
    },
    jointAffinityStatus: "returned",
    jointAffinity: 0.72,
    jointAffinityRank: 4,
    attributionCoverage: "one_input_attributed",
    inputAttributions: [],
    sourceReference: "Qloo Insights API",
  },
  overlap: {
    status: "partial",
    matchingTags: [{ id: "tag-shared", interestAName: "Music", interestBName: "Music", classification: "cultural_domain" }],
    interestAOnlyTags: [{ id: "tag-a", name: "Jazz", classification: "cultural_domain" }],
    interestBOnlyTags: [{ id: "tag-b", name: "Books", classification: "cultural_domain" }],
    jaccard: { status: "unavailable", value: null, reason: "incomplete_tag_sets", intersectionSize: 1, unionSize: 3 },
    coverage: { interestA: "complete", interestB: "partial", interestATagCount: 2, interestBTagCount: 2, matchingTagCount: 1 },
    sourceReferences: ["Qloo Taste Analysis · a", "Qloo Taste Analysis · b"],
  },
  jointAttribution: { status: "attributed", matchedInputEntityIds: ["a"], sourceReference: "Qloo Insights API" },
  scores: {
    methodologyVersion: "opportunity-components/1",
    components: {
      culturalAffinity: { status: "available", score: 72, explanation: "Joint affinity scaled for display only.", sourceReferences: ["Qloo Insights API"] },
      descriptorOverlap: { status: "unavailable", score: null, reason: "Tag coverage is partial.", sourceReferences: ["taste-a", "taste-b"] },
      geographicSignal: { status: "available", score: 60, explanation: "Mean of returned heatmap affinity values.", sourceReferences: ["Qloo Insights API"] },
      venueReadiness: { status: "unavailable", score: null, reason: "Select a venue and request its existing suitability assessment.", sourceReferences: [] },
      evidenceCompleteness: { status: "available", score: 50, explanation: "Two of four inputs available.", sourceReferences: ["Qloo Insights API"] },
    },
    composite: { status: "unavailable", score: null, reason: "No approved weights." },
    assumptions: [],
    limitations: ["No campaign outcomes are predicted."],
  },
  recommendations: [{
    id: "validate-candidate-1",
    kind: "cultural_validation",
    title: "Validate a concept around Bridge",
    rationale: "An opt-in test is a hypothesis, not a campaign forecast.",
    evidenceReferences: ["Qloo Insights API · candidate-1"],
    limitations: ["Aggregate affinity is not individual overlap."],
  }],
};

test("renders independent scores, missing states, shared/distinct tags, and deterministic recommendations", () => {
  const markup = renderToStaticMarkup(<OpportunityScorecard analysis={analysis} />);
  assert.match(markup, /Cultural affinity/);
  assert.match(markup, /72/);
  assert.match(markup, /Venue operational readiness/);
  assert.match(markup, /Unavailable/);
  assert.match(markup, /Interest A only/);
  assert.match(markup, /Interest B only/);
  assert.match(markup, /Jaccard/);
  assert.match(markup, /Validate a concept around Bridge/);
  assert.match(markup, /No composite opportunity score/);
  assert.doesNotMatch(markup, /Overall opportunity score/);
});

test("shows an explicit state before unified analysis is available", () => {
  const markup = renderToStaticMarkup(<OpportunityScorecard />);
  assert.match(markup, /Run a bounded analysis/);
  assert.match(markup, /No composite score is calculated/);
});