import type { NormalizedAffinityEvidence } from "./evidence";

export type CulturalTagClassification = "cultural_domain" | "operational" | "unclassified";
export type CulturalTagSetStatus = "complete" | "partial" | "unavailable";

export interface CulturalTag {
  id: string;
  name: string;
  subtype: string | null;
}

export interface CulturalTagSet {
  entityId?: string;
  sourceReference: string;
  status: CulturalTagSetStatus;
  tags: readonly CulturalTag[];
}

export interface CulturalOverlapResult {
  status: CulturalTagSetStatus;
  matchingTags: Array<{
    id: string;
    leftName: string;
    rightName: string;
    classification: CulturalTagClassification;
  }>;
  leftOnlyTags: Array<{
    id: string;
    name: string;
    classification: CulturalTagClassification;
  }>;
  rightOnlyTags: Array<{
    id: string;
    name: string;
    classification: CulturalTagClassification;
  }>;
  jaccard: {
    status: "available" | "unavailable";
    value: number | null;
    reason?: "incomplete_tag_sets" | "empty_union";
    intersectionSize: number;
    unionSize: number;
  };
  coverage: {
    leftStatus: CulturalTagSetStatus;
    rightStatus: CulturalTagSetStatus;
    leftTagCount: number;
    rightTagCount: number;
    matchingTagCount: number;
  };
  sourceReferences: string[];
}

export interface AttributedJointRecommendation {
  candidateEntityId: string;
  candidateName: string;
  requestReference: string;
  inputEntityIds: string[];
  matchedInputEntityIds: string[];
  attribution: "both_selected_inputs" | "one_selected_input";
  sourceReference: string;
}

const CULTURAL_DOMAIN_SUBTYPES = new Set([
  "urn:tag:genre:brand",
  "urn:tag:genre:media",
  "urn:tag:genre:music",
  "urn:tag:industry:qloo",
]);

const OPERATIONAL_SUBTYPES = new Set([
  "urn:tag:category:place",
  "urn:tag:cost_description:place",
  "urn:tag:credit_card:place",
  "urn:tag:genre:place",
  "urn:tag:hotel_rating:place",
  "urn:tag:inclusivity:place",
]);

function uniqueTags(tags: readonly CulturalTag[]): Map<string, CulturalTag> {
  return new Map(tags.map((tag) => [tag.id, tag]));
}

function classifyTagPair(left: CulturalTag, right: CulturalTag): CulturalTagClassification {
  if (!left.subtype || left.subtype !== right.subtype) return "unclassified";
  if (CULTURAL_DOMAIN_SUBTYPES.has(left.subtype)) return "cultural_domain";
  if (OPERATIONAL_SUBTYPES.has(left.subtype)) return "operational";
  return "unclassified";
}

function classifyTag(tag: CulturalTag): CulturalTagClassification {
  if (!tag.subtype) return "unclassified";
  if (CULTURAL_DOMAIN_SUBTYPES.has(tag.subtype)) return "cultural_domain";
  if (OPERATIONAL_SUBTYPES.has(tag.subtype)) return "operational";
  return "unclassified";
}

export function compareCulturalTagSets(
  left: CulturalTagSet,
  right: CulturalTagSet,
): CulturalOverlapResult {
  const leftById = uniqueTags(left.tags);
  const rightById = uniqueTags(right.tags);
  const matchingTags = [...leftById.entries()].flatMap(([id, leftTag]) => {
    const rightTag = rightById.get(id);
    return rightTag
      ? [{
          id,
          leftName: leftTag.name,
          rightName: rightTag.name,
          classification: classifyTagPair(leftTag, rightTag),
        }]
      : [];
  });
  const leftOnlyTags = [...leftById.entries()].flatMap(([id, tag]) =>
    rightById.has(id)
      ? []
      : [{ id, name: tag.name, classification: classifyTag(tag) }],
  );
  const rightOnlyTags = [...rightById.entries()].flatMap(([id, tag]) =>
    leftById.has(id)
      ? []
      : [{ id, name: tag.name, classification: classifyTag(tag) }],
  );
  const intersectionSize = matchingTags.length;
  const unionSize = leftById.size + rightById.size - intersectionSize;
  const complete = left.status === "complete" && right.status === "complete";
  const status: CulturalTagSetStatus = complete
    ? "complete"
    : left.status === "unavailable" && right.status === "unavailable"
      ? "unavailable"
      : "partial";
  const jaccard = !complete
    ? {
        status: "unavailable" as const,
        value: null,
        reason: "incomplete_tag_sets" as const,
        intersectionSize,
        unionSize,
      }
    : unionSize === 0
      ? {
          status: "unavailable" as const,
          value: null,
          reason: "empty_union" as const,
          intersectionSize,
          unionSize,
        }
      : {
          status: "available" as const,
          value: intersectionSize / unionSize,
          intersectionSize,
          unionSize,
        };

  return {
    status,
    matchingTags,
    leftOnlyTags,
    rightOnlyTags,
    jaccard,
    coverage: {
      leftStatus: left.status,
      rightStatus: right.status,
      leftTagCount: leftById.size,
      rightTagCount: rightById.size,
      matchingTagCount: matchingTags.length,
    },
    sourceReferences: [...new Set([left.sourceReference, right.sourceReference])],
  };
}

export function attributedJointRecommendations(
  evidence: readonly NormalizedAffinityEvidence[],
): AttributedJointRecommendation[] {
  return evidence.flatMap((item) => {
    if (item.query.scope !== "joint_interest") return [];
    const matchedInputEntityIds = [...new Set(
      item.explainability.inputAttributions
        .filter(({ matchesInput, positive }) => matchesInput && positive)
        .map(({ entityId }) => entityId),
    )].filter((entityId) => item.query.inputEntityIds.includes(entityId));
    if (matchedInputEntityIds.length === 0) return [];
    return [{
      candidateEntityId: item.candidate.entityId,
      candidateName: item.candidate.name,
      requestReference: item.query.requestReference,
      inputEntityIds: [...item.query.inputEntityIds],
      matchedInputEntityIds,
      attribution: matchedInputEntityIds.length >= 2
        ? "both_selected_inputs" as const
        : "one_selected_input" as const,
      sourceReference: item.source.reference,
    }];
  });
}