import type { EvidenceItem } from "@workspace/api-zod";
import { isRecord } from "./client";
import { requestTasteAnalysis } from "./insights";

interface TasteTag {
  id: string;
  name: string;
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
      typeof tag.name !== "string"
    ) {
      complete = false;
      return [];
    }
    return [{ id: tag.tag_id, name: tag.name.trim() || tag.tag_id }];
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
      typeof tag.name !== "string"
    ) {
      complete = false;
      return [];
    }
    return [{ id: tag.id, name: tag.name.trim() || tag.id }];
  });
  return { available: true, complete, tags };
}

function overlapEvidence(
  inputLabel: string,
  inputName: string,
  taste: ParsedTags,
  candidate: ParsedTags,
): EvidenceItem {
  const candidateIds = new Set(candidate.tags.map(({ id }) => id));
  const matches = taste.tags.filter(({ id }) => candidateIds.has(id));
  const dataComplete = taste.complete && candidate.complete;
  let value: string;

  if (matches.length) {
    value =
      `Exact matching tag IDs observed for ${inputName}: ` +
      matches.map(({ name, id }) => `${name} (${id})`).join(", ") +
      (dataComplete
        ? "."
        : ". Additional tag data was incomplete, so this list may be partial.");
  } else if (taste.available && candidate.available && dataComplete) {
    value =
      `No exact tag-ID overlap observed for ${inputName} in the returned ` +
      "Taste Analysis and candidate tag lists. This is not evidence against a connection.";
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
