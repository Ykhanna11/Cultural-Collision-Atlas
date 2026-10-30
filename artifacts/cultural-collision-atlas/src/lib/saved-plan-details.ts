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
  source: string | null;
  caveat: string | null;
  assumptions: string[];
  budgetRange: string | null;
  budgetStatus: string | null;
  strategySource: "ai_generated" | "deterministic_fallback" | null;
  userProvidedAssumptions: string[];
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
  const venue = isRecord(record.selectedVenue) ? record.selectedVenue : null;
  const selectedVenue: SavedPlanVenue | null =
    venue &&
    nonEmptyString(venue.providerVenueId) &&
    nonEmptyString(venue.name) &&
    typeof venue.latitude === "number" &&
    typeof venue.longitude === "number" &&
    Array.isArray(venue.categories) &&
    nonEmptyString(venue.attribution)
      ? {
          providerVenueId: venue.providerVenueId as string,
          name: venue.name as string,
          ...(nonEmptyString(venue.address) ? { address: venue.address as string } : {}),
          latitude: venue.latitude,
          longitude: venue.longitude,
          categories: venue.categories.flatMap((category) =>
            typeof category === "string" && category.trim()
              ? [category.trim()]
              : [],
          ),
          provider: typeof venue.provider === "string" ? venue.provider : "openstreetmap",
          attribution: venue.attribution as string,
          ...(nonEmptyString(venue.retrievedAt) ? { retrievedAt: venue.retrievedAt as string } : {}),
          ...(isRecord(venue.suitability) &&
          typeof venue.suitability.score === "number" &&
          nonEmptyString(venue.suitability.scoreLabel) &&
          nonEmptyString(venue.suitability.explanation)
            ? {
                suitability: {
                  score: venue.suitability.score,
                  scoreLabel: venue.suitability.scoreLabel as string,
                  explanation: venue.suitability.explanation as string,
                  evidence: Array.isArray(venue.suitability.evidence)
                    ? venue.suitability.evidence.flatMap((item): SavedPlanEvidenceItem[] => {
                        if (!isRecord(item)) return [];
                        const label = nonEmptyString(item.label);
                        const value = nonEmptyString(item.value);
                        return typeof item.kind === "string" && label && value
                          ? [{ kind: item.kind, label, value }]
                          : [];
                      })
                    : [],
                  missingData: Array.isArray(venue.suitability.missingData)
                    ? venue.suitability.missingData.flatMap((item) =>
                        typeof item === "string" && item.trim() ? [item.trim()] : [],
                      )
                    : [],
                },
              }
            : {}),
        }
      : null;

  return {
    sections,
    evidence,
    selectedVenue,
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
  };
}
