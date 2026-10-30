import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import { createOpenAIPlannerModel } from "./openai-planner-model.ts";

test("adapts function calls, submits their outputs, and returns structured output", async () => {
  const requests: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
  const functionCall: OpenAI.Responses.ResponseOutputItem = {
    type: "function_call",
    id: "fc_item_1",
    call_id: "call_1",
    name: "search_qloo_entities",
    arguments: '{"query":"Jazz","types":null}',
    status: "completed",
  };
  const responses = [
    {
      id: "response_with_tool_call",
      output: [functionCall],
      output_text: "",
    },
    {
      id: "response_with_final_plan",
      output: [],
      output_text: JSON.stringify({
        strategy: {
          executiveSummary: "Test a small activation as a hypothesis.",
          opportunity: "Explore a bridge returned by aggregate Qloo Insights.",
          targetAudience: {
            hypothesis: "People interested in either input may consider the pilot.",
            rationale: [{
              claim: "Qloo returned a candidate from the joint-interest request.",
              evidenceReferences: ["qloo-2-1"],
            }],
          },
          culturalInsights: [{
            insight: "A candidate appeared in the joint-interest results.",
            evidenceReferences: ["qloo-2-1"],
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
            tasks: ["Test the concept."],
            deliverables: ["Document feedback."],
          }, {
            phase: "Pilot",
            tasks: ["Confirm permissions."],
            deliverables: ["Record measures."],
          }],
          successMetrics: [{
            metric: "Participant-reported relevance",
            rationale: "Tests stated interest without forecasting attendance.",
            measurementMethod: "Use a post-experience participant survey.",
          }],
          risksAndAssumptions: [{
            category: "risk",
            statement: "The concept may not resonate.",
            mitigation: "Test before producing the activation.",
          }],
          validationExperiments: [{
            experiment: "Opt-in concept test",
            method: "Show a neutral concept and ask for feedback.",
            decisionSignal: "Participant-reported relevance.",
          }],
        },
      }),
    },
  ];
  const model = createOpenAIPlannerModel({
    model: "test-model",
    client: {
      responses: {
        async create(request) {
          requests.push(request);
          const response = responses.shift();
          assert.ok(response);
          return response;
        },
      },
    },
  });

  const firstDecision = await model({
    round: 1,
    input: "Initial activation-planning request",
  });

  assert.equal(firstDecision.responseId, "response_with_tool_call");
  assert.deepEqual(firstDecision.toolCalls, [{
    id: "call_1",
    name: "search_qloo_entities",
    arguments: '{"query":"Jazz","types":null}',
  }]);
  assert.equal(firstDecision.outputText, null);
  assert.equal(requests[0]?.model, "test-model");
  assert.equal(requests[0]?.max_output_tokens, 3_500);
  assert.equal(requests[0]?.previous_response_id, undefined);

  const finalDecision = await model({
    round: 2,
    previousResponseId: firstDecision.responseId,
    input: [{ callId: "call_1", output: '[{"referenceId":"qloo-1-1"}]' }],
  });

  assert.equal(requests[1]?.previous_response_id, "response_with_tool_call");
  assert.deepEqual(requests[1]?.input, [{
    type: "function_call_output",
    call_id: "call_1",
    output: '[{"referenceId":"qloo-1-1"}]',
  }]);
  assert.equal(finalDecision.responseId, "response_with_final_plan");
  assert.deepEqual(finalDecision.toolCalls, []);
  assert.equal(JSON.parse(finalDecision.outputText ?? "").strategy.executiveSummary,
    "Test a small activation as a hypothesis.");
  assert.equal(responses.length, 0);
});
