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
  });
});
