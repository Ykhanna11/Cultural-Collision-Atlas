import type { Venue } from "./venue-source";

export interface VenueSuitabilityEvidence {
  kind: "venue_fact" | "category_match" | "geographic_context" | "bridge_evidence" | "qloo_evidence" | "missing_data";
  label: string;
  value: string;
}

export interface VenueSuitabilityInput {
  venue: Venue;
  interestA: string;
  interestB: string;
  bridgeName?: string;
  categories?: string[];
  qlooEvidence?: Array<{ source: string; label: string; value: string; kind: string }>;
}

export function assessVenueSuitability(input: VenueSuitabilityInput) {
  const evidence: VenueSuitabilityEvidence[] = [
    {
      kind: "venue_fact",
      label: "Venue category",
      value: input.venue.categories.join(", ") || "Not normalized by provider",
    },
  ];
  const requestedCategories = input.categories ?? [];
  const categoryMatch = requestedCategories.some((category) => input.venue.categories.includes(category));
  if (requestedCategories.length) {
    evidence.push({
      kind: "category_match",
      label: "Category match",
      value: categoryMatch
        ? `Matches requested ${requestedCategories.join(", ")} category evidence.`
        : "No normalized category overlap with the requested filter.",
    });
  }
  if (input.qlooEvidence?.length) {
    evidence.push(...input.qlooEvidence.map((item) => ({
      kind: "qloo_evidence" as const,
      label: item.label,
      value: `${item.value} (${item.source})`,
    })));
  } else {
    evidence.push({
      kind: "missing_data",
      label: "Qloo evidence unavailable",
      value: "No validated Qloo bridge evidence was supplied for this venue assessment.",
    });
  }
  evidence.push({
    kind: "geographic_context",
    label: "Geographic evidence",
    value: "Venue coordinates were returned by OpenStreetMap.",
  });
  evidence.push({
    kind: "bridge_evidence",
    label: "Cultural hypothesis",
    value: `Evaluate this venue against ${input.interestA} and ${input.interestB}${input.bridgeName ? ` through the “${input.bridgeName}” bridge` : ""}. This is a recommendation hypothesis, not proof of audience fit.`,
  });
  if (!input.venue.website) {
    evidence.push({
      kind: "missing_data",
      label: "Missing data",
      value: "No provider-supplied website is available.",
    });
  }
  if (!input.venue.phone) {
    evidence.push({
      kind: "missing_data",
      label: "Missing data",
      value: "No provider-supplied phone number is available.",
    });
  }

  const score = Math.max(0, Math.min(100,
    35 +
    (categoryMatch ? 25 : 0) +
    (input.venue.website ? 5 : 0) +
    (input.venue.openingHours ? 5 : 0),
  ));
  return {
    score,
    scoreLabel: "Operational data completeness and category fit; this score is not a probability of cultural relevance or campaign success",
    explanation:
      `This venue is associated with ${input.venue.categories.join(", ")} in OpenStreetMap. Its relevance to ${input.interestA} and ${input.interestB} remains a cultural hypothesis and should be validated.`,
    evidence,
    missingData: evidence
      .filter((item) => item.kind === "missing_data")
      .map((item) => item.value),
  };
}
