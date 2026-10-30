import type {
  BridgeCandidate,
  DiscoveryInput,
  DiscoveryResponse,
  ActivationStrategy,
  ActivationPlannerResponse,
} from "@workspace/api-client-react";

export interface ActivationPlanDraft {
  form: DiscoveryInput;
  candidate: BridgeCandidate;
  response: DiscoveryResponse;
  venue?: ActivationPlanVenue;
  venues?: ActivationPlanVenue[];
  venueSuitabilities?: Record<string, VenueSuitabilityContext>;
  venueSuitability?: VenueSuitabilityContext;
}

export interface ActivationPlanVenue {
  provider?: string;
  providerVenueId: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  categories: string[];
  website?: string;
  phone?: string;
  email?: string;
  openingHours?: string;
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
  suitability?: VenueSuitabilityContext;
  attribution: string;
  retrievedAt?: string;
}

export interface VenueSuitabilityContext {
  score: number;
  scoreLabel: string;
  explanation: string;
  evidence: Array<{
    kind: string;
    label: string;
    value: string;
  }>;
  missingData: string[];
}

function venuesForDraft(draft: ActivationPlanDraft): ActivationPlanVenue[] {
  return draft.venues?.length ? draft.venues : draft.venue ? [draft.venue] : [];
}

function suitabilityForVenue(draft: ActivationPlanDraft, venue: ActivationPlanVenue, index: number) {
  return draft.venueSuitabilities?.[venue.providerVenueId] ?? (index === 0 ? draft.venueSuitability : undefined);
}

export function buildSelectedVenueSection(draft: ActivationPlanDraft) {
  const venues = venuesForDraft(draft);
  if (!venues.length) return null;
  const facts = venues.map((venue, index) => {
    const suitability = suitabilityForVenue(draft, venue, index);
    const assessment = suitability
      ? ` Assessment: ${suitability.scoreLabel}. ${suitability.explanation} Evidence: ${suitability.evidence.map((item) => `${item.label}: ${item.value}`).join(" | ") || "No evidence returned."}${suitability.missingData.length ? ` Missing data: ${suitability.missingData.join("; ")}.` : ""}`
      : " Assessment: not requested.";
    return `${venue.name}; address: ${venue.address ?? "not provided"}; coordinates: ${venue.latitude.toFixed(5)}, ${venue.longitude.toFixed(5)}; provider ID: ${venue.providerVenueId}; categories: ${venue.categories.join(", ") || "not provided"}; source: ${venue.attribution}.${assessment}`;
  });
  return {
    title: "Selected venues · provider facts",
    content: `Provider-sourced venue facts:\n${facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n")}\nAI recommendations are hypotheses and do not confirm venue availability, suitability, permissions, accessibility, capacity, costs, or campaign outcomes.`,
  };
}

export function buildDiscoverySaveInput(
  form: DiscoveryInput,
  response: DiscoveryResponse,
  candidate: BridgeCandidate,
  venues: ActivationPlanVenue[] = [],
  venueSuitabilities: Record<string, VenueSuitabilityContext> = {},
) {
  const selectedVenues = venues.map((venue) => ({
    ...venue,
    ...(venueSuitabilities[venue.providerVenueId] && {
      suitability: venueSuitabilities[venue.providerVenueId],
    }),
  }));
  return {
    title: `${form.interestA} × ${form.interestB}`,
    city: form.city,
    interestA: form.interestA,
    interestB: form.interestB,
    result: {
      source: response.source,
      generatedAt: response.generatedAt,
      caveat: response.caveat,
      selectedBridge: candidate,
      ...(selectedVenues.length > 0 && { selectedVenues }),
    },
  };
}

export function buildActivationPlanContent(draft: ActivationPlanDraft) {
  const venues = venuesForDraft(draft);
  return {
    sections: [
      {
        title: "Strategic rationale",
        content: `Observed bridge candidate: ${draft.candidate.name}. Hypothesis: it may provide a relevant meeting point between ${draft.form.interestA} and ${draft.form.interestB}. The aggregate affinity evidence does not establish that the same individuals share both interests.`,
      },
      {
        title: "Audience hypothesis",
        content:
          draft.form.audienceDescription?.trim() ||
          `Hypothesis to validate: some people in ${draft.form.city} interested in ${draft.form.interestA} may also respond to an experience involving ${draft.form.interestB}. The audience has not been identified or measured.`,
      },
      {
        title: "Recommended experience",
        content: `Working concept for a ${draft.form.activationType.replaceAll("_", " ")} in ${draft.form.city}: prototype a participatory experience around ${draft.candidate.name}, with cultural contributors shaping the concept. This is a creative direction, not a validated recommendation. Objective supplied for planning: ${draft.form.objective}`,
      },
      {
        title: "Venue options",
        content: venues.length
          ? `${venues.map((venue) => `Provider-sourced venue: ${venue.name}${venue.address ? `, ${venue.address}` : ""}. Categories: ${venue.categories.join(", ") || "not provided"}. Coordinates: ${venue.latitude.toFixed(5)}, ${venue.longitude.toFixed(5)}. Provider ID: ${venue.providerVenueId}. Source: ${venue.attribution}`).join("\n")}\nVerify suitability, availability, accessibility, permissions, capacity and costs before planning.`
          : "None sourced. No venue has been selected, so no venue names, addresses, capacities, availability, or suitability claims are included.",
      },
      {
        title: "Budget breakdown",
        content: `No itemized vendor quotes are available. The entered range (${draft.form.budgetRange}) is a user-supplied planning constraint, not an estimate. Obtain sourced quotes for venue, production, contributors, accessibility, insurance, staffing, and measurement before approving spend.`,
      },
      {
        title: "Execution timeline",
        content:
          "1. Validate the concept with the intended audience and local contributors before booking. 2. Source venues and partners; confirm availability, permissions, accessibility, and itemized costs. 3. Produce a small opt-in pilot only after approvals. 4. Measure the agreed objectives during and after the pilot; timing depends on partner and venue confirmation.",
      },
      {
        title: "Partners and resources",
        content:
          "To source and validate: local cultural contributors, a venue host, a production lead, research support, accessibility and safety support, and any required permits. No partner is confirmed.",
      },
      {
        title: "Risks and mitigations",
        content:
          "The bridge may not resonate: test it with the intended audience first. The concept may feel extractive or tokenizing: involve compensated cultural contributors early and give them meaningful decision-making power. Venue, permissions, and costs are unknown: obtain written confirmation and itemized quotes before committing.",
      },
      {
        title: "Success metrics",
        content:
          "Proposed measures to agree before the pilot: qualified opt-ins, participation rate, concept recall, participant-reported relevance, and follow-up interest in the experience. No target values or outcomes are forecast.",
      },
      {
        title: "Audience-interest test",
        content: `Run a small, opt-in concept test with people who self-identify as interested in ${draft.form.interestA}, ${draft.form.interestB}, or both. Show a neutral ${draft.candidate.name} experience concept, measure stated relevance, and record how the sample was recruited. Stated interest is not a forecast of attendance or campaign performance.`,
      },
    ],
    planningEstimates: {
      budgetRange: draft.form.budgetRange,
      status:
        "User-supplied planning input only; not a cost estimate or supplier quote.",
    },
    evidence: draft.candidate.evidence,
    source: draft.response.source,
    caveat: draft.response.caveat,
    assumptions: [
      "Audience fit and experience direction are hypotheses to test.",
      "No venue, partner, permit, or supplier quote has been confirmed.",
      "Costs, attendance, and campaign outcomes are not estimates or guarantees.",
    ],
  };
}

export function buildActivationPlanExportPayload(
  title: string,
  draft: ActivationPlanDraft,
  planContent: ReturnType<typeof buildActivationPlanContent>,
  agentResult?: ActivationPlannerResponse,
) {
  return {
    title,
    city: draft.form.city,
    interests: [draft.form.interestA, draft.form.interestB],
    bridge: draft.candidate.name,
    objective: draft.form.objective,
    plan: buildActivationPlanSaveInput(title, draft, planContent, agentResult).plan,
  };
}

export function buildActivationStrategySections(strategy: ActivationStrategy) {
  const cited = (text: string, references: string[]) =>
    `${text}${references.length ? ` [${references.join(", ")}]` : ""}`;

  return [
    { title: "Executive opportunity summary", content: strategy.executiveSummary },
    { title: "Opportunity hypothesis", content: strategy.opportunity },
    {
      title: "Target audience hypothesis",
      content: [
        strategy.targetAudience.hypothesis,
        ...strategy.targetAudience.rationale.map(({ claim, evidenceReferences }) =>
          cited(claim, evidenceReferences),
        ),
      ].join("\n"),
    },
    {
      title: "Cultural insights · Qloo evidence",
      content: strategy.culturalInsights
        .map(({ insight, evidenceReferences }) => cited(insight, evidenceReferences))
        .join("\n"),
    },
    {
      title: "Campaign concept",
      content: `${strategy.campaignConcept.name}\n${strategy.campaignConcept.narrative}\nCreative direction: ${strategy.campaignConcept.creativeDirection}`,
    },
    {
      title: "Activation channels",
      content: strategy.activationChannels.join("\n"),
    },
    {
      title: "Partnership categories",
      content: strategy.partnershipCategories.join("\n"),
    },
    {
      title: "Execution timeline",
      content: strategy.executionTimeline
        .map(({ phase, tasks, deliverables }) =>
          `${phase}\nTasks: ${tasks.join("; ")}\nDeliverables: ${deliverables.join("; ")}`,
        )
        .join("\n\n"),
    },
    {
      title: "Success metrics",
      content: strategy.successMetrics
        .map(({ metric, rationale, measurementMethod }) =>
          `${metric}\nWhy: ${rationale}\nMeasure: ${measurementMethod}`,
        )
        .join("\n\n"),
    },
    {
      title: "Risks and assumptions",
      content: strategy.risksAndAssumptions
        .map(({ category, statement, mitigation }) =>
          `${category === "risk" ? "Risk" : "Model assumption"}: ${statement}\nMitigation: ${mitigation}`,
        )
        .join("\n\n"),
    },
    {
      title: "Validation experiments",
      content: strategy.validationExperiments
        .map(({ experiment, method, decisionSignal }) =>
          `${experiment}\nMethod: ${method}\nDecision signal: ${decisionSignal}`,
        )
        .join("\n\n"),
    },
  ];
}

export function buildActivationPlanSaveInput(
  title: string,
  draft: ActivationPlanDraft,
  plan: ReturnType<typeof buildActivationPlanContent>,
  agentResult?: ActivationPlannerResponse,
) {
  const aiGenerated = agentResult?.source === "ai_generated";
  const strategyEvidence = agentResult?.evidence.map((item) => ({
    source: "Qloo Insights API",
    label: `${item.kind} · ${item.referenceId}`,
    value: `${item.name} (${item.entityId})${Object.entries(item.details).length
      ? ` · ${Object.entries(item.details)
          .map(([key, value]) => `${key}=${value ?? "not returned"}`)
          .join(", ")}`
      : ""}`,
    kind: "observed_api" as const,
  })) ?? [];
  const strategySections = agentResult
    ? buildActivationStrategySections(agentResult.strategy)
    : [];
  const selectedVenueSection = buildSelectedVenueSection(draft);
  const venues = venuesForDraft(draft);
  const selectedVenues = venues.map((venue, index) => ({
    ...venue,
    ...(suitabilityForVenue(draft, venue, index) && {
      suitability: suitabilityForVenue(draft, venue, index),
    }),
  }));
  return {
    title,
    city: draft.form.city,
    interestA: draft.form.interestA,
    interestB: draft.form.interestB,
    bridgeName: draft.candidate.name,
    objective: draft.form.objective,
    plan: {
      ...plan,
      sections: aiGenerated
        ? [...strategySections, ...(selectedVenueSection ? [selectedVenueSection] : [])]
        : [...plan.sections, ...(selectedVenueSection ? [selectedVenueSection] : [])],
      ...(selectedVenues.length > 0 && {
        selectedVenue: selectedVenues[0],
        selectedVenues,
      }),
      strategySource: agentResult?.source ?? "deterministic_fallback",
      ...(agentResult && {
        strategy: agentResult.strategy,
        userProvidedAssumptions: agentResult.userProvidedAssumptions,
        agent: agentResult,
        ...(agentResult.fallbackReason && {
          fallbackReason: agentResult.fallbackReason,
        }),
      }),
      evidence: [...plan.evidence, ...strategyEvidence],
      source: plan.source,
      caveat: agentResult?.caveat ?? plan.caveat,
    },
  };
}

export interface SavedDiscoveryDetails {
  candidate: BridgeCandidate | null;
  source: string | null;
  caveat: string | null;
  venues: ActivationPlanVenue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBridgeCandidate(value: unknown): value is BridgeCandidate {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.explanation === "string" &&
    typeof value.score === "number" &&
    typeof value.scoreDescription === "string" &&
    (value.confidence === "high" ||
      value.confidence === "medium" ||
      value.confidence === "low") &&
    Array.isArray(value.evidence)
  );
}

export function getSavedDiscoveryDetails(
  value: unknown,
): SavedDiscoveryDetails {
  const result = isRecord(value) ? value : {};
  const candidate = isBridgeCandidate(result.selectedBridge)
    ? result.selectedBridge
    : null;
  const venues = Array.isArray(result.selectedVenues)
    ? result.selectedVenues.filter((venue): venue is ActivationPlanVenue =>
        isRecord(venue) &&
        typeof venue.providerVenueId === "string" &&
        typeof venue.name === "string" &&
        typeof venue.latitude === "number" &&
        typeof venue.longitude === "number" &&
        Array.isArray(venue.categories) &&
        typeof venue.attribution === "string",
      ) as ActivationPlanVenue[]
    : [];
  return {
    candidate,
    source: typeof result.source === "string" ? result.source : null,
    caveat: typeof result.caveat === "string" ? result.caveat : null,
    venues,
  };
}
