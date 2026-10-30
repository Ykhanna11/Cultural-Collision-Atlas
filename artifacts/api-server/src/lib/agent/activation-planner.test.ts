import assert from "node:assert/strict";
import test from "node:test";
import { GenerateActivationPlanWithAgentResponse } from "@workspace/api-zod";
import {
  ActivationPlannerError,
  MAX_AGENT_ROUNDS,
  MAX_QLOO_REQUESTS,
  runActivationPlanner,
  runActivationPlannerWithFallback,
  runLiveActivationPlanner,
  type AgentDecision,
  type AgentDependencies,
  type AgentInput,
} from "./activation-planner.ts";

const input: AgentInput = {
  interestA: "Jazz",
  interestAId: "10000000-0000-4000-8000-000000000001",
  interestB: "Streetwear",
  interestBId: "10000000-0000-4000-8000-000000000002",
  city: "New York",
  activationType: "pop-up",
  budgetRange: "$5k-$10k",
  objective: "Test opt-in interest",
  bridgeId: "20000000-0000-4000-8000-000000000001",
  bridgeName: "Culture market",
};

const finalOutput = (referenceId: string) =>
  JSON.stringify({
    strategy: {
      executiveSummary: "Test a small cultural activation as a hypothesis.",
      opportunity: "Explore a bridge returned by aggregate Qloo Insights.",
      targetAudience: {
        hypothesis: "People interested in either input may consider the pilot.",
        rationale: [{
          claim: "Qloo returned a candidate from the joint-interest request.",
          evidenceReferences: [referenceId],
        }],
      },
      culturalInsights: [{
        insight: "The candidate appeared in the joint-interest recommendation results.",
        evidenceReferences: [referenceId],
      }],
      campaignConcept: {
        name: "Culture in Common",
        narrative: "A participatory pop-up concept for audience testing.",
        creativeDirection: "Invite local contributors to shape an opt-in pilot.",
      },
      activationChannels: ["Small opt-in event"],
      partnershipCategories: ["Local cultural contributors"],
      executionTimeline: [{
        phase: "Validate",
        tasks: ["Test the concept with an opt-in sample."],
        deliverables: ["Document participant feedback."],
      }, {
        phase: "Pilot",
        tasks: ["Confirm permissions before production."],
        deliverables: ["Record agreed success metrics."],
      }],
      successMetrics: [{
        metric: "Participant-reported relevance",
        rationale: "Tests stated interest without forecasting attendance.",
        measurementMethod: "Use a post-experience participant survey.",
      }],
      risksAndAssumptions: [{
        category: "risk",
        statement: "The concept may not resonate with the audience.",
        mitigation: "Test before committing to production.",
      }],
      validationExperiments: [{
        experiment: "Opt-in concept test",
        method: "Show a neutral concept and ask participants for feedback.",
        decisionSignal: "Participant-reported relevance.",
      }],
    },
  });

function decision(
  round: number,
  toolCalls: AgentDecision["toolCalls"],
  outputText: string | null = null,
): AgentDecision {
  return { responseId: `response-${round}`, toolCalls, outputText };
}

function dependencies(
  decide: AgentDependencies["decide"],
  overrides: Partial<AgentDependencies> = {},
): AgentDependencies {
  return {
    decide,
    searchEntities: async () => [
      {
        id: "30000000-0000-4000-8000-000000000001",
        name: "Verified entity",
        type: "urn:entity:brand",
        subtype: null,
        description: null,
        placeType: null,
        administrativeLevel: null,
        ancestorNames: [],
        source: "qloo_api",
      },
    ],
    getInsights: async () => ({
      results: {
        entities: [
          {
            entity_id: "30000000-0000-4000-8000-000000000002",
            name: "Verified insight",
            query: { affinity: 0.8, affinity_rank: 1 },
          },
        ],
      },
    }),
    ...overrides,
  };
}

test("selects Qloo tools from evidence needs and continues with validated tool results", async () => {
  const calls: Array<{ round: number; previousResponseId?: string; input: unknown }> = [];
  const result = await runActivationPlanner(
    input,
    dependencies(async (request) => {
      calls.push(request);
      if (request.round === 1) {
        return decision(1, [
          {
            id: "call-search",
            name: "search_qloo_entities",
            arguments: JSON.stringify({ query: "Jazz", types: null }),
          },
          {
            id: "call-insights",
            name: "get_qloo_insights",
            arguments: JSON.stringify({ scope: "both" }),
          },
        ]);
      }
      assert.equal(request.previousResponseId, "response-1");
      assert.ok(Array.isArray(request.input));
      assert.match(request.input[0]?.output ?? "", /Verified entity/);
      assert.match(request.input[1]?.output ?? "", /Verified insight/);
      return decision(2, [], finalOutput("qloo-2-1"));
    }),
  );
  assert.equal(calls.length, 2);
  assert.equal(result.source, "ai_generated");
  assert.equal(result.evidence[0]?.name, "Verified entity");
  assert.equal(result.strategy.culturalInsights[0]?.evidenceReferences[0], "qloo-2-1");
  assert.equal(result.evidence.find(({ referenceId }) => referenceId === "qloo-2-1")?.kind, "insights");
  assert.equal(GenerateActivationPlanWithAgentResponse.safeParse(result).success, true);
});

test("rejects unknown tools and invalid arguments without dispatching Qloo", async () => {
  let qlooCalls = 0;
  for (const call of [
    { id: "unknown", name: "run_shell", arguments: "{}" },
    {
      id: "invalid",
      name: "search_qloo_entities",
      arguments: JSON.stringify({ query: "Jazz", types: null, url: "https://invalid.test" }),
    },
  ]) {
    await assert.rejects(
      runActivationPlanner(
        input,
        dependencies(async () => decision(1, [call]), {
          searchEntities: async () => {
            qlooCalls += 1;
            return [];
          },
        }),
      ),
      ActivationPlannerError,
    );
  }
  assert.equal(qlooCalls, 0);

  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async () =>
        decision(1, [
          {
            id: "valid-first",
            name: "search_qloo_entities",
            arguments: JSON.stringify({ query: "Jazz", types: null }),
          },
          { id: "unknown-second", name: "run_shell", arguments: "{}" },
        ]),
      {
        searchEntities: async () => {
          qlooCalls += 1;
          return [];
        },
      }),
    ),
    ActivationPlannerError,
  );
  assert.equal(qlooCalls, 0);
});

test("enforces the maximum of three model decision rounds", async () => {
  let rounds = 0;
  let qlooCalls = 0;
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async ({ round }) => {
        rounds += 1;
        return decision(round, [
          {
            id: `call-${round}`,
            name: "get_qloo_insights",
            arguments: JSON.stringify({ scope: "both" }),
          },
        ]);
      }, {
        getInsights: async () => {
          qlooCalls += 1;
          return { results: { entities: [] } };
        },
      }),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "budget_exhausted",
  );
  assert.equal(MAX_AGENT_ROUNDS, 3);
  assert.equal(rounds, MAX_AGENT_ROUNDS);
  assert.equal(qlooCalls, MAX_AGENT_ROUNDS);
});

test("enforces the maximum of four Qloo requests", async () => {
  let allowedRequests = 0;
  const allowedResult = await runActivationPlanner(
    input,
    dependencies(
      async ({ round }) =>
        round === 1
          ? decision(
              1,
              Array.from({ length: MAX_QLOO_REQUESTS }, (_, index) => ({
                id: `allowed-${index}`,
                name: "get_qloo_insights",
                arguments: JSON.stringify({ scope: "both" }),
              })),
            )
          : decision(2, [], finalOutput("qloo-4-1")),
      {
        getInsights: async () => {
          allowedRequests += 1;
          return {
            results: {
              entities: [
                {
                  entity_id: "30000000-0000-4000-8000-000000000002",
                  name: "Verified insight",
                  query: { affinity: 0.8, affinity_rank: 1 },
                },
              ],
            },
          };
        },
      },
    ),
  );
  assert.equal(allowedRequests, MAX_QLOO_REQUESTS);
  assert.equal(allowedResult.evidence.length, MAX_QLOO_REQUESTS);

  let qlooCalls = 0;
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(
        async () =>
          decision(
            1,
            Array.from({ length: MAX_QLOO_REQUESTS + 1 }, (_, index) => ({
              id: `call-${index}`,
              name: "get_qloo_insights",
              arguments: JSON.stringify({ scope: "both" }),
            })),
          ),
        {
          getInsights: async () => {
            qlooCalls += 1;
            return { results: { entities: [] } };
          },
        },
      ),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "budget_exhausted",
  );
  assert.equal(qlooCalls, 0);
});

test("stops with insufficient evidence when no Qloo tool results exist", async () => {
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async () => decision(1, [], finalOutput("unknown-ref"))),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "insufficient_evidence",
  );
});

test("does not accept entity-search evidence as cultural Insights evidence", async () => {
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async ({ round }) =>
        round === 1
          ? decision(1, [{
              id: "call-search",
              name: "search_qloo_entities",
              arguments: JSON.stringify({ query: "Jazz", types: null }),
            }])
          : decision(2, [], finalOutput("qloo-1-1")),
      ),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "insufficient_evidence",
  );
});

test("rejects malformed complete-strategy output", async () => {
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async ({ round }) =>
        round === 1
          ? decision(1, [{
              id: "call-insights",
              name: "get_qloo_insights",
              arguments: JSON.stringify({ scope: "both" }),
            }])
          : decision(2, [], JSON.stringify({ strategy: { executiveSummary: "Incomplete" } })),
      ),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "invalid_model_output",
  );
});

test("missing credentials returns a labeled deterministic fallback without model calls", async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.QLOO_API_KEY;
  let modelCalls = 0;
  const result = await runLiveActivationPlanner(input, dependencies(async () => {
    modelCalls += 1;
    return decision(1, []);
  }));

  assert.equal(modelCalls, 0);
  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.fallbackReason, "credentials_unavailable");
  assert.match(result.caveat, /not AI-generated/);
  assert.deepEqual(result.evidence, []);
});

test("model failure returns a labeled deterministic fallback", async () => {
  const result = await runActivationPlannerWithFallback(
    input,
    dependencies(async () => {
      throw new Error("mock model failure");
    }),
  );

  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.fallbackReason, "model_or_provider_failure");
  assert.match(result.caveat, /not AI-generated/);
});

test("invalid structured output is returned as an explicit fallback", async () => {
  const result = await runActivationPlannerWithFallback(
    input,
    dependencies(async ({ round }) =>
      round === 1
        ? decision(1, [{
            id: "call-insights",
            name: "get_qloo_insights",
            arguments: JSON.stringify({ scope: "both" }),
          }])
        : decision(2, [], JSON.stringify({ strategy: { unexpected: true } })),
    ),
  );

  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.fallbackReason, "invalid_structured_output");
});

test("stops on provider failures and invalid evidence references", async () => {
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async () => {
        throw new Error("provider details are not surfaced");
      }),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "provider_failure",
  );

  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async ({ round }) =>
        round === 1
          ? decision(1, [
              {
                id: "call-search",
                name: "search_qloo_entities",
                arguments: JSON.stringify({ query: "Jazz", types: null }),
              },
              {
                id: "call-insights",
                name: "get_qloo_insights",
                arguments: JSON.stringify({ scope: "both" }),
              },
            ])
          : decision(2, [], finalOutput("qloo-99-1")),
      ),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "invalid_model_output",
  );

  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(
        async () =>
          decision(1, [
            {
              id: "call-search",
              name: "search_qloo_entities",
              arguments: JSON.stringify({ query: "Jazz", types: null }),
            },
          ]),
        {
          searchEntities: async () => {
            throw new Error("Qloo fixture failure");
          },
        },
      ),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "provider_failure",
  );

  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(
        async () =>
          decision(1, [
            {
              id: "call-insights",
              name: "get_qloo_insights",
              arguments: JSON.stringify({ scope: "both" }),
            },
          ]),
        { getInsights: async () => ({ malformed: true }) },
      ),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "provider_failure",
  );
});

test("treats a final plan without Qloo results as insufficient evidence", async () => {
  await assert.rejects(
    runActivationPlanner(
      input,
      dependencies(async () => decision(1, [], JSON.stringify({
        evidenceReferences: [],
        hypotheses: ["Unverified"],
        assumptions: [],
        recommendations: [],
      }))),
    ),
    (error: unknown) =>
      error instanceof ActivationPlannerError &&
      error.reason === "insufficient_evidence",
  );
});
