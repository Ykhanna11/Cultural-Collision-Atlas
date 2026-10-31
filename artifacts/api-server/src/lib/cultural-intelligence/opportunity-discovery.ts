import type {
  ActivationOpportunityCandidate,
  ActivationOpportunitySuggestion,
  ActivationOpportunityVerifiedEvidence,
  UnifiedOpportunityAnalysis,
} from "@workspace/api-zod";

export interface OpportunityDiscoveryContext {
  interestA: string;
  interestB: string;
  city: string;
  candidateName: string;
  analysisReference?: string;
}

export interface OpportunityVenueRecord {
  provider: string;
  providerVenueId: string;
  name: string;
  categories: string[];
  attribution: string;
  address?: string;
}

export interface OpportunityDiscoveryInput {
  analysis: UnifiedOpportunityAnalysis;
  context: OpportunityDiscoveryContext;
  venueRecords?: OpportunityVenueRecord[];
}

export interface OpportunityDiscoveryResult {
  status: "ok" | "insufficient_evidence";
  opportunities: ActivationOpportunityCandidate[];
  reason?: string;
}

const STATIC_LIMITATIONS = [
  "This opportunity is a hypothesis only; it does not establish audience overlap or attendance.",
  "No venue availability, footfall, cost, or campaign outcome is claimed by this engine.",
  "Follow-up validation is required before committing budget, partners, or permits.",
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "opportunity";
}

function collectVerifiedEvidence(analysis: UnifiedOpportunityAnalysis, context: OpportunityDiscoveryContext, venueRecords: OpportunityVenueRecord[]): ActivationOpportunityVerifiedEvidence[] {
  const evidence: ActivationOpportunityVerifiedEvidence[] = [];

  const addEvidence = (item: ActivationOpportunityVerifiedEvidence) => {
    const normalizedReference = item.sourceReference?.trim();
    if (!normalizedReference) {
      return;
    }
    evidence.push({ ...item, sourceReference: normalizedReference });
  };

  if (analysis.affinity?.jointAffinityStatus === "returned" && typeof analysis.affinity.jointAffinity === "number") {
    addEvidence({
      source: "Qloo Insights API",
      sourceReference: `Qloo Insights API · ${analysis.candidateId}`,
      establishes: "Qloo returned a joint-affinity signal for the selected candidate in the requested city. This is aggregate evidence only and does not prove real audience overlap.",
      category: "cultural_affinity",
    });
  }

  if (analysis.overlap?.status === "complete" && analysis.overlap.jaccard.status === "available" && analysis.overlap.jaccard.value !== null) {
    addEvidence({
      source: "Taste-analysis overlap",
      sourceReference: analysis.overlap.sourceReferences.join(", ") || `Taste-analysis overlap · ${context.candidateName}`,
      establishes: `Exact stable tag overlap was computed for ${context.interestA} and ${context.interestB}. This indicates descriptor similarity only and is not proof of shared audience membership.`,
      category: "descriptive_overlap",
    });
  }

  if (analysis.scores?.components.geographicSignal.status === "available") {
    addEvidence({
      source: "Qloo Insights API",
      sourceReference: analysis.scores.components.geographicSignal.sourceReferences.join(", ") || "Qloo Insights API",
      establishes: "The geographic signal was returned in the requested bounds. This indicates spatial relevance only, not venue availability or audience concentration.",
      category: "geographic_signal",
    });
  }

  if (analysis.scores?.components.venueReadiness.status === "available") {
    addEvidence({
      source: "Venue suitability assessment",
      sourceReference: analysis.scores.components.venueReadiness.sourceReferences.join(", ") || "Venue suitability assessment",
      establishes: "A venue-readiness assessment was available for this opportunity. It reflects operational suitability only and does not establish cultural relevance.",
      category: "venue_readiness",
    });
  }

  for (const venue of venueRecords) {
    addEvidence({
      source: venue.provider,
      sourceReference: `${venue.provider}:${venue.providerVenueId}`,
      establishes: `${venue.name} was returned as a venue record in the requested bounds. This is a provider fact about the venue footprint, not current availability or audience fit.`,
      category: "venue_fact",
    });
  }

  return evidence;
}

function collectMissingEvidence(analysis: UnifiedOpportunityAnalysis, venueRecords: OpportunityVenueRecord[]): string[] {
  const missing: string[] = [];

  if (analysis.affinity?.jointAffinityStatus !== "returned") {
    missing.push("No verified joint-affinity signal was returned for this candidate.");
  }
  if (analysis.overlap?.status !== "complete") {
    missing.push("Descriptor overlap is incomplete or unavailable.");
  }
  if (analysis.scores?.components.geographicSignal.status !== "available") {
    missing.push("No geographic signal was available in the requested bounds.");
  }
  if (analysis.scores?.components.venueReadiness.status !== "available") {
    missing.push("No valid venue-readiness assessment with source references is available.");
  }
  if (venueRecords.length === 0) {
    missing.push("No provider venue records were returned in the requested bounds.");
  }

  return [...new Set(missing)];
}

function candidateThemesFromOverlap(analysis: UnifiedOpportunityAnalysis): string[] {
  const names = (analysis.overlap?.matchingTags ?? [])
    .map((tag) => [tag.interestAName, tag.interestBName])
    .flat()
    .filter((name): name is string => Boolean(name));

  return [...new Set(names.slice(0, 3))];
}

function deriveActivationFormats(analysis: UnifiedOpportunityAnalysis, venueRecords: OpportunityVenueRecord[]): string[] {
  const formats: string[] = [];
  const venueCategories = venueRecords.flatMap((venue) => venue.categories ?? []).map((category) => category.toLowerCase());

  if (analysis.scores?.components.geographicSignal.status === "available") {
    formats.push("local activation");
  }
  if (venueCategories.some((category) => /event|culture|music|food|night|venue/.test(category))) {
    formats.push("pop-up showcase");
    formats.push("small venue pilot");
  }
  if (analysis.scores?.components.venueReadiness.status === "available") {
    formats.push("guided venue concept test");
  }
  if (analysis.affinity?.jointAffinityStatus === "returned" || analysis.overlap?.status === "complete") {
    formats.push("small concept test");
  }

  return [...new Set(formats)].slice(0, 4);
}

function buildAudienceHypothesis(context: OpportunityDiscoveryContext, analysis: UnifiedOpportunityAnalysis): string | null {
  const hasAudienceEvidence = analysis.affinity?.jointAffinityStatus === "returned" || analysis.overlap?.status === "complete";

  if (!hasAudienceEvidence) {
    return null;
  }

  const themes = candidateThemesFromOverlap(analysis);
  const themePhrase = themes.length > 0 ? themes.join(" / ") : `${context.interestA} + ${context.interestB}`;

  return `Hypothesis: a small pilot audience aligned with the shared ${themePhrase} signal may be the most relevant early segment for ${context.candidateName}. This is a strategic hypothesis based on cultural affinity and descriptor overlap only; it does not describe a verified audience profile or demand estimate.`;
}

function buildSuggestion(
  context: OpportunityDiscoveryContext,
  title: string,
  evidence: ActivationOpportunityVerifiedEvidence[],
  analysis: UnifiedOpportunityAnalysis,
  venueRecords: OpportunityVenueRecord[],
): ActivationOpportunitySuggestion[] {
  const themes = candidateThemesFromOverlap(analysis);
  const formats = deriveActivationFormats(analysis, venueRecords);
  const evidenceReferences = evidence
    .map((item) => item.sourceReference)
    .filter((reference): reference is string => typeof reference === "string" && reference.trim().length > 0);
  const noteBase = evidenceReferences.length > 0
    ? `Hypothesis only. Supporting evidence: ${evidenceReferences.join("; ")}.`
    : "Hypothesis only. The current evidence set is intentionally conservative and does not establish verified audience demand.";

  const suggestion: ActivationOpportunitySuggestion = {
    candidateAudienceHypothesis: buildAudienceHypothesis(context, analysis) ?? `Hypothesis: no audience segment can be inferred from the current evidence for ${context.candidateName}. This remains intentionally conservative and avoids unsupported demographic or performance claims.`,
    culturalThemes: themes.length > 0 ? themes : [context.interestA, context.interestB],
    activationFormats: formats.length > 0 ? formats : ["guided concept test"],
    supportingEvidenceReferences: evidenceReferences,
    note: `${noteBase} This suggestion is a strategic hypothesis for ${title}; it does not establish venue availability, attendance, or conversion outcomes.`,
  };

  return [suggestion];
}

function makeCandidate(
  idPrefix: string,
  title: string,
  opportunityType: string,
  rationale: string,
  evidence: ActivationOpportunityVerifiedEvidence[],
  suggestions: ActivationOpportunitySuggestion[],
  missingEvidence: string[],
): ActivationOpportunityCandidate {
  return {
    id: `${idPrefix}-${slugify(title)}`,
    title,
    opportunityType,
    rationale,
    verifiedEvidence: evidence,
    inferredSuggestions: suggestions,
    missingEvidence: missingEvidence.length ? missingEvidence : ["No additional missing evidence is currently flagged for this candidate."],
    limitations: [...STATIC_LIMITATIONS],
  };
}

export function generateActivationOpportunities(input: OpportunityDiscoveryInput): OpportunityDiscoveryResult {
  const { analysis, context, venueRecords = [] } = input;
  const verifiedEvidence = collectVerifiedEvidence(analysis, context, venueRecords);
  const missingEvidence = collectMissingEvidence(analysis, venueRecords);
  const evidencePresent = verifiedEvidence.length > 0 || venueRecords.length > 0 || analysis.scores?.components.geographicSignal.status === "available";

  if (!evidencePresent) {
    return {
      status: "insufficient_evidence",
      opportunities: [],
      reason: "Insufficient evidence: no verified cultural affinity, overlap, geographic signal, or venue fact was available to build a deterministic activation opportunity.",
    };
  }

  const overlapThemes = candidateThemesFromOverlap(analysis);
  const candidateTemplates: ActivationOpportunityCandidate[] = [];

  if (analysis.affinity?.jointAffinityStatus === "returned" || analysis.overlap?.status === "complete") {
    const bridgeEvidence = verifiedEvidence.filter((item) => item.category === "cultural_affinity" || item.category === "descriptive_overlap");
    candidateTemplates.push(
      makeCandidate(
        "bridge",
        `Bridge-led ${context.candidateName} activation`,
        "cultural_bridge",
        `The selected bridge has measurable cultural evidence and descriptor overlap. The engine is recommending a small, evidence-grounded concept to validate through opt-in participation, not to claim audience certainty.`,
        bridgeEvidence,
        buildSuggestion(context, `Bridge-led ${context.candidateName} activation`, bridgeEvidence, analysis, venueRecords),
        missingEvidence,
      ),
    );
  }

  if (analysis.scores?.components.geographicSignal.status === "available" || venueRecords.length > 0) {
    const venueTemplate = venueRecords[0]
      ? `Venue-led ${venueRecords[0].name} concept`
      : `${context.city} place-based activation`;
    const opportunityType = venueRecords[0] ? "venue_activation" : "place_based";
    const venueEvidence = verifiedEvidence.filter((item) => item.category === "geographic_signal" || item.category === "venue_fact" || item.category === "venue_readiness");
    candidateTemplates.push(
      makeCandidate(
        "venue",
        venueTemplate,
        opportunityType,
        `The geographic and venue evidence indicates a place-based opportunity in ${context.city}. The recommendation remains a hypothesis and does not assert availability, footfall, or full cultural fit.`,
        venueEvidence,
        buildSuggestion(context, venueTemplate, venueEvidence, analysis, venueRecords),
        missingEvidence,
      ),
    );
  }

  if (analysis.overlap?.status === "complete" || analysis.affinity?.jointAffinityStatus === "returned") {
    const themeEvidence = verifiedEvidence.filter((item) => item.category === "cultural_affinity" || item.category === "descriptive_overlap");
    candidateTemplates.push(
      makeCandidate(
        "theme",
        `${context.interestA} × ${context.interestB} cultural concept`,
        "theme_experiment",
        `The evidence supports a shared cultural concept between ${context.interestA} and ${context.interestB}. The engine recommends a concept test rather than a guaranteed audience outcome.`,
        themeEvidence,
        buildSuggestion(context, `${context.interestA} × ${context.interestB} cultural concept`, themeEvidence, analysis, venueRecords),
        missingEvidence,
      ),
    );
  }

  const deduplicated = candidateTemplates.filter((candidate, index, arr) =>
    arr.findIndex((item) => item.title === candidate.title && item.opportunityType === candidate.opportunityType) === index,
  );

  const opportunities = deduplicated.slice(0, 5).map((candidate) => ({
    ...candidate,
    verifiedEvidence: [...candidate.verifiedEvidence].sort((a, b) =>
      (a.sourceReference ?? "").localeCompare(b.sourceReference ?? ""),
    ),
  }));

  if (opportunities.length === 0) {
    return {
      status: "insufficient_evidence",
      opportunities: [],
      reason: "Insufficient evidence: no deterministic opportunity templates could be assembled from available Phase 2 signals.",
    };
  }

  return {
    status: "ok",
    opportunities,
  };
}
