import assert from "node:assert/strict";
import test from "node:test";
import {
  mutationFeedbackReducer,
  type MutationFeedback,
} from "./mutation-feedback.ts";

function reduce(
  state: MutationFeedback,
  action: Parameters<typeof mutationFeedbackReducer>[1],
) {
  return mutationFeedbackReducer(state, action);
}

test("discovery save feedback distinguishes success and failure", () => {
  const success = reduce(null, {
    type: "success",
    message: "Discovery saved to your evidence trail.",
  });
  assert.deepEqual(success, {
    type: "success",
    message: "Discovery saved to your evidence trail.",
  });

  const failure = reduce(null, {
    type: "error",
    message: "Discovery could not be saved. Please try again.",
  });
  assert.deepEqual(failure, {
    type: "error",
    message: "Discovery could not be saved. Please try again.",
  });
});

test("starting a saved-discovery deletion clears a prior failure", () => {
  const failed: MutationFeedback = {
    type: "error",
    message: "Could not delete the saved discovery. Please try again.",
  };
  assert.equal(reduce(failed, { type: "clear" }), null);
  assert.deepEqual(
    reduce(failed, {
      type: "error",
      message: "Could not delete the saved discovery. Please try again.",
    }),
    failed,
  );
});

test("starting an activation-plan deletion clears a prior failure", () => {
  const failed: MutationFeedback = {
    type: "error",
    message: "Could not delete the activation plan. Please try again.",
  };
  assert.equal(reduce(failed, { type: "clear" }), null);
  assert.deepEqual(
    reduce(failed, {
      type: "error",
      message: "Could not delete the activation plan. Please try again.",
    }),
    failed,
  );
});

test("successful deletion clears prior error feedback", () => {
  const failed: MutationFeedback = {
    type: "error",
    message: "Deletion failed.",
  };
  assert.equal(reduce(failed, { type: "clear" }), null);
});
