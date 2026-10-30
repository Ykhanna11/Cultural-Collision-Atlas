import {
  isGeographicAnalysisSnapshot,
  type GeographicAnalysisSnapshot,
} from "./product-workflow";

export interface SavedPlanSection {
  title: string;
  content: string;
}

export interface SavedPlanEvidence {
  label: string;
  value: string;
  source: string;
  kind: "observed_api" | "external_data" | "derived" | "hypothesis";
}

export interface SavedPlanDetails {
  sections: SavedPlanSection[];
  evidence: SavedPlanEvidence[];
  selectedVenue: SavedPlanVenue | null;
  selectedVenues: SavedPlanVenue[];
  source: string | null;
  caveat: string | null;
  assumptions: string[];
  budgetRange: string | null;
  budgetStatus: string | null;
  strategySource: "ai_generated" | "deterministic_fallback" | null;
  userProvidedAssumptions: string[];
  geographicAnalysis?: GeographicAnalysisSnapshot;
}

export interface SavedPlanVenue {
  providerVenueId: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  categories: string[];
  provider: string;
  attribution: string;
  retrievedAt?: string;
  website?: string;
  phone?: string;
  email?: string;
  sourceMetadata?: {
    basicCategory?: string;
    taxonomy?: string[];
    operatingStatus?: string;
    sources?: Array<{
      dataset?: string;
      license?: string;
      provider?: string;
      recordId?: string;
      version?: string;
    }>;
  };
  suitability?: {
    score: number;
    scoreLabel: string;
    explanation: string;
    evidence: SavedPlanEvidenceItem[];
    missingData: string[];
  };
}

export interface SavedPlanEvidenceItem {
  kind: string;
  label: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isEvidenceKind(value: unknown): value is SavedPlanEvidence["kind"] {
  return (
    value === "observed_api" ||
    value === "external_data" ||
    value === "derived" ||
    value === "hypothesis"
  );
}

function parseSavedVenue(value: unknown): SavedPlanVenue | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.providerVenueId) ||
    !nonEmptyString(value.name) ||
    typeof value.latitude !== "number" ||
    typeof value.longitude !== "number" ||
    !Array.isArray(value.categories) ||
    !nonEmptyString(value.attribution)
  ) return null;

  const sourceMetadata = isRecord(value.sourceMetadata) ? value.sourceMetadata : null;
  const sources = sourceMetadata && Array.isArray(sourceMetadata.sources)
    ? sourceMetadata.sources.flatMap((source) => {
        if (!isRecord(source)) return [];
        const fields = ["dataset", "license", "provider", "recordId", "version"] as const;
        const parsed = Object.fromEntries(fields.flatMap((field) => {
          const entry = nonEmptyString(source[field]);
          return entry ? [[field, entry]] : [];
        }));
        return Object.keys(parsed).length ? [parsed] : [];
      })
    : undefined;
  const suitability = isRecord(value.suitability) ? value.suitability : null;
  return {
    providerVenueId: value.providerVenueId as string,
    name: value.name as string,
    ...(nonEmptyString(value.address) && { address: value.address as string }),
    latitude: value.latitude,
    longitude: value.longitude,
    categories: value.categories.flatMap((category) =>
      typeof category === "string" && category.trim() ? [category.trim()] : [],
    ),
    provider: typeof value.provider === "string" ? value.provider : "openstreetmap",
    attribution: value.attribution as string,
    ...(nonEmptyString(value.retrievedAt) && { retrievedAt: value.retrievedAt as string }),
    ...(nonEmptyString(value.website) && { website: value.website as string }),
    ...(nonEmptyString(value.phone) && { phone: value.phone as string }),
    ...(nonEmptyString(value.email) && { email: value.email as string }),
    ...(sourceMetadata && {
      sourceMetadata: {
        ...(nonEmptyString(sourceMetadata.basicCategory) && { basicCategory: sourceMetadata.basicCategory as string }),
        ...(Array.isArray(sourceMetadata.taxonomy) && {
          taxonomy: sourceMetadata.taxonomy.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []),
        }),
        ...(nonEmptyString(sourceMetadata.operatingStatus) && { operatingStatus: sourceMetadata.operatingStatus as string }),
        ...(sources?.length && { sources }),
      },
    }),
    ...(suitability &&
    typeof suitability.score === "number" &&
    nonEmptyString(suitability.scoreLabel) &&
    nonEmptyString(suitability.explanation)
      ? {
          suitability: {
            score: suitability.score,
            scoreLabel: suitability.scoreLabel as string,
            explanation: suitability.explanation as string,
            evidence: Array.isArray(suitability.evidence)
              ? suitability.evidence.flatMap((item): SavedPlanEvidenceItem[] => {
                  if (!isRecord(item)) return [];
                  const label = nonEmptyString(item.label);
                  const itemValue = nonEmptyString(item.value);
                  return typeof item.kind === "string" && label && itemValue
                    ? [{ kind: item.kind, label, value: itemValue }]
                    : [];
                })
              : [],
            missingData: Array.isArray(suitability.missingData)
              ? suitability.missingData.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
              : [],
          },
        }
      : {}),
  };
}

export function getSavedPlanDetails(plan: unknown): SavedPlanDetails {
  const record = isRecord(plan) ? plan : {};
  const sections = Array.isArray(record.sections)
    ? record.sections.flatMap((section): SavedPlanSection[] => {
        if (!isRecord(section)) return [];
        const title = nonEmptyString(section.title);
        const content = nonEmptyString(section.content);
        return title && content ? [{ title, content }] : [];
      })
    : [];
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.flatMap((item): SavedPlanEvidence[] => {
        if (!isRecord(item)) return [];
        const label = nonEmptyString(item.label);
        const value = nonEmptyString(item.value);
        const source = nonEmptyString(item.source);
        if (!label || !value || !source || !isEvidenceKind(item.kind))
          return [];
        return [{ label, value, source, kind: item.kind }];
      })
    : [];
  const assumptions = Array.isArray(record.assumptions)
    ? record.assumptions.flatMap((assumption) => {
        const value = nonEmptyString(assumption);
        return value ? [value] : [];
      })
    : [];
  const planningEstimates = isRecord(record.planningEstimates)
    ? record.planningEstimates
    : {};
  const selectedVenues = Array.isArray(record.selectedVenues)
    ? record.selectedVenues.map(parseSavedVenue).filter((venue): venue is SavedPlanVenue => Boolean(venue))
    : [parseSavedVenue(record.selectedVenue)].filter((venue): venue is SavedPlanVenue => Boolean(venue));
  const selectedVenue = selectedVenues[0] ?? null;
  const geographicAnalysis = isGeographicAnalysisSnapshot(record.geographicAnalysis)
    ? record.geographicAnalysis
    : undefined;

  return {
    sections,
    evidence,
    selectedVenue,
    selectedVenues,
    source: nonEmptyString(record.source),
    caveat: nonEmptyString(record.caveat),
    assumptions,
    budgetRange:
      nonEmptyString(planningEstimates.budgetRange) ??
      nonEmptyString(record.budgetRange),
    budgetStatus: nonEmptyString(planningEstimates.status),
    strategySource:
      record.strategySource === "ai_generated" ||
      record.strategySource === "deterministic_fallback"
        ? record.strategySource
        : null,
    userProvidedAssumptions: Array.isArray(record.userProvidedAssumptions)
      ? record.userProvidedAssumptions.flatMap((assumption) => {
          const value = nonEmptyString(assumption);
          return value ? [value] : [];
        })
      : [],
      ...(geographicAnalysis && { geographicAnalysis }),
  };
}
