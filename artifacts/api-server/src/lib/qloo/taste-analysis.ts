import type { EvidenceItem } from "@workspace/api-zod";
import {
  compareCulturalTagSets,
  type CulturalOverlapResult,
  type CulturalTagClassification,
  type CulturalTagSet,
} from "../cultural-intelligence/overlap";
import { isRecord } from "./client";
import { requestTasteAnalysis } from "./insights";

interface TasteTag {
  id: string;
  name: string;
  subtype: string | null;
}

interface ParsedTags {
  available: boolean;
  complete: boolean;
  tags: TasteTag[];
}

export interface TasteAnalysisRequestResult {
  payload: unknown | null;
  error?: unknown;
}

export async function loadTasteAnalysis(
  entityIds: string[],
  request: (entityId: string) => Promise<unknown> = requestTasteAnalysis,
): Promise<TasteAnalysisRequestResult[]> {
  const results = new Map<string, TasteAnalysisRequestResult>();
  await Promise.all(
    [...new Set(entityIds)].map(async (entityId) => {
      try {
        results.set(entityId, { payload: await request(entityId) });
      } catch (error) {
        results.set(entityId, { payload: null, error });
      }
    }),
  );
  return entityIds.map(
    (entityId) => results.get(entityId) ?? { payload: null },
  );
}

function parseTasteTags(payload: unknown): ParsedTags {
  if (
    !isRecord(payload) ||
    ("success" in payload && payload.success !== true) ||
    !isRecord(payload.results)
  ) {
    return { available: false, complete: false, tags: [] };
  }
  const rawTags = payload.results.tags;
  if (!Array.isArray(rawTags)) {
    return { available: false, complete: false, tags: [] };
  }

  let complete = true;
  const tags = rawTags.flatMap((tag): TasteTag[] => {
    if (
      !isRecord(tag) ||
      typeof tag.tag_id !== "string" ||
      !tag.tag_id.trim() ||
      typeof tag.name !== "string" ||
      !tag.name.trim()
    ) {
      complete = false;
      return [];
    }
    return [
      {
        id: tag.tag_id,
        name: tag.name,
        subtype: typeof tag.subtype === "string" ? tag.subtype : null,
      },
    ];
  });
  return { available: true, complete, tags };
}

function parseCandidateTags(value: unknown): ParsedTags {
  if (!Array.isArray(value)) {
    return { available: false, complete: false, tags: [] };
  }

  let complete = true;
  const tags = value.flatMap((tag): TasteTag[] => {
    if (
      !isRecord(tag) ||
      typeof tag.id !== "string" ||
      !tag.id.trim() ||
      typeof tag.name !== "string" ||
      !tag.name.trim()
    ) {
      complete = false;
      return [];
    }
    return [
      {
        id: tag.id,
        name: tag.name,
        subtype: typeof tag.type === "string" ? tag.type : null,
      },
    ];
  });
  return { available: true, complete, tags };
}

function normalizedTagSet(
  parsed: ParsedTags,
  sourceReference: string,
): CulturalTagSet {
  return {
    sourceReference,
    status: !parsed.available
      ? "unavailable"
      : parsed.complete
        ? "complete"
        : "partial",
    tags: parsed.tags,
  };
}

export function compareTasteAnalysisInterests(input: {
  interestA: string;
  interestAId?: string;
  tasteAnalysisA: unknown;
  interestB: string;
  interestBId?: string;
  tasteAnalysisB: unknown;
}): CulturalOverlapResult {
  return compareCulturalTagSets(
    normalizedTagSet(
      parseTasteTags(input.tasteAnalysisA),
      `Qloo Taste Analysis · ${input.interestAId ?? input.interestA}`,
    ),
    normalizedTagSet(
      parseTasteTags(input.tasteAnalysisB),
      `Qloo Taste Analysis · ${input.interestBId ?? input.interestB}`,
    ),
  );
}

function overlapValue(
  result: CulturalOverlapResult,
  subject: string,
  rightSetLabel = "candidate",
): string {
  if (result.matchingTags.length) {
    const categories: Array<{
      category: CulturalTagClassification;
      label: string;
    }> = [
      { category: "cultural_domain", label: "Cultural/domain evidence" },
      { category: "operational", label: "Generic operational attributes" },
      { category: "unclassified", label: "Unclassified tags" },
    ];
    const categorySummaries = categories.flatMap(({ category, label }) => {
      const tags = result.matchingTags.filter((tag) => tag.classification === category);
      return tags.length
        ? [`${label}: ${tags.map(({ leftName, rightName, id }) =>
          `"${leftName}" / ${rightSetLabel} tag "${rightName}" (${id})`,
          ).join(", ")}.`]
        : [];
    });
    const observedCategories = new Set(
      result.matchingTags.map(({ classification }) => classification),
    );
    const status = observedCategories.size > 1
      ? "Multiple tag categories observed."
      : observedCategories.has("cultural_domain")
        ? "Cultural/domain tag overlap observed."
        : observedCategories.has("operational")
          ? "Generic operational attribute overlap observed."
          : "Unclassified tag overlap observed.";
    const similarity = result.jaccard.status === "available"
      ? ` Jaccard similarity: ${result.jaccard.value?.toFixed(3)} (${result.jaccard.intersectionSize} shared IDs / ${result.jaccard.unionSize} unique IDs).`
      : " Jaccard similarity unavailable because tag coverage is incomplete.";
    return [
      status,
      ...categorySummaries,
      similarity,
      result.status !== "complete"
        ? "Additional tag data was incomplete, so the list may be partial."
        : "",
      "Exact tag overlap is not proof of a cultural relationship or shared audience.",
    ].filter(Boolean).join(" ");
  }

  if (result.jaccard.status === "available") {
    return `No exact tag-ID overlap observed for ${subject} in both complete returned tag lists. Jaccard similarity: 0.000. This is not evidence against a connection.`;
  }
  if (result.jaccard.reason === "empty_union") {
    return `Both complete returned tag sets for ${subject} were empty, so overlap similarity could not be calculated. No conclusion about a connection can be drawn.`;
  }
  const unavailable = [
    ...(result.coverage.leftStatus !== "complete" ? ["the first tag set"] : []),
    ...(result.coverage.rightStatus !== "complete" ? ["the second tag set"] : []),
  ];
  return `Overlap evidence for ${subject} is unavailable or incomplete: ${unavailable.join(" and ")} could not be fully verified. No conclusion about absence of a match can be drawn.`;
}

function overlapEvidence(
  inputLabel: string,
  inputName: string,
  taste: ParsedTags,
  candidate: ParsedTags,
): EvidenceItem {
  const result = compareCulturalTagSets(
    normalizedTagSet(taste, `${inputLabel} Taste Analysis`),
    normalizedTagSet(candidate, "Qloo joint candidate tags"),
  );

  return {
    source: "Qloo Taste Analysis and candidate tags",
    label: `Taste Analysis overlap · ${inputLabel}: ${inputName}`,
    value: overlapValue(result, inputName),
    kind: "derived",
  };
}

export function buildInterestOverlapEvidence(input: {
  interestA: string;
  interestAId?: string;
  tasteAnalysisA: unknown;
  interestB: string;
  interestBId?: string;
  tasteAnalysisB: unknown;
}): EvidenceItem {
  const result = compareTasteAnalysisInterests(input);
  const distinctSummary = [
    ...(result.leftOnlyTags.length
      ? [`${input.interestA} only: ${result.leftOnlyTags.map(({ name, id }) => `${name} (${id})`).join(", ")}.`]
      : []),
    ...(result.rightOnlyTags.length
      ? [`${input.interestB} only: ${result.rightOnlyTags.map(({ name, id }) => `${name} (${id})`).join(", ")}.`]
      : []),
  ].join(" ");
  return {
    source: result.sourceReferences.join("; "),
    label: "Taste Analysis overlap · Shared input descriptors",
    value: [
      overlapValue(result, `${input.interestA} and ${input.interestB}`, input.interestB),
      distinctSummary,
    ].filter(Boolean).join(" "),
    kind: "derived",
  };
}

export function buildTasteAnalysisEvidence(input: {
  candidateTags: unknown;
  interestA: string;
  tasteAnalysisA: unknown;
  interestB: string;
  tasteAnalysisB: unknown;
}): EvidenceItem[] {
  const candidate = parseCandidateTags(input.candidateTags);
  return [
    overlapEvidence(
      "Input A",
      input.interestA,
      parseTasteTags(input.tasteAnalysisA),
      candidate,
    ),
    overlapEvidence(
      "Input B",
      input.interestB,
      parseTasteTags(input.tasteAnalysisB),
      candidate,
    ),
  ];
}
