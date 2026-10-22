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
  source: string | null;
  caveat: string | null;
  assumptions: string[];
  budgetRange: string | null;
  budgetStatus: string | null;
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

  return {
    sections,
    evidence,
    source: nonEmptyString(record.source),
    caveat: nonEmptyString(record.caveat),
    assumptions,
    budgetRange:
      nonEmptyString(planningEstimates.budgetRange) ??
      nonEmptyString(record.budgetRange),
    budgetStatus: nonEmptyString(planningEstimates.status),
  };
}
