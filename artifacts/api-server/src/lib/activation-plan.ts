export interface ActivationPlanDraftInput {
  city: string;
  interestA: string;
  interestB: string;
  bridgeName: string;
  objective: string;
  activationType: string;
  audienceDescription?: string;
}

export function createActivationPlanDraft(input: ActivationPlanDraftInput) {
  const audience = input.audienceDescription?.trim()
    ? input.audienceDescription.trim()
    : `Hypothesis to validate: people in ${input.city} interested in ${input.interestA} may respond to an experience built around ${input.bridgeName} and ${input.interestB}.`;

  return {
    concept: `${input.bridgeName}: a ${input.activationType.replaceAll("_", " ")} connecting ${input.interestA} and ${input.interestB}`,
    rationale:
      "Planning hypothesis only. Validate the proposed bridge with the target audience before committing budget or partners.",
    targetAudienceHypothesis: audience,
    recommendedExperience:
      `Prototype a small, opt-in ${input.activationType.replaceAll("_", " ")} around ${input.bridgeName}. Treat the format and audience fit as hypotheses until tested.`,
    venueOptions: [],
    budgetBreakdown: {
      status: "not_estimated",
      message:
        "No vendor quotes or venue data are available. Add sourced prices before treating a budget as feasible.",
    },
    executionTimeline: [
      { phase: "Validate", timing: "Before production", task: "Run the proposed audience-interest test." },
      { phase: "Scope", timing: "After validation", task: "Request quotes and confirm permissions with sourced venues and partners." },
      { phase: "Produce", timing: "Schedule after approvals", task: "Finalize production, staffing, accessibility, and safety plans." },
      { phase: "Measure", timing: "During and after activation", task: `Measure outcomes against: ${input.objective}` },
    ],
    requiredPartners: ["Venue partner (to be sourced)", "Production partner (to be sourced)"],
    risksAndMitigations: [
      {
        risk: "The bridge may not resonate with the intended audience.",
        mitigation: "Test the concept with the intended audience before booking or producing.",
      },
      {
        risk: "Venue, production, and staffing costs are unknown.",
        mitigation: "Obtain itemized quotes and validate site constraints before approving spend.",
      },
    ],
    successMetrics: [
      "Qualified opt-ins",
      "Participation rate",
      "Concept recall",
      "Post-event interest in both source interests",
    ],
    proposedAudienceInterestTest:
      `Ask a small, opt-in sample in ${input.city} about ${input.interestA} and ${input.interestB}, then show a neutral ${input.bridgeName} activation concept. Measure stated interest in the concept; do not treat stated interest as a guarantee of attendance or success.`,
    sourceLabels: [
      "Product-generated hypothesis",
      "No real venues or vendor prices included",
    ],
  };
}
