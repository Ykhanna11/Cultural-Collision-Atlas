import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActivationOpportunityCandidateSchema,
} from "@workspace/api-zod";
import type {
  ActivationOpportunityCandidate,
  ActivationOpportunitySuggestion,
  ActivationOpportunityVerifiedEvidence,
} from "@workspace/api-zod";

const validEvidence: ActivationOpportunityVerifiedEvidence[] = [
  {
    source: "Qloo Insights API",
    sourceReference: "Qloo Insights API · candidate-42",
    establishes: "Qloo returned the candidate for the joint-interest query and did not establish direct audience overlap.",
    category: "cultural_affinity",
  },
];

const validSuggestion: ActivationOpportunitySuggestion = {
  candidateAudienceHypothesis:
    "Hypothesis: visitors interested in the selected cultural bridge may respond to an opt-in experience.",
  culturalThemes: ["local craft culture", "community storytelling"],
  activationFormats: ["pop-up installation", "guided walkthrough"],
  supportingEvidenceReferences: ["Qloo Insights API · candidate-42"],
  note: "This is a hypothesis, not an observed audience fact.",
};

const validOpportunity: ActivationOpportunityCandidate = {
  id: "opportunity-42",
  title: "Bridge-led community pop-up",
  opportunityType: "cultural_bridge",
  rationale:
    "The selected bridge has Qloo evidence and local venue signal, but the actual audience fit still needs validation.",
  verifiedEvidence: validEvidence,
  inferredSuggestions: [validSuggestion],
  missingEvidence: [
    "No confirmed availability, costs, or footfall data were supplied for the venue.",
  ],
  limitations: [
    "This is not a forecast of attendance, conversion, or campaign impact.",
  ],
};

test("accepts a valid activation opportunity structure", () => {
  const parsed = ActivationOpportunityCandidateSchema.safeParse(validOpportunity);

  assert.equal(parsed.success, true);
  assert.equal(validOpportunity.id, "opportunity-42");
  assert.equal(validOpportunity.verifiedEvidence[0].category, "cultural_affinity");
  assert.equal(validOpportunity.inferredSuggestions[0].activationFormats[0], "pop-up installation");
  assert.deepEqual(validOpportunity.missingEvidence, [
    "No confirmed availability, costs, or footfall data were supplied for the venue.",
  ]);
});

test("keeps missing and incomplete evidence explicit without fabricating values", () => {
  const incomplete: ActivationOpportunityCandidate = {
    ...validOpportunity,
    verifiedEvidence: [],
    missingEvidence: [
      "Qloo heatmap coverage is unavailable for this city bounds.",
      "Venue availability is not yet confirmed.",
    ],
    limitations: [
      "No verified audience evidence is available for this opportunity.",
    ],
  };

  const parsed = ActivationOpportunityCandidateSchema.safeParse(incomplete);

  assert.equal(parsed.success, true);
  assert.equal(incomplete.verifiedEvidence.length, 0);
  assert.equal(incomplete.missingEvidence.length, 2);
  assert.ok(incomplete.limitations[0].includes("No verified audience evidence"));
});

test("separates inferred suggestions from verified evidence", () => {
  const suggestion = validOpportunity.inferredSuggestions[0];
  const misclassified = {
    ...validOpportunity,
    inferredSuggestions: "not-an-array",
  };

  assert.match(suggestion.candidateAudienceHypothesis, /Hypothesis:/);
  assert.equal(
    validOpportunity.verifiedEvidence.every((item) => !item.establishes.includes("Hypothesis")),
    true,
  );
  assert.equal(
    validOpportunity.inferredSuggestions.every((item) => item.note.toLowerCase().includes("hypothesis")),
    true,
  );
  assert.equal(ActivationOpportunityCandidateSchema.safeParse(misclassified).success, false);
});

test("accepts valid evidence references and rejects invalid ones", () => {
  const validWithEvidenceRefs: ActivationOpportunityCandidate = {
    ...validOpportunity,
    inferredSuggestions: [{
      ...validSuggestion,
      supportingEvidenceReferences: ["Qloo Insights API · candidate-42"],
    }],
  };

  const invalidRefs: ActivationOpportunityCandidate = {
    ...validOpportunity,
    inferredSuggestions: [{
      ...validSuggestion,
      supportingEvidenceReferences: ["Qloo Insights API · candidate-42", 42 as unknown as string],
    }],
  };

  assert.equal(ActivationOpportunityCandidateSchema.safeParse(validWithEvidenceRefs).success, true);
  assert.equal(ActivationOpportunityCandidateSchema.safeParse(invalidRefs).success, false);
  assert.deepEqual(validWithEvidenceRefs.inferredSuggestions[0].supportingEvidenceReferences, ["Qloo Insights API · candidate-42"]);
});

test("omits missing evidence references without fabricating identifiers", () => {
  const withMissingRefs: ActivationOpportunityCandidate = {
    ...validOpportunity,
    verifiedEvidence: [{
      ...validEvidence[0],
      sourceReference: undefined,
    }],
    inferredSuggestions: [{
      ...validSuggestion,
      supportingEvidenceReferences: [],
    }],
  };

  const parsed = ActivationOpportunityCandidateSchema.safeParse(withMissingRefs);

  assert.equal(parsed.success, true);
  assert.deepEqual(withMissingRefs.inferredSuggestions[0].supportingEvidenceReferences, []);
});
