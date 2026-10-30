import { isRecord } from "../qloo/client";
import { extractExplainability } from "../qloo/explainability";
import type {
  AffinityComparisonSet,
  AffinityQueryContext,
  AffinityQueryStatus,
  AffinityScopeObservation,
  CandidateAffinityComparison,
  ExplainabilityCoverage,
  NormalizedAffinityEvidence,
  NormalizedAffinityQuery,
  NormalizedInputAttribution,
  ProviderField,
} from "./evidence";

function normalizeProviderField<T>(
  value: unknown,
  isValid: (value: unknown) => value is T,
): ProviderField<T> {
  if (value === undefined || value === null) {
    return { state: "missing", value: null };
  }
  return isValid(value)
    ? { state: "returned", value, providerValue: value }
    : { state: "invalid", value: null, providerValue: value };
}

function isAffinity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isAffinityRank(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function normalizeExplainability(
  candidate: Record<string, unknown>,
  inputEntityIds: string[],
): NormalizedAffinityEvidence["explainability"] {
  const providerValue = extractExplainability(candidate);
  if (!providerValue) {
    const query = isRecord(candidate.query) ? candidate.query : null;
    const hadValue = Boolean(query && "explainability" in query);
    return {
      coverage: hadValue ? "invalid" : "unavailable",
      providerValue: null,
      inputAttributions: [],
      invalidSignalCount: hadValue ? 1 : 0,
    };
  }

  const rawAttributions = providerValue["signal.interests.entities"];
  if (!Array.isArray(rawAttributions)) {
    return {
      coverage: "invalid",
      providerValue,
      inputAttributions: [],
      invalidSignalCount: 1,
    };
  }

  let invalidSignalCount = 0;
  const inputIds = new Set(inputEntityIds);
  const inputAttributions = rawAttributions.flatMap((item): NormalizedInputAttribution[] => {
    if (
      !isRecord(item) ||
      typeof item.entity_id !== "string" ||
      typeof item.score !== "number" ||
      !Number.isFinite(item.score)
    ) {
      invalidSignalCount += 1;
      return [];
    }
    return [{
      entityId: item.entity_id,
      score: item.score,
      matchesInput: inputIds.has(item.entity_id),
      positive: item.score > 0,
    }];
  });
  const matchedInputs = new Set(
    inputAttributions
      .filter(({ matchesInput, positive }) => matchesInput && positive)
      .map(({ entityId }) => entityId),
  );
  const coverage: ExplainabilityCoverage = invalidSignalCount > 0
    ? "partial"
    : matchedInputs.size >= 2
      ? "both_inputs_attributed"
      : matchedInputs.size === 1
        ? "one_input_attributed"
        : "no_positive_attribution";

  return {
    coverage,
    providerValue,
    inputAttributions,
    invalidSignalCount,
  };
}

export function normalizeQlooAffinityQuery(
  payload: unknown,
  context: AffinityQueryContext,
): NormalizedAffinityQuery {
  const query = { ...context, inputEntityIds: [...context.inputEntityIds] };
  if (payload === null || payload === undefined) {
    return {
      query,
      status: "unavailable",
      evidence: [],
      invalidCandidateCount: 0,
      unavailableReason: "request_failed",
    };
  }
  if (!isRecord(payload) || ("success" in payload && payload.success !== true)) {
    return { query, status: "invalid", evidence: [], invalidCandidateCount: 0 };
  }
  const results = isRecord(payload.results) ? payload.results : null;
  if (!results || !Array.isArray(results.entities)) {
    return { query, status: "invalid", evidence: [], invalidCandidateCount: 0 };
  }
  if (results.entities.length === 0) {
    return { query, status: "empty", evidence: [], invalidCandidateCount: 0 };
  }

  let invalidCandidateCount = 0;
  const observedAt = context.observedAt ?? new Date().toISOString();
  const evidence = results.entities.flatMap((item): NormalizedAffinityEvidence[] => {
    if (
      !isRecord(item) ||
      typeof item.entity_id !== "string" ||
      !item.entity_id.trim() ||
      typeof item.name !== "string" ||
      !item.name.trim()
    ) {
      invalidCandidateCount += 1;
      return [];
    }

    const rawQuery = isRecord(item.query) ? item.query : {};
    const affinity = normalizeProviderField(rawQuery.affinity, isAffinity);
    const affinityRank = normalizeProviderField(rawQuery.affinity_rank, isAffinityRank);
    const explainability = normalizeExplainability(item, context.inputEntityIds);
    const missingFields = [
      ...(affinity.state === "missing" ? ["affinity"] : []),
      ...(affinityRank.state === "missing" ? ["affinity_rank"] : []),
      ...(explainability.coverage === "unavailable" ? ["explainability"] : []),
    ];
    const invalidFields = [
      ...(affinity.state === "invalid" ? ["affinity"] : []),
      ...(affinityRank.state === "invalid" ? ["affinity_rank"] : []),
      ...(explainability.coverage === "invalid" ? ["explainability"] : []),
      ...(explainability.coverage === "partial" ? ["explainability.signals"] : []),
    ];
    const properties = isRecord(item.properties) ? item.properties : null;
    const locality = properties && isRecord(properties.locality) ? properties.locality : null;
    const localityCity = locality && isRecord(locality.city) ? locality.city : null;

    return [{
      provider: "qloo_api",
      evidenceType: "recommendation",
      query,
      candidate: {
        entityId: item.entity_id,
        name: item.name,
        tags: item.tags,
        localityCityEntityId:
          typeof localityCity?.entity_id === "string" ? localityCity.entity_id : null,
      },
      providerValues: { affinity, affinityRank },
      explainability,
      completeness: {
        status: missingFields.length || invalidFields.length ? "partial" : "complete",
        missingFields,
        invalidFields,
      },
      source: {
        reference: "Qloo Insights API",
        providerTimestamp: null,
        observedAt,
      },
    }];
  });

  const status: AffinityQueryStatus = evidence.length === 0
    ? "invalid"
    : invalidCandidateCount > 0 || evidence.some(({ completeness }) => completeness.status === "partial")
      ? "partial"
      : "complete";
  return { query, status, evidence, invalidCandidateCount };
}

function compatibleContext(queries: NormalizedAffinityQuery[]): string | null {
  if (queries.length < 2) return "At least two query results are required.";
  const first = queries[0].query;
  for (const candidate of queries.slice(1)) {
    const query = candidate.query;
    if (query.analysisReference !== first.analysisReference) return "Results belong to different analysis references.";
    if (query.recommendationType !== first.recommendationType) return "Recommendation types differ.";
    if (query.cityEntityId !== first.cityEntityId || query.city.trim().toLowerCase() !== first.city.trim().toLowerCase()) {
      return "Geographic query context differs.";
    }
  }
  return null;
}

export function compareQlooAffinityQueries(
  queries: NormalizedAffinityQuery[],
): AffinityComparisonSet {
  const contextError = compatibleContext(queries);
  const analysisReference = queries[0]?.query.analysisReference ?? null;
  if (contextError) {
    return {
      status: "incompatible_context",
      analysisReference,
      reason: contextError,
      candidates: [],
    };
  }

  const candidateById = new Map<string, { name: string; evidenceByRequest: Map<string, NormalizedAffinityEvidence> }>();
  for (const query of queries) {
    for (const evidence of query.evidence) {
      const current = candidateById.get(evidence.candidate.entityId) ?? {
        name: evidence.candidate.name,
        evidenceByRequest: new Map<string, NormalizedAffinityEvidence>(),
      };
      current.evidenceByRequest.set(query.query.requestReference, evidence);
      candidateById.set(evidence.candidate.entityId, current);
    }
  }

  const candidates: CandidateAffinityComparison[] = [...candidateById.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([candidateEntityId, candidate]) => {
      const observations: AffinityScopeObservation[] = queries.map((query) => ({
        requestReference: query.query.requestReference,
        scope: query.query.scope,
        inputEntityIds: [...query.query.inputEntityIds],
        queryStatus: query.status,
        evidence: candidate.evidenceByRequest.get(query.query.requestReference) ?? null,
      }));
      return {
        candidateEntityId,
        candidateName: candidate.name,
        observations,
        numericComparison: {
          status: "not_performed" as const,
          reason: "Affinity values are preserved per query. Different input entity scopes are not numerically compared or converted to deltas.",
        },
      };
    });

  return { status: "compatible_context", analysisReference, candidates };
}

function describeProviderField(field: ProviderField<number>, label: string): string {
  switch (field.state) {
    case "returned":
      return `${label}=${field.value} (provider-returned)`;
    case "missing":
      return `${label}=missing`;
    case "invalid":
      return `${label}=invalid provider value`;
  }
}

export function describeAffinityScopeComparison(
  comparison: AffinityComparisonSet,
  candidateEntityId: string,
): string {
  if (comparison.status === "incompatible_context") {
    return `Affinity scopes were not compared: ${comparison.reason ?? "query contexts are incompatible"}`;
  }
  const candidate = comparison.candidates.find(({ candidateEntityId: id }) => id === candidateEntityId);
  if (!candidate) return "No normalized affinity evidence was available for this candidate.";
  const observations = candidate.observations.map((observation) => {
    if (!observation.evidence) {
      const result = observation.queryStatus === "empty"
        ? "the provider returned no candidates"
        : observation.queryStatus === "unavailable"
          ? "the request was unavailable"
          : observation.queryStatus === "invalid"
            ? "the response was invalid"
            : "the candidate was not returned";
      return `${observation.requestReference} (${observation.scope}, ${observation.inputEntityIds.join(", ")}): ${result}`;
    }
    const values = observation.evidence.providerValues;
    return `${observation.requestReference} (${observation.scope}, ${observation.inputEntityIds.join(", ")}): ${describeProviderField(values.affinity, "affinity")}; ${describeProviderField(values.affinityRank, "affinity_rank")}; explainability=${observation.evidence.explainability.coverage}`;
  });
  return `${observations.join(" | ")} ${candidate.numericComparison.reason}`;
}