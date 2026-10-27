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
        evidenceReferences: ["qloo-1-1"],
        hypotheses: ["A shared event may be worth testing."],
        assumptions: ["The audience should be validated."],
        recommendations: ["Start with an opt-in pilot."],
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
  assert.equal(requests[0]?.max_output_tokens, 1_200);
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
  assert.deepEqual(JSON.parse(finalDecision.outputText ?? ""), {
    evidenceReferences: ["qloo-1-1"],
    hypotheses: ["A shared event may be worth testing."],
    assumptions: ["The audience should be validated."],
    recommendations: ["Start with an opt-in pilot."],
  });
  assert.equal(responses.length, 0);
});
