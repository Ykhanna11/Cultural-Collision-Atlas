import type { EvidenceItem } from "@workspace/api-zod";
import { isRecord } from "./client";
import { requestTasteAnalysis } from "./insights";

interface TasteTag {
  id: string;
  name: string;
  subtype: string | null;
}

type TasteEvidenceCategory = "cultural_domain" | "operational" | "unclassified";

interface ParsedTags {
  available: boolean;
  complete: boolean;
  tags: TasteTag[];
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

function classifyTagOverlap(
  tasteTag: TasteTag,
  candidateTag: TasteTag,
): TasteEvidenceCategory {
  if (
    !tasteTag.subtype ||
    !candidateTag.subtype ||
    tasteTag.subtype !== candidateTag.subtype
  ) {
    return "unclassified";
  }
  const subtype = tasteTag.subtype;
  if (CULTURAL_DOMAIN_SUBTYPES.has(subtype)) return "cultural_domain";
  if (OPERATIONAL_SUBTYPES.has(subtype)) return "operational";
  return "unclassified";
}

function overlapEvidence(
  inputLabel: string,
  inputName: string,
  taste: ParsedTags,
  candidate: ParsedTags,
): EvidenceItem {
  const candidateTagsById = new Map(candidate.tags.map((tag) => [tag.id, tag]));
  const matches = taste.tags.flatMap((tag) => {
    const candidateTag = candidateTagsById.get(tag.id);
    return candidateTag
      ? [
          {
            ...tag,
            category: classifyTagOverlap(tag, candidateTag),
            candidateName: candidateTag.name,
          },
        ]
      : [];
  });
  const dataComplete = taste.complete && candidate.complete;
  let value: string;

  if (matches.length) {
    const categories: Array<{
      category: TasteEvidenceCategory;
      label: string;
    }> = [
      { category: "cultural_domain", label: "Cultural/domain evidence" },
      { category: "operational", label: "Generic operational attributes" },
      { category: "unclassified", label: "Unclassified tags" },
    ];
    const categorySummaries = categories.flatMap(({ category, label }) => {
      const categoryTags = matches.filter((tag) => tag.category === category);
      return categoryTags.length
        ? [
            `${label}: ${categoryTags
              .map(
                ({ name, candidateName, id }) =>
                  `"${name}" / candidate tag "${candidateName}" (${id})`,
              )
              .join(", ")}.`,
          ]
        : [];
    });
    const observedCategories = new Set(matches.map(({ category }) => category));
    const status =
      observedCategories.size > 1
        ? "Multiple tag categories observed."
        : observedCategories.has("cultural_domain")
          ? "Cultural/domain tag overlap observed."
          : observedCategories.has("operational")
            ? "Generic operational attribute overlap observed."
            : "Unclassified tag overlap observed.";
    value = [
      status,
      ...categorySummaries,
      dataComplete
        ? ""
        : "Additional tag data was incomplete, so the list may be partial.",
      "Exact tag overlap is not proof of a cultural relationship or shared audience.",
    ]
      .filter(Boolean)
      .join(" ");
  } else if (taste.available && candidate.available && dataComplete) {
    value =
      `No exact tag-ID overlap observed for ${inputName} in the complete ` +
      "returned Taste Analysis and candidate tag lists. This is not evidence against a connection.";
  } else {
    const unavailable = [
      ...(!taste.available || !taste.complete
        ? [`${inputLabel} Taste Analysis tags`]
        : []),
      ...(!candidate.available || !candidate.complete
        ? ["candidate tags"]
        : []),
    ];
    value =
      `Overlap evidence for ${inputName} is unavailable or incomplete: ` +
      `${unavailable.join(" and ")} could not be fully verified. ` +
      "No conclusion about absence of a match can be drawn.";
  }

  return {
    source: "Qloo Taste Analysis and candidate tags",
    label: `Taste Analysis overlap · ${inputLabel}: ${inputName}`,
    value,
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
