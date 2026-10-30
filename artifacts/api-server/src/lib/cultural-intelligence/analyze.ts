import type {
  AffinityScopeEvidence,
  GeographicAnalysisResponse,
} from "@workspace/api-zod";
import {
  compareQlooAffinityQueries,
  normalizeQlooAffinityQuery,
} from "./affinity";
import type {
  AffinityQueryContext,
  NormalizedAffinityEvidence,
} from "./evidence";
import type { GeographicIntelligenceSummary } from "./geographic";
import {
  attributedJointRecommendations,
  type CulturalOverlapResult,
} from "./overlap";
import { scoreOpportunityComponents } from "./opportunity-score";
import { compareTasteAnalysisInterests } from "../qloo/taste-analysis";
import type { CachedDiscoveryAnalysis } from "./analysis-cache";

type GeographicSummary = GeographicIntelligenceSummary;

export type UnifiedOpportunityAnalysis = NonNullable<
  GeographicAnalysisResponse["analysis"]
>;

function normalizedAffinityEvidence(
  context: CachedDiscoveryAnalysis,
  candidateId: string,
): {
  queries: ReturnType<typeof normalizeQlooAffinityQuery>[];
  comparison: ReturnType<typeof compareQlooAffinityQueries>;
  jointEvidence: NormalizedAffinityEvidence | null;
} {
  const queryContext = (
    requestReference: string,
    scope: AffinityQueryContext["scope"],
    inputEntityIds: string[],
  ): AffinityQueryContext => ({
    analysisReference: context.analysisReference,
    requestReference,
    scope,
    inputEntityIds,
    recommendationType: context.input.recommendationType,
    city: context.input.city,
    cityEntityId: context.input.cityEntityId,
    observedAt: context.createdAt,
  });
  const queries = [
    normalizeQlooAffinityQuery(
      context.resultsA,
      queryContext("single-interest-a", "single_interest", [context.input.interestAId]),
    ),
    normalizeQlooAffinityQuery(
      context.resultsB,
      queryContext("single-interest-b", "single_interest", [context.input.interestBId]),
    ),
    normalizeQlooAffinityQuery(
      context.jointResults,
      queryContext("joint-interest", "joint_interest", [
        context.input.interestAId,
        context.input.interestBId,
      ]),
    ),
  ];
  return {
    queries,
    comparison: compareQlooAffinityQueries(queries),
    jointEvidence:
      queries[2].evidence.find(({ candidate }) => candidate.entityId === candidateId) ?? null,
  };
}

function overlapFor(context: CachedDiscoveryAnalysis): CulturalOverlapResult {
  return compareTasteAnalysisInterests({
    interestA: context.input.interestA,
    interestAId: context.input.interestAId,
    tasteAnalysisA: context.tasteAnalysisA,
    interestB: context.input.interestB,
    interestBId: context.input.interestBId,
    tasteAnalysisB: context.tasteAnalysisB,
  });
}

function recommendationEvidenceReferences(
  candidateId: string,
  overlap: CulturalOverlapResult,
): string[] {
  return [
    `Qloo Insights API · ${candidateId}`,
    ...overlap.sourceReferences,
  ];
}

export function analyzeUnifiedOpportunity(input: {
  context: CachedDiscoveryAnalysis;
  candidateId: string;
  geography: GeographicSummary;
  venueReadiness?: { score: number; sourceReferences: string[] } | null;
}): UnifiedOpportunityAnalysis {
  const { context, candidateId, geography } = input;
  const candidate = context.candidates.find(({ id }) => id === candidateId);
  if (!candidate) throw new Error("Selected candidate does not belong to this analysis.");

  const { queries, jointEvidence } = normalizedAffinityEvidence(context, candidateId);
  const overlap = overlapFor(context);
  const scoreVector = scoreOpportunityComponents({
    jointAffinity: jointEvidence,
    overlap,
    geography,
    venueReadiness: input.venueReadiness ?? null,
  });
  const attributed = jointEvidence
    ? attributedJointRecommendations([jointEvidence])[0]
    : undefined;
  const evidenceReferences = recommendationEvidenceReferences(candidateId, overlap);
  const attributionText = attributed?.attribution === "both_selected_inputs"
    ? "Per-result explainability reports positive contributions from both selected inputs."
    : attributed?.attribution === "one_selected_input"
      ? "Per-result explainability reports a positive contribution from one selected input only."
      : "Per-result explainability did not verify a positive contribution from either selected input.";
  const recommendations: UnifiedOpportunityAnalysis["recommendations"] = [{
    id: `validate-${candidateId}`,
    kind: "cultural_validation",
    title: `Validate a concept around ${candidate.name}`,
    rationale:
      `Qloo returned this candidate for the joint-interest request. ${attributionText} ` +
      "Use an opt-in concept test before committing resources; aggregate recommendations do not demonstrate individual audience overlap.",
    evidenceReferences,
    limitations: [
      "This is a deterministic validation recommendation, not a campaign-success prediction.",
      "Shared descriptor tags and aggregate affinity do not prove that the same people have both interests.",
    ],
  }];

  for (const venue of geography.venues.records.slice(0, 5)) {
    recommendations.push({
      id: `evaluate-${venue.providerVenueId}`,
      kind: "venue_option",
      title: `Evaluate ${venue.name} as a venue option`,
      rationale:
        `This actual ${venue.provider} record was returned within the requested bounds` +
        `${venue.categories.length ? ` with categories ${venue.categories.join(", ")}` : ""}. Verify availability, permissions, capacity, accessibility, and costs directly.`,
      evidenceReferences: [
        `${venue.provider}:${venue.providerVenueId}`,
        venue.attribution,
      ],
      limitations: [
        "A returned provider record does not confirm current venue availability or event suitability.",
      ],
    });
  }

  const attributionCoverage = jointEvidence?.explainability.coverage ?? "unavailable";
  const jointAffinity = jointEvidence?.providerValues.affinity;
  const jointAffinityRank = jointEvidence?.providerValues.affinityRank;
  const queryStatuses = {
    interestA: queries[0].status,
    interestB: queries[1].status,
    joint: queries[2].status,
  };

  const scopeEvidence = (query: (typeof queries)[number]): AffinityScopeEvidence => {
    const evidence =
      query.evidence.find(({ candidate }) => candidate.entityId === candidateId) ?? null;
    const affinity = evidence?.providerValues.affinity;
    const affinityRank = evidence?.providerValues.affinityRank;

    return {
      queryStatus: query.status as AffinityScopeEvidence["queryStatus"],
      inputEntityIds: query.query.inputEntityIds,
      candidatePresence: evidence ? "returned" : "not_returned",
      affinityStatus: (affinity?.state ?? "unavailable") as AffinityScopeEvidence["affinityStatus"],
      affinity: affinity?.state === "returned" ? affinity.value : null,
      affinityRankStatus: (affinityRank?.state ?? "unavailable") as AffinityScopeEvidence["affinityRankStatus"],
      affinityRank: affinityRank?.state === "returned" ? affinityRank.value : null,
      sourceReference: evidence?.source.reference ?? "Qloo Insights API",
    };
  };

  return {
    version: "opportunity-analysis/1",
    analysisReference: context.analysisReference,
    candidateId,
    candidateName: candidate.name,
    affinity: {
      queryStatuses,
      interestAEvidence: scopeEvidence(queries[0]),
      interestBEvidence: scopeEvidence(queries[1]),
      jointAffinityStatus: jointAffinity?.state ?? "unavailable",
      jointAffinity: jointAffinity?.state === "returned" ? jointAffinity.value : null,
      jointAffinityRank:
        jointAffinityRank?.state === "returned" ? jointAffinityRank.value : null,
      attributionCoverage,
      inputAttributions: jointEvidence?.explainability.inputAttributions ?? [],
      sourceReference: jointEvidence?.source.reference ?? "Qloo Insights API",
    },
    overlap: {
      status: overlap.status,
      matchingTags: overlap.matchingTags.map((tag) => ({
        id: tag.id,
        interestAName: tag.leftName,
        interestBName: tag.rightName,
        classification: tag.classification,
      })),
      interestAOnlyTags: overlap.leftOnlyTags,
      interestBOnlyTags: overlap.rightOnlyTags,
      jaccard: {
        status: overlap.jaccard.status,
        value: overlap.jaccard.value,
        reason: overlap.jaccard.reason ?? null,
        intersectionSize: overlap.jaccard.intersectionSize,
        unionSize: overlap.jaccard.unionSize,
      },
      coverage: {
        interestA: overlap.coverage.leftStatus,
        interestB: overlap.coverage.rightStatus,
        interestATagCount: overlap.coverage.leftTagCount,
        interestBTagCount: overlap.coverage.rightTagCount,
        matchingTagCount: overlap.coverage.matchingTagCount,
      },
      sourceReferences: overlap.sourceReferences,
    },
    jointAttribution: {
      status: attributed ? "attributed" : "unavailable",
      matchedInputEntityIds: attributed?.matchedInputEntityIds ?? [],
      sourceReference: jointEvidence?.source.reference ?? "Qloo Insights API",
    },
    scores: scoreVector,
    recommendations,
  };
}