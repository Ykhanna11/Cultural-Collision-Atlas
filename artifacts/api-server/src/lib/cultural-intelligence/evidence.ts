import type { QlooRecommendationType } from "../qloo/insights";

export type AffinityQueryScope = "single_interest" | "joint_interest";

export type AffinityQueryStatus =
  | "complete"
  | "partial"
  | "empty"
  | "unavailable"
  | "invalid";

export type ProviderField<T> =
  | { state: "returned"; value: T; providerValue: unknown }
  | { state: "missing"; value: null }
  | { state: "invalid"; value: null; providerValue: unknown };

export interface AffinityQueryContext {
  analysisReference: string;
  requestReference: string;
  scope: AffinityQueryScope;
  inputEntityIds: string[];
  recommendationType: QlooRecommendationType;
  city: string;
  cityEntityId?: string;
  observedAt?: string;
}

export interface NormalizedInputAttribution {
  entityId: string;
  score: number;
  matchesInput: boolean;
  positive: boolean;
}

export type ExplainabilityCoverage =
  | "both_inputs_attributed"
  | "one_input_attributed"
  | "no_positive_attribution"
  | "unavailable"
  | "invalid"
  | "partial";

export interface NormalizedAffinityEvidence {
  provider: "qloo_api";
  evidenceType: "recommendation";
  query: AffinityQueryContext;
  candidate: {
    entityId: string;
    name: string;
    tags: unknown;
    localityCityEntityId: string | null;
  };
  providerValues: {
    affinity: ProviderField<number>;
    affinityRank: ProviderField<number>;
  };
  explainability: {
    coverage: ExplainabilityCoverage;
    providerValue: Record<string, unknown> | null;
    inputAttributions: NormalizedInputAttribution[];
    invalidSignalCount: number;
  };
  completeness: {
    status: "complete" | "partial";
    missingFields: string[];
    invalidFields: string[];
  };
  source: {
    reference: "Qloo Insights API";
    providerTimestamp: string | null;
    observedAt: string;
  };
}

export interface NormalizedAffinityQuery {
  query: AffinityQueryContext;
  status: AffinityQueryStatus;
  evidence: NormalizedAffinityEvidence[];
  invalidCandidateCount: number;
  unavailableReason?: "request_failed";
}

export interface AffinityScopeObservation {
  requestReference: string;
  scope: AffinityQueryScope;
  inputEntityIds: string[];
  queryStatus: AffinityQueryStatus;
  evidence: NormalizedAffinityEvidence | null;
}

export interface CandidateAffinityComparison {
  candidateEntityId: string;
  candidateName: string;
  observations: AffinityScopeObservation[];
  numericComparison: {
    status: "not_performed";
    reason: string;
  };
}

export interface AffinityComparisonSet {
  status: "compatible_context" | "incompatible_context";
  analysisReference: string | null;
  reason?: string;
  candidates: CandidateAffinityComparison[];
}