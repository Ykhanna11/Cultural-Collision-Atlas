import assert from "node:assert/strict";
import test from "node:test";
import { getSavedPlanDetails } from "./saved-plan-details.ts";

test("saved plan details separate persisted evidence and planning content", () => {
  assert.deepEqual(
    getSavedPlanDetails({
      sections: [{ title: "Audience hypothesis", content: "Test this idea." }],
      evidence: [
        {
          label: "Input attribution",
          value: "Both selected inputs contributed.",
          source: "Qloo explainability",
          kind: "observed_api",
        },
      ],
      source: "qloo_api",
      caveat: "Aggregate evidence does not establish shared individuals.",
      assumptions: ["The audience fit is unvalidated."],
      planningEstimates: {
        budgetRange: "$5k–$10k",
        status: "User-supplied planning input only.",
      },
    }),
    {
      sections: [{ title: "Audience hypothesis", content: "Test this idea." }],
      evidence: [
        {
          label: "Input attribution",
          value: "Both selected inputs contributed.",
          source: "Qloo explainability",
          kind: "observed_api",
        },
      ],
      source: "qloo_api",
      caveat: "Aggregate evidence does not establish shared individuals.",
      assumptions: ["The audience fit is unvalidated."],
      budgetRange: "$5k–$10k",
      budgetStatus: "User-supplied planning input only.",
      strategySource: null,
      userProvidedAssumptions: [],
      selectedVenue: null,
      selectedVenues: [],
    },
  );
});

test("older or incomplete saved plans return empty details without throwing", () => {
  assert.deepEqual(
    getSavedPlanDetails({ sections: [null, { title: "No content" }] }),
    {
      sections: [],
      evidence: [],
      source: null,
      caveat: null,
      assumptions: [],
      budgetRange: null,
      budgetStatus: null,
      strategySource: null,
      userProvidedAssumptions: [],
      selectedVenue: null,
      selectedVenues: [],
    },
  );
  assert.deepEqual(getSavedPlanDetails(null), {
    sections: [],
    evidence: [],
    source: null,
    caveat: null,
    assumptions: [],
    budgetRange: null,
    budgetStatus: null,
    strategySource: null,
    userProvidedAssumptions: [],
    selectedVenue: null,
    selectedVenues: [],
  });
});

test("saved plan details reopen persisted venue facts and assessment evidence", () => {
  const details = getSavedPlanDetails({
    selectedVenue: {
      provider: "openstreetmap",
      providerVenueId: "node-123",
      name: "Community Hall",
      address: "1 Main Street",
      latitude: 51.5,
      longitude: -0.1,
      categories: ["culture", "event_space"],
      attribution: "© OpenStreetMap contributors, ODbL",
      retrievedAt: "2026-10-30T00:00:00.000Z",
      suitability: {
        score: 65,
        scoreLabel: "Operational data completeness and category fit",
        explanation: "Provider facts are available; cultural relevance remains unverified.",
        evidence: [{ kind: "qloo_evidence", label: "Bridge evidence", value: "Qloo returned a matching cultural bridge (Qloo Insights API)" }],
        missingData: ["No venue capacity was provided."],
      },
    },
  });
  assert.equal(details.selectedVenue?.name, "Community Hall");
  assert.equal(details.selectedVenue?.providerVenueId, "node-123");
  assert.deepEqual(details.selectedVenue?.categories, ["culture", "event_space"]);
  assert.equal(details.selectedVenue?.suitability?.evidence[0]?.kind, "qloo_evidence");
});

test("reopens multiple selected Overture venues with source metadata", () => {
  const details = getSavedPlanDetails({
    selectedVenues: [
      {
        provider: "overture",
        providerVenueId: "overture-one",
        name: "Community Hall",
        latitude: 51.5,
        longitude: -0.1,
        categories: ["culture", "event_space"],
        attribution: "Overture Maps Places, test release.",
        website: "https://example.test",
        sourceMetadata: {
          basicCategory: "event_venue",
          taxonomy: ["event_venue", "community_centre"],
          sources: [{ dataset: "Microsoft", license: "CDLA-Permissive-2.0", recordId: "record-1" }],
        },
      },
      {
        provider: "overture",
        providerVenueId: "overture-two",
        name: "Museum",
        latitude: 51.51,
        longitude: -0.11,
        categories: ["museum", "culture"],
        attribution: "Overture Maps Places, test release.",
      },
    ],
  });
  assert.equal(details.selectedVenue?.providerVenueId, "overture-one");
  assert.deepEqual(details.selectedVenues.map((venue) => venue.providerVenueId), ["overture-one", "overture-two"]);
  assert.equal(details.selectedVenues[0].sourceMetadata?.sources?.[0]?.recordId, "record-1");
});
