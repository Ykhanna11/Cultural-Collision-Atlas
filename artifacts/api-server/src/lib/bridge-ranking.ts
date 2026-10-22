import { isRecord } from "./qloo/client";
import { isQlooEntityId } from "./qloo/entities";
import type { QlooRecommendationType } from "./qloo/insights";
import { buildTasteAnalysisEvidence } from "./qloo/taste-analysis";

interface RankedEntity {
  id: string;
  name: string;
  affinity: number | null;
  affinityRank: number | null;
  explainability: unknown;
  localityCityEntityId: string | null;
  tags: unknown;
}

interface InputAttribution {
  id: string;
  interest: string;
  score: number;
}

type AttributionStrength = "two_sided" | "one_sided" | "unavailable";

function readRankedEntities(value: unknown): RankedEntity[] {
  const results =
    isRecord(value) && isRecord(value.results) ? value.results : null;
  const entities = results?.entities;
  if (!Array.isArray(entities)) {
    throw new Error("Qloo insights returned an unrecognized entity result shape.");
  }

  return entities.flatMap((entity): RankedEntity[] => {
    if (!isRecord(entity)) return [];
    const id = entity.entity_id;
    const name = entity.name;
    if (typeof id !== "string" || typeof name !== "string") return [];
    const query = isRecord(entity.query) ? entity.query : null;
    const affinity = query?.affinity;
    const affinityRank = query?.affinity_rank;
    return [{
      id,
      name,
      affinity:
        typeof affinity === "number" &&
        Number.isFinite(affinity) &&
        affinity >= 0 &&
        affinity <= 1
          ? affinity
          : null,
      affinityRank:
        typeof affinityRank === "number" &&
        Number.isFinite(affinityRank) &&
        Number.isInteger(affinityRank) &&
        affinityRank >= 1
          ? affinityRank
          : null,
      explainability: query?.explainability ?? null,
      tags: entity.tags,
      localityCityEntityId:
        isRecord(entity.properties) &&
        isRecord(entity.properties.locality) &&
        isRecord(entity.properties.locality.city) &&
        typeof entity.properties.locality.city.entity_id === "string"
          ? entity.properties.locality.city.entity_id
          : null,
    }];
  });
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
  value: unknown,
  inputEntities: Array<{ id: string; name: string }>,
): InputAttribution[] {
  if (!isRecord(value)) return [];

  const signals = value["signal.interests.entities"];
  if (!Array.isArray(signals)) return [];

  const seen = new Set<string>();
  return signals.flatMap((signal): InputAttribution[] => {
    if (!isRecord(signal) || typeof signal.entity_id !== "string") return [];
    if (seen.has(signal.entity_id)) return [];
    const entity = inputEntities.find(({ id }) => id === signal.entity_id);
    if (
      !entity ||
      typeof signal.score !== "number" ||
      !Number.isFinite(signal.score) ||
      signal.score <= 0
    ) {
      return [];
    }
    seen.add(signal.entity_id);
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
  tasteAnalysis?: {
    interestA: unknown;
    interestB: unknown;
  };
  resultsA: unknown;
  resultsB: unknown;
  jointResults: unknown;
}) {
  const interestA = readRankedEntities(input.resultsA);
  const interestB = readRankedEntities(input.resultsB);
  const joint = readRankedEntities(input.jointResults);
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
    const inputAttributions = readInputAttribution(candidate.explainability, [
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
