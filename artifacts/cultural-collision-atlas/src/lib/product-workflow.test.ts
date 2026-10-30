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
  buildActivationPlanExportPayload,
  buildActivationPlanSaveInput,
  buildDiscoverySaveInput,
  getSavedDiscoveryDetails,
  isGeographicAnalysisSnapshot,
  type GeographicAnalysisSnapshot,
  type ActivationPlanDraft,
} from "./product-workflow.ts";
import { getStaleAnalysisNotice, isStaleAnalysisFailure } from "./stale-analysis.ts";
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

test("stale analysis errors and context mismatches are distinguished from transient API failures", () => {
  const staleReferenceError = {
    status: 410,
    message: "The Discovery analysis reference expired or is unavailable. Run Discovery again.",
  };
  const staleCandidateError = {
    status: 400,
    data: { error: "The selected bridge does not belong to this Discovery analysis." },
  };
  const transientError = {
    status: 503,
    message: "The Qloo API is temporarily unavailable.",
  };
  const validContext = {
    analysisReference: "analysis-ref-1",
    city: "London",
    entityId: "candidate-1",
    candidateName: "Bridge candidate",
  };

  assert.equal(isStaleAnalysisFailure(staleReferenceError), true);
  assert.equal(isStaleAnalysisFailure(staleCandidateError), true);
  assert.equal(isStaleAnalysisFailure(transientError), false);
  assert.equal(getStaleAnalysisNotice({
    analysisContext: validContext,
    city: "London",
    entityId: "candidate-1",
    error: transientError,
  }), null);
  assert.match(getStaleAnalysisNotice({
    analysisContext: validContext,
    city: "Paris",
    entityId: "candidate-1",
    error: null,
  }) ?? "", /Run Discovery again/i);
  assert.match(getStaleAnalysisNotice({
    analysisContext: validContext,
    city: "London",
    entityId: "candidate-2",
    error: null,
  }) ?? "", /Run Discovery again/i);
  assert.match(getStaleAnalysisNotice({
    analysisContext: validContext,
    city: "London",
    entityId: "candidate-1",
    error: staleReferenceError,
  }) ?? "", /Run Discovery again/i);
});

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
    analysisReference: "00000000-0000-4000-8000-000000000001",
    source: "qloo_api",
    candidates: ranked,
    caveat,
    generatedAt: new Date("2026-10-22T12:00:00.000Z"),
  };
  const geographicAnalysis: GeographicAnalysisSnapshot = {
    version: "geographic-intelligence/1",
    analysisReference: "00000000-0000-4000-8000-000000000001",
    city: form.city,
    entityId: candidate.id,
    summary: {
      requestedBounds: { south: 40.7, west: -74.1, north: 40.8, east: -73.9 },
      observedBounds: null,
      heatmap: {
        status: "returned",
        source: "Qloo Insights API",
        pointCount: 1,
        duplicateCount: 0,
        invalidCoordinateCount: 0,
        points: [{ latitude: 40.75, longitude: -74, affinity: 0.62 }],
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
      overtureCoverage: {
        status: "covered",
        bounds: { south: 40.6, west: -74.2, north: 40.9, east: -73.8 },
      },
      coverage: "complete",
      sourceSeparation: "Qloo signals and venues are separate entities.",
    },
    analysis: {
      version: "opportunity-analysis/1",
      analysisReference: "00000000-0000-4000-8000-000000000001",
      candidateId: candidate.id,
      candidateName: candidate.name,
      affinity: {
        queryStatuses: { interestA: "complete", interestB: "complete", joint: "complete" },
        jointAffinityStatus: "returned",
        jointAffinity: 0.74,
        jointAffinityRank: 1,
        attributionCoverage: "both_inputs_attributed",
        inputAttributions: [],
        sourceReference: "Qloo Insights API",
      },
      overlap: {
        status: "complete",
        matchingTags: [],
        interestAOnlyTags: [],
        interestBOnlyTags: [],
        jaccard: { status: "available", value: 0, reason: null, intersectionSize: 0, unionSize: 2 },
        coverage: { interestA: "complete", interestB: "complete", interestATagCount: 1, interestBTagCount: 1, matchingTagCount: 0 },
        sourceReferences: ["taste:a", "taste:b"],
      },
      jointAttribution: {
        status: "attributed",
        matchedInputEntityIds: [inputAId, inputBId],
        sourceReference: "Qloo Insights API",
      },
      scores: {
        methodologyVersion: "opportunity-components/1",
        components: {
          culturalAffinity: { status: "available", score: 74, explanation: "Joint affinity scaled for display only.", sourceReferences: ["Qloo Insights API"] },
          descriptorOverlap: { status: "available", score: 0, explanation: "Exact tag-ID Jaccard scaled for display.", sourceReferences: ["taste:a", "taste:b"] },
          geographicSignal: { status: "available", score: 62, explanation: "Mean returned heatmap affinity.", sourceReferences: ["Qloo Insights API"] },
          venueReadiness: { status: "unavailable", score: null, reason: "No venue assessment attached.", sourceReferences: [] },
          evidenceCompleteness: { status: "available", score: 75, explanation: "Three of four components available.", sourceReferences: ["Qloo Insights API"] },
        },
        composite: { status: "unavailable", score: null, reason: "No approved weights." },
        assumptions: [],
        limitations: ["No campaign outcomes are predicted."],
      },
      recommendations: [{
        id: `validate-${candidate.id}`,
        kind: "cultural_validation",
        title: "Validate the bridge concept",
        rationale: "An opt-in test is a hypothesis.",
        evidenceReferences: ["Qloo Insights API"],
        limitations: ["Aggregate evidence is not individual overlap."],
      }],
    },
  };
  const discoveryPayload = buildDiscoverySaveInput(
    form,
    response,
    candidate,
    [],
    {},
    geographicAnalysis,
  );

  const savedDiscoveries = new Map<number, typeof discoveryPayload>();
  savedDiscoveries.set(1, discoveryPayload);
  const reopenedDiscovery = getSavedDiscoveryDetails(
    savedDiscoveries.get(1)?.result,
  );
  assert.deepEqual(reopenedDiscovery.candidate, candidate);
  assert.equal(reopenedDiscovery.source, "qloo_api");
  assert.equal(reopenedDiscovery.caveat, caveat);
  assert.deepEqual(reopenedDiscovery.input, form);
  assert.equal(reopenedDiscovery.analysisReference, response.analysisReference);
  assert.deepEqual(reopenedDiscovery.geographicAnalysis, geographicAnalysis);
  assert.deepEqual(
    reopenedDiscovery.candidate?.evidence,
    discoveryPayload.result.selectedBridge.evidence,
  );

  const draft: ActivationPlanDraft = {
    form,
    candidate,
    response,
    geographicAnalysis,
    venue: {
      providerVenueId: "node-123",
      name: "Community Hall",
      address: "1 Main Street",
      latitude: 40.71,
      longitude: -74.01,
      categories: ["culture"],
      attribution: "© OpenStreetMap contributors, ODbL",
    },
    venueSuitability: {
      score: 65,
      scoreLabel: "Operational data completeness and category fit",
      explanation: "Venue facts are provider sourced; cultural relevance is unverified.",
      evidence: [{ kind: "venue_fact", label: "Venue category", value: "culture" }],
      missingData: ["Website unavailable"],
    },
  };
  const planContent = buildActivationPlanContent(draft);
  assert.deepEqual(planContent.geographicAnalysis, geographicAnalysis);
  assert.ok(planContent.sections.some(({ title }) => title.startsWith("Geographic evidence")));
  assert.match(
    planContent.sections.find(({ title }) => title.startsWith("Geographic evidence"))?.content ?? "",
    /Validate the bridge concept/,
  );
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
  const exportPayload = buildActivationPlanExportPayload(
    "New York cultural bridge",
    draft,
    planContent,
  );
  assert.deepEqual(
    exportPayload.plan.selectedVenue,
    planPayload.plan.selectedVenue,
  );
  assert.deepEqual(exportPayload.plan.geographicAnalysis, geographicAnalysis);
  assert.equal(isGeographicAnalysisSnapshot(geographicAnalysis, "unrelated-entity"), false);
  assert.equal(isGeographicAnalysisSnapshot({
    ...geographicAnalysis,
    analysis: { ...geographicAnalysis.analysis, candidateId: "unrelated-entity" },
  }, candidate.id), false);
  assert.equal(
    exportPayload.plan.selectedVenue.suitability.evidence[0]?.label,
    "Venue category",
  );

  const multiVenueDraft: ActivationPlanDraft = {
    ...draft,
    venues: [
      {
        provider: "overture",
        providerVenueId: "overture-one",
        name: "Community Hall",
        address: "1 Main Street",
        latitude: 51.5,
        longitude: -0.1,
        categories: ["culture", "event_space"],
        website: "https://example.test/venue",
        attribution: "Overture Maps Places, fixture release.",
        sourceMetadata: {
          basicCategory: "event_venue",
          taxonomy: ["event_venue", "community_centre"],
          sources: [{ dataset: "Microsoft", license: "CDLA-Permissive-2.0", recordId: "source-1" }],
        },
      },
      {
        provider: "overture",
        providerVenueId: "overture-two",
        name: "Design Museum",
        latitude: 51.51,
        longitude: -0.11,
        categories: ["museum", "culture"],
        attribution: "Overture Maps Places, fixture release.",
      },
    ],
  };
  const discoveryWithVenues = buildDiscoverySaveInput(
    form,
    response,
    candidate,
    multiVenueDraft.venues,
    {
      "overture-one": {
        score: 70,
        scoreLabel: "Operational data completeness; not cultural relevance",
        explanation: "Category and source details are available.",
        evidence: [{ kind: "venue_fact", label: "Venue category", value: "event venue" }],
        missingData: ["Hours not provided"],
      },
    },
  );
  const reopenedDiscoveryWithVenues = getSavedDiscoveryDetails(discoveryWithVenues.result);
  assert.deepEqual(reopenedDiscoveryWithVenues.venues.map((venue) => venue.providerVenueId), ["overture-one", "overture-two"]);
  assert.equal(reopenedDiscoveryWithVenues.venues[0].sourceMetadata?.sources?.[0]?.recordId, "source-1");
  assert.equal(reopenedDiscoveryWithVenues.venues[0].suitability?.score, 70);

  const multiVenueContent = buildActivationPlanContent(multiVenueDraft);
  const multiVenueSaved = buildActivationPlanSaveInput("Two venue options", multiVenueDraft, multiVenueContent);
  const multiVenueExport = JSON.parse(JSON.stringify(buildActivationPlanExportPayload(
    "Two venue options",
    multiVenueDraft,
    multiVenueContent,
  ))) as ReturnType<typeof buildActivationPlanExportPayload>;
  assert.deepEqual(multiVenueSaved.plan.selectedVenues?.map((venue) => venue.providerVenueId), ["overture-one", "overture-two"]);
  assert.equal(multiVenueSaved.plan.selectedVenue.providerVenueId, "overture-one");
  assert.equal(multiVenueExport.plan.selectedVenues?.[0]?.sourceMetadata?.sources?.[0]?.recordId, "source-1");
  assert.equal(getSavedPlanDetails(multiVenueExport.plan).selectedVenues.length, 2);
  assert.match(multiVenueContent.sections.find((section) => section.title === "Venue options")?.content ?? "", /Design Museum/);

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
    section.title.includes("Selected venue") &&
    section.content.includes("node-123") &&
    section.content.includes("Community Hall") &&
    section.content.includes("OpenStreetMap contributors"),
  ));
  assert.equal(agentPlanPayload.plan.selectedVenue.providerVenueId, "node-123");
  assert.equal(agentPlanPayload.plan.selectedVenue.suitability.score, 65);
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
