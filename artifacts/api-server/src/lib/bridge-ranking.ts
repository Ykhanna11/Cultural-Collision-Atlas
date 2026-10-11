import { isRecord } from "./qloo/client";

interface RankedEntity {
  id: string;
  name: string;
  rank: number;
  total: number;
  explainability: unknown;
}

function readRankedEntities(value: unknown): RankedEntity[] {
  const results =
    isRecord(value) && isRecord(value.results) ? value.results : null;
  const entities = results?.entities;
  if (!Array.isArray(entities)) {
    throw new Error("Qloo insights returned an unrecognized entity result shape.");
  }

  return entities.flatMap((entity, index): RankedEntity[] => {
    if (!isRecord(entity)) return [];
    const id = entity.entity_id;
    const name = entity.name;
    if (typeof id !== "string" || typeof name !== "string") return [];
    const query = isRecord(entity.query) ? entity.query : null;
    return [{
      id,
      name,
      rank: index + 1,
      total: entities.length,
      explainability: query?.explainability ?? null,
    }];
  });
}

function normalizedRank(item: RankedEntity): number {
  if (item.total <= 1) return 100;
  return 100 * (1 - (item.rank - 1) / (item.total - 1));
}

export function rankBridgeCandidates(input: {
  interestA: string;
  interestB: string;
  resultsA: unknown;
  resultsB: unknown;
  jointResults: unknown;
}) {
  const interestA = readRankedEntities(input.resultsA);
  const interestB = readRankedEntities(input.resultsB);
  const joint = readRankedEntities(input.jointResults);
  const byIdB = new Map(interestB.map((entity) => [entity.id, entity]));
  const byIdJoint = new Map(joint.map((entity) => [entity.id, entity]));

  return interestA.flatMap((a) => {
    const b = byIdB.get(a.id);
    if (!b) return [];
    const jointMatch = byIdJoint.get(a.id);
    const score = Math.round(
      normalizedRank(a) * 0.45 +
        normalizedRank(b) * 0.45 +
        (jointMatch ? 10 : 0),
    );

    return [{
      id: a.id,
      name: a.name,
      explanation:
        `This entity appeared in Qloo recommendations for both ${input.interestA} and ${input.interestB}. ` +
        "That is an aggregate affinity signal, not evidence that the same individuals share both interests.",
      score,
      scoreDescription:
        "Derived bridge score: 45% normalized rank for interest A + 45% normalized rank for interest B + 10 points if present in the joint-interest results. It is a ranking aid, not a probability of campaign success.",
      confidence: jointMatch ? "high" as const : "medium" as const,
      evidence: [
        {
          source: "Qloo Insights API",
          label: `Single-interest comparison: ${input.interestA}`,
          value: `Ranked ${a.rank} of ${a.total} returned entities.`,
          kind: "observed_api" as const,
        },
        {
          source: "Qloo Insights API",
          label: `Single-interest comparison: ${input.interestB}`,
          value: `Ranked ${b.rank} of ${b.total} returned entities.`,
          kind: "observed_api" as const,
        },
        ...(jointMatch
          ? [{
              source: "Qloo Insights API",
              label: "Joint-interest comparison",
              value: `Also present at rank ${jointMatch.rank} of ${jointMatch.total}.`,
              kind: "observed_api" as const,
            }]
          : []),
        {
          source: "Cultural Collision Atlas",
          label: "Bridge score",
          value: "Derived from the two independently ranked Qloo lists and joint-list presence.",
          kind: "derived" as const,
        },
      ],
      explainability: {
        interestA: a.explainability,
        interestB: b.explainability,
        joint: jointMatch?.explainability ?? null,
      },
    }];
  }).sort((left, right) => right.score - left.score);
}
