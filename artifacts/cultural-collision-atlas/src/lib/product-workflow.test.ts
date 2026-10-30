import assert from "node:assert/strict";
import test from "node:test";
import {
  localityStatusForCandidate,
  rankBridgeCandidates,
} from "../../../api-server/src/lib/bridge-ranking.ts";
import { responseContainsCityLocality } from "../../../api-server/src/lib/qloo/entities.ts";
import { getSavedPlanDetails } from "./saved-plan-details.ts";
import {
  buildActivationPlanContent,
  buildActivationPlanSaveInput,
  buildDiscoverySaveInput,
  getSavedDiscoveryDetails,
  type ActivationPlanDraft,
} from "./product-workflow.ts";
import type {
  ActivationPlannerResponse,
  DiscoveryInput,
  DiscoveryResponse,
} from "@workspace/api-client-react";

const inputAId = "10000000-0000-4000-8000-000000000001";
const inputBId = "10000000-0000-4000-8000-000000000002";
const candidateId = "20000000-0000-4000-8000-000000000001";
const cityId = "30000000-0000-4000-8000-000000000001";
const caveat =
  "Aggregate evidence does not establish that the same individuals share both interests.";

test("deterministic discovery-save-plan-reopen workflow preserves evidence and caveats", () => {
  const localityResponse = {
    results: [
      {
        entity_id: cityId,
        properties: { place: "city", admin_level: 5 },
      },
    ],
  };
  assert.equal(responseContainsCityLocality(localityResponse, cityId), true);

  const ranked = rankBridgeCandidates({
    interestA: "Jazz",
    interestAId: inputAId,
    interestB: "Streetwear",
    interestBId: inputBId,
    recommendationType: "urn:entity:place",
    selectedCityEntityId: cityId,
    resultsA: {
      results: {
        entities: [
          {
            entity_id: candidateId,
            name: "Sample venue",
            query: { affinity: 0.61 },
          },
        ],
      },
    },
    resultsB: {
      results: {
        entities: [
          {
            entity_id: candidateId,
            name: "Sample venue",
            query: { affinity: 0.52 },
          },
        ],
      },
    },
    jointResults: {
      results: {
        entities: [
          {
            entity_id: candidateId,
            name: "Sample venue",
            tags: [],
            properties: { locality: { city: { entity_id: cityId } } },
            query: {
              affinity: 0.74,
              explainability: {
                "signal.interests.entities": [
                  { entity_id: inputAId, score: 0.6 },
                  { entity_id: inputBId, score: 0.4 },
                ],
              },
            },
          },
        ],
      },
    },
  });

  const candidate = ranked[0];
  assert.ok(candidate);
  assert.equal(
    localityStatusForCandidate("urn:entity:place", cityId, cityId),
    "matches_selected_city",
  );
  assert.equal(candidate.localityStatus, "matches_selected_city");
  assert.equal(candidate.confidence, "high");
  assert.match(candidate.explanation, /both supplied interests/);
  assert.match(candidate.explanation, /not proof that the same individuals/);
  assert.ok(
    candidate.evidence.some(
      (item) =>
        item.label === "Per-result input attribution" &&
        item.value.includes("Jazz") &&
        item.value.includes("Streetwear"),
    ),
  );

  const form: DiscoveryInput = {
    interestA: "Jazz",
    interestAId: inputAId,
    interestB: "Streetwear",
    interestBId: inputBId,
    city: "New York",
    cityEntityId: cityId,
    recommendationType: "urn:entity:place",
    activationType: "pop-up",
    budgetRange: "$5k-$10k",
    objective: "Test opt-in interest",
    audienceDescription: "Local self-identified fans",
  };
  const response: DiscoveryResponse = {
    source: "qloo_api",
    candidates: ranked,
    caveat,
    generatedAt: new Date("2026-10-22T12:00:00.000Z"),
  };
  const discoveryPayload = buildDiscoverySaveInput(form, response, candidate);

  const savedDiscoveries = new Map<number, typeof discoveryPayload>();
  savedDiscoveries.set(1, discoveryPayload);
  const reopenedDiscovery = getSavedDiscoveryDetails(
    savedDiscoveries.get(1)?.result,
  );
  assert.deepEqual(reopenedDiscovery.candidate, candidate);
  assert.equal(reopenedDiscovery.source, "qloo_api");
  assert.equal(reopenedDiscovery.caveat, caveat);
  assert.deepEqual(
    reopenedDiscovery.candidate?.evidence,
    discoveryPayload.result.selectedBridge.evidence,
  );

  const draft: ActivationPlanDraft = { form, candidate, response };
  const planContent = buildActivationPlanContent(draft);
  const planPayload = buildActivationPlanSaveInput(
    "New York cultural bridge",
    draft,
    planContent,
  );
  const savedPlans = new Map<number, typeof planPayload>();
  savedPlans.set(1, planPayload);
  const reopenedPlan = savedPlans.get(1);
  assert.ok(reopenedPlan);
  assert.equal(reopenedPlan.bridgeName, candidate.name);
  assert.deepEqual(
    [reopenedPlan.interestA, reopenedPlan.interestB],
    [form.interestA, form.interestB],
  );

  const reopenedPlanDetails = getSavedPlanDetails(reopenedPlan.plan);
  assert.deepEqual(reopenedPlanDetails.evidence, candidate.evidence);
  assert.equal(reopenedPlanDetails.source, response.source);
  assert.equal(reopenedPlanDetails.caveat, response.caveat);
  assert.deepEqual(reopenedPlanDetails.assumptions, planContent.assumptions);
  assert.equal(reopenedPlanDetails.budgetRange, form.budgetRange);
  assert.equal(
    reopenedPlanDetails.budgetStatus,
    "User-supplied planning input only; not a cost estimate or supplier quote.",
  );
  assert.equal(reopenedPlanDetails.strategySource, "deterministic_fallback");
  assert.equal("agent" in planPayload.plan, false);
  assert.ok(
    reopenedPlanDetails.sections.some((section) =>
      section.content.includes(
        "aggregate affinity evidence does not establish",
      ),
    ),
  );

  const strategy: ActivationPlannerResponse["strategy"] = {
    executiveSummary: "Test a co-created opt-in pilot; audience fit remains a hypothesis.",
    opportunity: "Explore a bridge suggested by aggregate Qloo Insights results.",
    targetAudience: {
      hypothesis: "People interested in either input may consider the pilot.",
      rationale: [{
        claim: "Qloo returned a candidate from the joint-interest request.",
        evidenceReferences: ["qloo-1-1"],
      }],
    },
    culturalInsights: [{
      insight: "The candidate appeared in the joint-interest recommendation results.",
      evidenceReferences: ["qloo-1-1"],
    }],
    campaignConcept: {
      name: "Culture in Common",
      narrative: "A participatory pop-up concept for audience testing.",
      creativeDirection: "Invite local contributors to shape an opt-in pilot.",
    },
    activationChannels: ["Small opt-in event"],
    partnershipCategories: ["Local cultural contributors"],
    executionTimeline: [{
      phase: "Validate",
      tasks: ["Test the concept with an opt-in sample."],
      deliverables: ["Document participant feedback."],
    }, {
      phase: "Pilot",
      tasks: ["Run only after permissions and costs are confirmed."],
      deliverables: ["Record agreed success metrics."],
    }],
    successMetrics: [{
      metric: "Participant-reported relevance",
      rationale: "Tests stated interest without forecasting attendance.",
      measurementMethod: "Use a post-experience participant survey.",
    }],
    risksAndAssumptions: [{
      category: "risk",
      statement: "The concept may not resonate with the intended audience.",
      mitigation: "Test before committing to production.",
    }],
    validationExperiments: [{
      experiment: "Opt-in concept test",
      method: "Show a neutral concept and ask participants for feedback.",
      decisionSignal: "Participant-reported relevance.",
    }],
  };
  const agentResult: ActivationPlannerResponse = {
    source: "ai_generated",
    caveat: "Aggregate Qloo evidence does not establish audience overlap.",
    strategy,
    userProvidedAssumptions: ["The budget range is user-provided, not a quote."],
    evidence: [
      {
        referenceId: "qloo-1-1",
        source: "qloo_api",
        kind: "insights",
        entityId: candidate.id,
        name: candidate.name,
        details: { affinity: 0.74 },
      },
    ],
  };
  const agentPlanPayload = buildActivationPlanSaveInput(
    "Agent-assisted plan",
    draft,
    planContent,
    agentResult,
  );
  assert.deepEqual(agentPlanPayload.plan.agent, agentResult);
  assert.deepEqual(agentPlanPayload.plan.strategy, strategy);
  assert.equal(agentPlanPayload.plan.strategySource, "ai_generated");
  assert.ok(agentPlanPayload.plan.sections.some((section) =>
    section.content.includes("qloo-1-1"),
  ));
  assert.equal(
    getSavedPlanDetails(agentPlanPayload.plan).strategySource,
    "ai_generated",
  );
  assert.deepEqual(
    getSavedPlanDetails(agentPlanPayload.plan).userProvidedAssumptions,
    ["The budget range is user-provided, not a quote."],
  );

  const olderPlan = getSavedPlanDetails({
    sections: [{ title: "Older plan", content: "No evidence was stored." }],
  });
  assert.deepEqual(olderPlan.evidence, []);
  assert.equal(olderPlan.caveat, null);
  assert.equal(olderPlan.budgetRange, null);
});
