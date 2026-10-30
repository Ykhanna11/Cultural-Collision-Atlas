import type { NormalizedAffinityEvidence } from "./evidence";
import type { CulturalOverlapResult } from "./overlap";
import type { GeographicIntelligenceSummary } from "./geographic";

export const OPPORTUNITY_METHODOLOGY_VERSION = "opportunity-components/1";

export type OpportunityComponent =
  | {
      status: "available";
      score: number;
      explanation: string;
      sourceReferences: string[];
    }
  | {
      status: "unavailable";
      score: null;
      reason: string;
      sourceReferences: string[];
    };

export interface OpportunityComponentVector {
  methodologyVersion: typeof OPPORTUNITY_METHODOLOGY_VERSION;
  components: {
    culturalAffinity: OpportunityComponent;
    descriptorOverlap: OpportunityComponent;
    geographicSignal: OpportunityComponent;
    venueReadiness: OpportunityComponent;
    evidenceCompleteness: OpportunityComponent;
  };
  composite: {
    status: "unavailable";
    score: null;
    reason: string;
  };
  assumptions: string[];
  limitations: string[];
}

export function scoreOpportunityComponents(input: {
  jointAffinity: NormalizedAffinityEvidence | null;
  overlap: CulturalOverlapResult;
  geography: GeographicIntelligenceSummary;
  venueReadiness: { score: number; sourceReferences: string[] } | null;
}): OpportunityComponentVector {
  const affinityValue = input.jointAffinity?.providerValues.affinity;
  const culturalAffinity: OpportunityComponent = affinityValue?.state === "returned"
    ? {
        status: "available",
        score: Math.round(affinityValue.value * 100),
        explanation: "Provider-returned joint-query affinity scaled from 0-1 to 0-100; this is not a probability or statistical confidence.",
        sourceReferences: input.jointAffinity
          ? [input.jointAffinity.source.reference]
          : [],
      }
    : {
        status: "unavailable",
        score: null,
        reason: affinityValue?.state === "invalid"
          ? "The joint query returned an invalid affinity value."
          : "No provider-returned joint affinity is available; affinity rank is not converted into a score.",
        sourceReferences: input.jointAffinity ? [input.jointAffinity.source.reference] : [],
      };

  const descriptorOverlap: OpportunityComponent = input.overlap.jaccard.status === "available"
    ? {
        status: "available",
        score: Math.round((input.overlap.jaccard.value ?? 0) * 100),
        explanation: "Exact stable tag-ID Jaccard similarity scaled from 0-1 to 0-100; it does not establish a shared audience.",
        sourceReferences: [...input.overlap.sourceReferences],
      }
    : {
        status: "unavailable",
        score: null,
        reason: input.overlap.jaccard.reason === "empty_union"
          ? "Both complete tag sets were empty, so similarity has no defined denominator."
          : "Tag-set coverage is incomplete or unavailable, so similarity was not calculated.",
        sourceReferences: [...input.overlap.sourceReferences],
      };

  const returnedPointAffinities = input.geography.heatmap.points
    .map(({ affinity }) => affinity)
    .filter((affinity): affinity is number =>
      typeof affinity === "number" && Number.isFinite(affinity) && affinity >= 0 && affinity <= 1,
    );
  const geographicSignal: OpportunityComponent =
    input.geography.heatmap.status === "returned" && returnedPointAffinities.length > 0
      ? {
          status: "available",
          score: Math.round(
            returnedPointAffinities.reduce((total, affinity) => total + affinity, 0) /
              returnedPointAffinities.length * 100,
          ),
          explanation: `Arithmetic mean of ${returnedPointAffinities.length} provider-returned heatmap affinities in the requested bounds, scaled from 0-1 to 0-100. This is geographic signal, not venue relevance or audience concentration.`,
          sourceReferences: [input.geography.heatmap.source],
        }
      : {
          status: "unavailable",
          score: null,
          reason: input.geography.heatmap.status === "unavailable"
            ? "Qloo geographic evidence is unavailable."
            : "No provider-returned heatmap affinity values are available in the requested bounds.",
          sourceReferences: [input.geography.heatmap.source],
        };

  const venueReadiness: OpportunityComponent = input.venueReadiness &&
    Number.isFinite(input.venueReadiness.score) &&
    input.venueReadiness.score >= 0 && input.venueReadiness.score <= 100 &&
    input.venueReadiness.sourceReferences.length > 0
      ? {
          status: "available",
          score: Math.round(input.venueReadiness.score),
          explanation: "Existing venue-suitability assessment score; operational readiness only, not cultural relevance.",
          sourceReferences: [...new Set(input.venueReadiness.sourceReferences)].sort(),
        }
      : {
          status: "unavailable",
          score: null,
          reason: "No valid venue-suitability assessment with source references is available.",
          sourceReferences: input.venueReadiness?.sourceReferences ?? [],
        };

  const scoredComponents = [
    culturalAffinity,
    descriptorOverlap,
    geographicSignal,
    venueReadiness,
  ];
  const availableCount = scoredComponents.filter(({ status }) => status === "available").length;
  const sourceReferences = [...new Set(scoredComponents.flatMap(({ sourceReferences: refs }) => refs))].sort();
  const evidenceCompleteness: OpportunityComponent = {
    status: "available",
    score: Math.round((availableCount / scoredComponents.length) * 100),
    explanation: `${availableCount} of ${scoredComponents.length} independent evidence components are available. This is evidence coverage, not opportunity quality.`,
    sourceReferences,
  };

  return {
    methodologyVersion: OPPORTUNITY_METHODOLOGY_VERSION,
    components: {
      culturalAffinity,
      descriptorOverlap,
      geographicSignal,
      venueReadiness,
      evidenceCompleteness,
    },
    composite: {
      status: "unavailable",
      score: null,
      reason: "No product-approved component weights or thresholds are defined; no composite opportunity score is calculated.",
    },
    assumptions: [
      "Provider affinity and Jaccard values are linearly rescaled to a 0-100 display range only.",
      "Heatmap point affinities are equally weighted when calculating the geographic component.",
    ],
    limitations: [
      "Aggregate cultural evidence does not establish that the same individuals have both interests.",
      "No component predicts campaign success, attendance, conversion, demographics, or venue availability.",
      "Venue readiness is operational and must not be interpreted as cultural relevance.",
    ],
  };
}