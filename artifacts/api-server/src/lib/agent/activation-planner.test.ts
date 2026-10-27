import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivationPlannerError,
  MAX_AGENT_ROUNDS,
  MAX_QLOO_REQUESTS,
  runActivationPlanner,
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
    evidenceReferences: [referenceId],
    hypotheses: ["A shared experience may be worth testing."],
    assumptions: ["The audience should be validated before launch."],
    recommendations: ["Run a small opt-in concept test."],
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
        ]);
      }
      assert.equal(request.previousResponseId, "response-1");
      assert.ok(Array.isArray(request.input));
      assert.match(request.input[0]?.output ?? "", /Verified entity/);
      return decision(2, [], finalOutput("qloo-1-1"));
    }),
  );
  assert.equal(calls.length, 2);
  assert.equal(result.source, "openai_qloo_agent");
  assert.equal(result.evidence[0]?.name, "Verified entity");
  assert.deepEqual(result.evidenceReferences, ["qloo-1-1"]);
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
