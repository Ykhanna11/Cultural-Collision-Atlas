import { isRecord } from "./qloo/client";
import { isQlooEntityId } from "./qloo/entities";
import type { QlooRecommendationType } from "./qloo/insights";
import { buildTasteAnalysisEvidence } from "./qloo/taste-analysis";
import {
  compareQlooAffinityQueries,
  describeAffinityScopeComparison,
  normalizeQlooAffinityQuery,
} from "./cultural-intelligence/affinity";
import type {
  AffinityQueryContext,
  NormalizedAffinityEvidence,
  NormalizedAffinityQuery,
} from "./cultural-intelligence/evidence";

interface RankedEntity {
  id: string;
  name: string;
  affinity: number | null;
  affinityRank: number | null;
  explainability: unknown;
  localityCityEntityId: string | null;
  tags: unknown;
  affinityEvidence: NormalizedAffinityEvidence;
}

interface InputAttribution {
  id: string;
  interest: string;
  score: number;
}

type AttributionStrength = "two_sided" | "one_sided" | "unavailable";

function readRankedEntities(query: NormalizedAffinityQuery): RankedEntity[] {
  if (query.status === "invalid" && query.invalidCandidateCount === 0) {
    throw new Error("Qloo insights returned an unrecognized entity result shape.");
  }
  return query.evidence.map((evidence): RankedEntity => ({
    id: evidence.candidate.entityId,
    name: evidence.candidate.name,
    affinity: evidence.providerValues.affinity.state === "returned"
      ? evidence.providerValues.affinity.value
      : null,
    affinityRank: evidence.providerValues.affinityRank.state === "returned"
      ? evidence.providerValues.affinityRank.value
      : null,
    explainability: evidence.explainability.providerValue,
    tags: evidence.candidate.tags,
    localityCityEntityId: evidence.candidate.localityCityEntityId,
    affinityEvidence: evidence,
  }));
}

export type LocalityStatus =
  | "matches_selected_city"
  | "outside_selected_city"
  | "unavailable";

export function localityStatusForCandidate(
  recommendationType: QlooRecommendationType,
  candidateCityEntityId: unknown,
  selectedCityEntityId: unknown,
): LocalityStatus | undefined {
  if (recommendationType !== "urn:entity:place") return undefined;
  if (
    !isQlooEntityId(candidateCityEntityId) ||
    !isQlooEntityId(selectedCityEntityId)
  ) {
    return "unavailable";
  }
  return candidateCityEntityId === selectedCityEntityId
    ? "matches_selected_city"
    : "outside_selected_city";
}

function scoreFromQlooSignals(item: RankedEntity): number {
  if (item.affinity !== null) return Math.round(item.affinity * 100);
  if (item.affinityRank !== null) {
    return Math.round(100 / item.affinityRank);
  }
  return 0;
}

function qlooSignals(item: RankedEntity): string[] {
  return [
    ...(item.affinityRank === null
      ? []
      : [`Qloo affinity rank: ${item.affinityRank}.`]),
    ...(item.affinity === null
      ? []
      : [`Qloo affinity: ${item.affinity}.`]),
  ];
}

function recommendationTypeLabel(type: QlooRecommendationType): string {
  switch (type) {
    case "urn:entity:place":
      return "Places";
    case "urn:entity:destination":
      return "Destinations";
    default:
      return "Brands";
  }
}

function readInputAttribution(
  evidence: NormalizedAffinityEvidence,
  inputEntities: Array<{ id: string; name: string }>,
): InputAttribution[] {
  const seen = new Set<string>();
  return evidence.explainability.inputAttributions.flatMap((signal): InputAttribution[] => {
    if (!signal.matchesInput || !signal.positive || seen.has(signal.entityId)) return [];
    const entity = inputEntities.find(({ id }) => id === signal.entityId);
    if (!entity) {
      return [];
    }
    seen.add(signal.entityId);
    return [{ id: entity.id, interest: entity.name, score: signal.score }];
  });
}

function attributionStrength(
  attributions: InputAttribution[],
): AttributionStrength {
  const distinctInputs = new Set(attributions.map(({ id }) => id));
  if (distinctInputs.size >= 2) return "two_sided";
  if (distinctInputs.size === 1) return "one_sided";
  return "unavailable";
}

function explainabilitySummary(
  explainability: unknown,
  attributions: InputAttribution[],
): string {
  const strength = attributionStrength(attributions);
  if (strength === "two_sided") {
    return `Per-result explainability reports contributions from both supplied interests: ${attributions.map(({ interest, score }) => `${interest} (${score})`).join(", ")}.`;
  }
  if (strength === "one_sided") {
    const [{ interest, score }] = attributions;
    return `Per-result explainability reports a contribution from ${interest} (${score}) only. Contribution from the other interest is unconfirmed; Qloo may omit lower-impact contributions.`;
  }
  if (!isRecord(explainability)) {
    return "Per-result input attribution was not returned, so contribution from either interest is unconfirmed.";
  }
  if (!Array.isArray(explainability["signal.interests.entities"])) {
    return "Qloo returned explainability metadata but no entity-level input attribution; contribution from either interest is unconfirmed.";
  }
  return "Qloo returned entity-level input attribution but no positive contribution score matched either selected entity; contribution from both interests is unconfirmed.";
}

export function rankBridgeCandidates(input: {
  interestA: string;
  interestAId: string;
  interestB: string;
  interestBId: string;
  recommendationType: QlooRecommendationType;
  selectedCityEntityId?: string;
  city?: string;
  analysisReference?: string;
  tasteAnalysis?: {
    interestA: unknown;
    interestB: unknown;
  };
  resultsA: unknown;
  resultsB: unknown;
  jointResults: unknown;
}) {
  const analysisReference = input.analysisReference ?? "bridge-ranking-call";
  const queryContext = (
    requestReference: string,
    scope: AffinityQueryContext["scope"],
    inputEntityIds: string[],
  ): AffinityQueryContext => ({
    analysisReference,
    requestReference,
    scope,
    inputEntityIds,
    recommendationType: input.recommendationType,
    city: input.city ?? "",
    cityEntityId: input.selectedCityEntityId,
  });
  const affinityQueries = [
    normalizeQlooAffinityQuery(input.resultsA, queryContext("single-interest-a", "single_interest", [input.interestAId])),
    normalizeQlooAffinityQuery(input.resultsB, queryContext("single-interest-b", "single_interest", [input.interestBId])),
    normalizeQlooAffinityQuery(input.jointResults, queryContext("joint-interest", "joint_interest", [input.interestAId, input.interestBId])),
  ];
  const affinityComparison = compareQlooAffinityQueries(affinityQueries);
  const interestA = readRankedEntities(affinityQueries[0]);
  const interestB = readRankedEntities(affinityQueries[1]);
  const joint = readRankedEntities(affinityQueries[2]);
  const categoryLabel = recommendationTypeLabel(input.recommendationType);
  const byIdB = new Map(interestB.map((entity) => [entity.id, entity]));
  const byIdA = new Map(interestA.map((entity) => [entity.id, entity]));
  const seen = new Set<string>();

  return joint.flatMap((candidate) => {
    if (seen.has(candidate.id)) return [];
    seen.add(candidate.id);

    const independentMatches = [
      [input.interestA, byIdA.get(candidate.id)],
      [input.interestB, byIdB.get(candidate.id)],
    ] as const;
    const score = scoreFromQlooSignals(candidate);
    const inputAttributions = readInputAttribution(candidate.affinityEvidence, [
      { id: input.interestAId, name: input.interestA },
      { id: input.interestBId, name: input.interestB },
    ]);
    const strength = attributionStrength(inputAttributions);
    const attribution = explainabilitySummary(
      candidate.explainability,
      inputAttributions,
    );
    const confidence =
      strength === "two_sided"
        ? "high" as const
        : strength === "one_sided"
          ? "medium" as const
          : "low" as const;
    const localityStatus = localityStatusForCandidate(
      input.recommendationType,
      candidate.localityCityEntityId,
      input.selectedCityEntityId,
    );
    return [{
      id: candidate.id,
      name: candidate.name,
      explanation:
        `Qloo returned this entity for a joint request using ${input.interestA} and ${input.interestB}. ${attribution} ` +
        "This is aggregate recommendation evidence, not proof that the same individuals share both interests.",
      score,
      scoreDescription:
        "Derived bridge score from the joint result: Qloo affinity multiplied by 100 when returned; otherwise 100 divided by Qloo affinity rank when returned; otherwise 0. Input-attribution coverage is reflected separately in confidence. The score is not a probability.",
      confidence,
      ...(input.recommendationType === "urn:entity:place"
        ? {
            localityCityEntityId: candidate.localityCityEntityId,
            localityStatus,
          }
        : {}),
      evidence: [
        {
          source: "Qloo Insights API",
          label: `Joint-interest comparison · ${categoryLabel}`,
          value: [`${categoryLabel} returned for a request using both input interests.`, ...qlooSignals(candidate)].join(" "),
          kind: "observed_api" as const,
        },
        ...independentMatches.flatMap(([interest, match]) =>
          match
            ? [{
                source: "Qloo Insights API",
                label: `Supporting single-interest comparison: ${interest}`,
                value: [
                  "Entity was also returned for this interest alone.",
                  ...qlooSignals(match),
                ].join(" "),
                kind: "observed_api" as const,
              }]
            : [],
        ),
        {
          source: "Qloo Insights API",
          label: "Affinity by query scope",
          value: describeAffinityScopeComparison(affinityComparison, candidate.id),
          kind: "derived" as const,
        },
        {
          source: "Qloo Insights API",
          label: "Per-result input attribution",
          value: attribution,
          kind: "observed_api" as const,
        },
        {
          source: "Cultural Collision Atlas",
          label: "Bridge score",
          value:
            "Derived only from Qloo affinity or affinity rank when returned; zero when neither is available. This is not an individual-level confidence or a probability.",
          kind: "derived" as const,
        },
        ...(input.tasteAnalysis
          ? buildTasteAnalysisEvidence({
              candidateTags: candidate.tags,
              interestA: input.interestA,
              tasteAnalysisA: input.tasteAnalysis.interestA,
              interestB: input.interestB,
              tasteAnalysisB: input.tasteAnalysis.interestB,
            })
          : []),
      ],
      attributionStrength: strength,
    }];
  }).sort((left, right) => {
    if (input.recommendationType === "urn:entity:place") {
      const leftMatchesCity = left.localityStatus === "matches_selected_city";
      const rightMatchesCity = right.localityStatus === "matches_selected_city";
      if (leftMatchesCity !== rightMatchesCity) {
        return leftMatchesCity ? -1 : 1;
      }
    }
    const strengthOrder: Record<AttributionStrength, number> = {
      two_sided: 2,
      one_sided: 1,
      unavailable: 0,
    };
    return (
      strengthOrder[right.attributionStrength] -
        strengthOrder[left.attributionStrength] ||
      right.score - left.score
    );
  }).map(({ attributionStrength: _attributionStrength, ...candidate }) => candidate);
}
