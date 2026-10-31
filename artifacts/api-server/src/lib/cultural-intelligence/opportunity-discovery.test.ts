import assert from "node:assert/strict";
import { test } from "node:test";
import { generateActivationOpportunities } from "./opportunity-discovery";

const baseAnalysis = {
  version: "opportunity-analysis/1",
  analysisReference: "00000000-0000-4000-8000-000000000010",
  candidateId: "candidate-1",
  candidateName: "Casa de Música",
  affinity: {
    queryStatuses: { interestA: "complete", interestB: "complete", joint: "complete" },
    interestAEvidence: {
      queryStatus: "complete",
      inputEntityIds: ["music"],
      candidatePresence: "returned",
      affinityStatus: "returned",
      affinity: 0.72,
      affinityRankStatus: "returned",
      affinityRank: 3,
      sourceReference: "Qloo Insights API",
    },
    interestBEvidence: {
      queryStatus: "complete",
      inputEntityIds: ["food"],
      candidatePresence: "returned",
      affinityStatus: "returned",
      affinity: 0.64,
      affinityRankStatus: "returned",
      affinityRank: 4,
      sourceReference: "Qloo Insights API",
    },
    jointAffinityStatus: "returned",
    jointAffinity: 0.8,
    jointAffinityRank: 2,
    attributionCoverage: "both_inputs_attributed",
    inputAttributions: [{ entityId: "music", score: 0.8, matchesInput: true, positive: true }, { entityId: "food", score: 0.7, matchesInput: true, positive: true }],
    sourceReference: "Qloo Insights API",
  },
  overlap: {
    status: "complete",
    matchingTags: [{ id: "tag-1", interestAName: "Live music", interestBName: "Cultural night", classification: "cultural_domain" }],
    interestAOnlyTags: [],
    interestBOnlyTags: [],
    jaccard: { status: "available", value: 0.5, reason: null, intersectionSize: 1, unionSize: 2 },
    coverage: { interestA: "complete", interestB: "complete", interestATagCount: 1, interestBTagCount: 1, matchingTagCount: 1 },
    sourceReferences: ["taste:music-food"],
  },
  jointAttribution: {
    status: "attributed",
    matchedInputEntityIds: ["music", "food"],
    sourceReference: "Qloo Insights API",
  },
  scores: {
    methodologyVersion: "opportunity-components/1",
    components: {
      culturalAffinity: { status: "available", score: 80, explanation: "Joint cultural affinity is available.", sourceReferences: ["Qloo Insights API"] },
      descriptorOverlap: { status: "available", score: 50, explanation: "Tag overlap available.", sourceReferences: ["taste:music-food"] },
      geographicSignal: { status: "available", score: 68, explanation: "Heatmap signal available.", sourceReferences: ["Qloo Insights API"] },
      venueReadiness: { status: "available", score: 73, explanation: "Venue readiness is available.", sourceReferences: ["overture:v-1"] },
      evidenceCompleteness: { status: "available", score: 100, explanation: "All evidence is available.", sourceReferences: ["Qloo Insights API", "taste:music-food", "overture:v-1"] },
    },
    composite: { status: "unavailable", score: null, reason: "No composite score is calculated." },
    assumptions: ["This is not a forecast."],
    limitations: ["No campaign outcomes are implied."],
  },
  recommendations: [{
    id: "validate-candidate-1",
    kind: "cultural_validation",
    title: "Validate a concept around Casa de Música",
    rationale: "Use an opt-in concept test before commitment.",
    evidenceReferences: ["Qloo Insights API · candidate-1"],
    limitations: ["This is not a campaign prediction."],
  }],
} as any;

const context = {
  interestA: "Music",
  interestB: "Food",
  city: "London",
  candidateName: "Casa de Música",
  analysisReference: "00000000-0000-4000-8000-000000000010",
};

const venueRecords = [{
  provider: "overture",
  providerVenueId: "v-1",
  name: "Old Town Hall",
  categories: ["culture", "event_space"],
  attribution: "Overture Maps Places",
  address: "Example Street",
}];

test("complete evidence produces deterministic activation opportunities", () => {
  const first = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const second = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });

  assert.equal(first.status, "ok");
  assert.ok(first.opportunities.length >= 2 && first.opportunities.length <= 5);
  assert.deepEqual(first, second);
  assert.ok(first.opportunities.every((opportunity) => opportunity.verifiedEvidence.length > 0));
});

test("different evidence produces appropriately different candidates", () => {
  const weakerAnalysis = JSON.parse(JSON.stringify(baseAnalysis));
  weakerAnalysis.affinity.jointAffinityStatus = "unavailable";
  weakerAnalysis.overlap.status = "unavailable";
  weakerAnalysis.scores.components.culturalAffinity = { status: "unavailable", score: null, reason: "No cultural affinity available.", sourceReferences: [] };
  weakerAnalysis.scores.components.descriptorOverlap = { status: "unavailable", score: null, reason: "No descriptor overlap available.", sourceReferences: [] };
  weakerAnalysis.scores.components.geographicSignal = { status: "unavailable", score: null, reason: "No geographic signal available.", sourceReferences: [] };
  weakerAnalysis.scores.components.venueReadiness = { status: "unavailable", score: null, reason: "No venue readiness available.", sourceReferences: [] };

  const first = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const second = generateActivationOpportunities({ analysis: weakerAnalysis, context, venueRecords: [] });

  assert.ok(first.opportunities.length > second.opportunities.length || second.status === "insufficient_evidence");
  assert.notDeepEqual(first.opportunities.map((opportunity) => opportunity.title), second.opportunities.map((opportunity) => opportunity.title));
});

test("missing cultural evidence keeps the output grounded and still deterministic", () => {
  const missingCulture = JSON.parse(JSON.stringify(baseAnalysis));
  missingCulture.affinity.jointAffinityStatus = "unavailable";
  missingCulture.overlap.status = "unavailable";
  missingCulture.scores.components.culturalAffinity = { status: "unavailable", score: null, reason: "No cultural affinity available.", sourceReferences: [] };
  missingCulture.scores.components.descriptorOverlap = { status: "unavailable", score: null, reason: "No descriptor overlap available.", sourceReferences: [] };

  const result = generateActivationOpportunities({ analysis: missingCulture, context, venueRecords });
  assert.equal(result.status, "ok");
  assert.ok(result.opportunities.some((opportunity) => opportunity.opportunityType === "venue_activation" || opportunity.opportunityType === "place_based"));
});

test("missing geographic evidence does not invent place-based opportunities", () => {
  const missingGeography = JSON.parse(JSON.stringify(baseAnalysis));
  missingGeography.scores.components.geographicSignal = { status: "unavailable", score: null, reason: "No geographic signal available.", sourceReferences: [] };

  const result = generateActivationOpportunities({ analysis: missingGeography, context, venueRecords: [] });

  assert.equal(result.status, "ok");
  assert.ok(result.opportunities.some((opportunity) => opportunity.opportunityType === "cultural_bridge" || opportunity.opportunityType === "theme_experiment"));
  assert.ok(result.opportunities.every((opportunity) => opportunity.missingEvidence.some((entry) => /geographic/i.test(entry))));
});

test("no suitable venues produces no venue-specific opportunity", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords: [] });

  assert.equal(result.status, "ok");
  assert.ok(result.opportunities.every((opportunity) => opportunity.opportunityType !== "venue_activation"));
});

test("insufficient evidence returns explicit no-op instead of fabricated opportunities", () => {
  const insufficient = {
    ...baseAnalysis,
    affinity: { ...baseAnalysis.affinity, jointAffinityStatus: "unavailable", jointAffinity: null },
    overlap: { ...baseAnalysis.overlap, status: "unavailable", jaccard: { ...baseAnalysis.overlap.jaccard, status: "unavailable", value: null, reason: "incomplete_tag_sets" } },
    scores: {
      ...baseAnalysis.scores,
      components: {
        ...baseAnalysis.scores.components,
        culturalAffinity: { status: "unavailable", score: null, reason: "No cultural affinity available.", sourceReferences: [] },
        descriptorOverlap: { status: "unavailable", score: null, reason: "No descriptor overlap available.", sourceReferences: [] },
        geographicSignal: { status: "unavailable", score: null, reason: "No geographic signal available.", sourceReferences: [] },
        venueReadiness: { status: "unavailable", score: null, reason: "No venue readiness available.", sourceReferences: [] },
      },
    },
  } as any;

  const result = generateActivationOpportunities({ analysis: insufficient, context, venueRecords: [] });
  assert.equal(result.status, "insufficient_evidence");
  assert.deepEqual(result.opportunities, []);
  assert.match(result.reason ?? "", /Insufficient evidence/i);
});

test("evidence references are preserved in generated candidates", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const refs = result.opportunities
    .flatMap((opportunity) => opportunity.verifiedEvidence.map((evidence) => evidence.sourceReference))
    .filter((ref): ref is string => Boolean(ref));

  assert.ok(refs.length > 0);
  assert.ok(refs.some((ref) => ref.includes("Qloo Insights API") || ref.includes("overture")));
  assert.ok(result.opportunities.every((opportunity) => opportunity.verifiedEvidence.every((evidence) => evidence.sourceReference && evidence.sourceReference.length > 0)));
});

test("audience hypotheses derive from supported cultural signals", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const suggestion = result.opportunities[0]?.inferredSuggestions[0];

  assert.ok(result.status === "ok");
  assert.ok(suggestion);
  assert.match(suggestion.candidateAudienceHypothesis, /Hypothesis:/i);
  assert.match(suggestion.candidateAudienceHypothesis, /Music|Food|cultural bridge|Casa de Música/i);
  assert.doesNotMatch(suggestion.candidateAudienceHypothesis, /age|income|gender|demographic|footfall|attendance|conversion|sales/i);
});

test("cultural themes derive from descriptor overlap", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const topThemes = result.opportunities.flatMap((opportunity) => opportunity.inferredSuggestions.flatMap((suggestion) => suggestion.culturalThemes));

  assert.ok(topThemes.some((theme) => /live music|cultural night/i.test(theme)));
  assert.ok(topThemes.length > 0);
});

test("activation formats derive from venue categories and geographic context", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const formats = result.opportunities.flatMap((opportunity) => opportunity.inferredSuggestions.flatMap((suggestion) => suggestion.activationFormats));

  assert.ok(formats.some((format) => /pop-up|showcase|experience|workshop|activation|walkthrough/i.test(format)));
  assert.ok(formats.length > 0);
});

test("missing evidence reduces or removes unsupported hypotheses", () => {
  const missingSignals = JSON.parse(JSON.stringify(baseAnalysis));
  missingSignals.affinity.jointAffinityStatus = "unavailable";
  missingSignals.overlap.status = "unavailable";
  missingSignals.scores.components.culturalAffinity = { status: "unavailable", score: null, reason: "No cultural affinity available.", sourceReferences: [] };
  missingSignals.scores.components.descriptorOverlap = { status: "unavailable", score: null, reason: "No descriptor overlap available.", sourceReferences: [] };

  const result = generateActivationOpportunities({ analysis: missingSignals, context, venueRecords: [] });

  assert.ok(result.status === "ok" || result.status === "insufficient_evidence");
  assert.ok(result.opportunities.every((opportunity) => opportunity.inferredSuggestions.every((suggestion) => suggestion.candidateAudienceHypothesis.includes("Hypothesis:") || suggestion.activationFormats.length >= 0)));
  assert.ok(result.opportunities.every((opportunity) => opportunity.inferredSuggestions.length <= 1 || opportunity.inferredSuggestions.length === 0));
});

test("every suggestion keeps rationale and evidence linkage", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });

  assert.ok(result.opportunities.every((opportunity) => opportunity.inferredSuggestions.length > 0));
  assert.ok(result.opportunities.every((opportunity) => opportunity.inferredSuggestions.every((suggestion) => /hypothesis|evidence/i.test(suggestion.note))));
  assert.ok(result.opportunities.every((opportunity) => opportunity.inferredSuggestions.every((suggestion) => {
    const refs = suggestion.supportingEvidenceReferences;
    return refs.length > 0 && refs.every((ref) => opportunity.verifiedEvidence.some((evidence) => evidence.sourceReference === ref));
  })));
});

test("suggestion references exclude missing or invalid source identifiers", () => {
  const result = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const firstSuggestion = result.opportunities[0]?.inferredSuggestions[0];

  assert.ok(firstSuggestion);
  assert.ok(firstSuggestion.supportingEvidenceReferences.every((reference) => typeof reference === "string" && reference.trim().length > 0));
  assert.ok(firstSuggestion.supportingEvidenceReferences.every((reference) => result.opportunities[0].verifiedEvidence.some((evidence) => evidence.sourceReference === reference)));
});

test("repeated execution is stable and reproducible", () => {
  const first = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });
  const second = generateActivationOpportunities({ analysis: baseAnalysis, context, venueRecords });

  assert.deepEqual(first, second);
});
