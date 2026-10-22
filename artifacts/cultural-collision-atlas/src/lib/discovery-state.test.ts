import assert from "node:assert/strict";
import test from "node:test";
import {
  discoveryEvidenceReducer,
  nextDiscoveryRequestId,
  type DiscoveryEvidenceState,
} from "./discovery-state.ts";

const priorState: DiscoveryEvidenceState = {
  status: "idle",
  activeRequestId: null,
  response: {
    source: "qloo_api",
    generatedAt: "2026-10-22T00:00:00.000Z",
    caveat: "Prior comparison",
    candidates: [],
  },
  selected: {
    id: "prior-candidate",
    name: "Prior candidate",
    explanation: "Prior explanation",
    score: 42,
    scoreDescription: "Derived score",
    confidence: "low",
    evidence: [],
  },
};

for (const side of ["a", "b"] as const) {
  test(`editing Input ${side.toUpperCase()} clears prior results and selection`, () => {
    assert.deepEqual(
      discoveryEvidenceReducer(priorState, {
        type: "interest-changed",
        side,
        requestId: 2,
      }),
      { response: null, selected: null, status: "idle", activeRequestId: 2 },
    );
  });

  test(`editing Input ${side.toUpperCase()} rejects a later success from its old request`, () => {
    const loading = discoveryEvidenceReducer(priorState, {
      type: "request-started",
      requestId: 1,
    });
    const edited = discoveryEvidenceReducer(loading, {
      type: "interest-changed",
      side,
      requestId: 2,
    });
    const afterStaleSuccess = discoveryEvidenceReducer(edited, {
      type: "response-received",
      requestId: 1,
      response: priorState.response!,
    });

    assert.equal(edited.status, "idle");
    assert.equal(edited.response, null);
    assert.equal(edited.selected, null);
    assert.equal(afterStaleSuccess, edited);
  });
}

test("a stale failure cannot end a newer request or set its error state", () => {
  const firstRequest = discoveryEvidenceReducer(priorState, {
    type: "request-started",
    requestId: 1,
  });
  const currentRequest = discoveryEvidenceReducer(firstRequest, {
    type: "request-started",
    requestId: 2,
  });
  const afterStaleFailure = discoveryEvidenceReducer(currentRequest, {
    type: "request-failed",
    requestId: 1,
  });

  assert.equal(currentRequest.status, "loading");
  assert.equal(afterStaleFailure, currentRequest);
  assert.equal(afterStaleFailure.status, "loading");
});

test("a current request failure shows error and clears discovery evidence", () => {
  const requestId = nextDiscoveryRequestId(0);
  const loading = discoveryEvidenceReducer(priorState, {
    type: "request-started",
    requestId,
  });
  const failed = discoveryEvidenceReducer(loading, {
    type: "request-failed",
    requestId,
  });

  assert.deepEqual(failed, {
    response: null,
    selected: null,
    status: "error",
    activeRequestId: requestId,
  });
});

test("only the current request can finish loading", () => {
  const firstRequest = discoveryEvidenceReducer(priorState, {
    type: "request-started",
    requestId: 1,
  });
  const currentRequest = discoveryEvidenceReducer(firstRequest, {
    type: "request-started",
    requestId: 2,
  });
  const afterStaleSuccess = discoveryEvidenceReducer(currentRequest, {
    type: "response-received",
    requestId: 1,
    response: priorState.response!,
  });
  const afterCurrentSuccess = discoveryEvidenceReducer(currentRequest, {
    type: "response-received",
    requestId: 2,
    response: priorState.response!,
  });

  assert.equal(afterStaleSuccess.status, "loading");
  assert.equal(afterCurrentSuccess.status, "idle");
  assert.equal(afterCurrentSuccess.response, priorState.response);
});

test("new requests and interest invalidation allocate generations that stale older callbacks", () => {
  const firstRequestId = nextDiscoveryRequestId(0);
  const secondRequestId = nextDiscoveryRequestId(firstRequestId);
  const firstLoading = discoveryEvidenceReducer(priorState, {
    type: "request-started",
    requestId: firstRequestId,
  });
  const secondLoading = discoveryEvidenceReducer(firstLoading, {
    type: "request-started",
    requestId: secondRequestId,
  });
  const afterFirstFailure = discoveryEvidenceReducer(secondLoading, {
    type: "request-failed",
    requestId: firstRequestId,
  });
  const invalidationId = nextDiscoveryRequestId(secondRequestId);
  const invalidated = discoveryEvidenceReducer(afterFirstFailure, {
    type: "interest-changed",
    side: "a",
    requestId: invalidationId,
  });
  const afterSecondSuccess = discoveryEvidenceReducer(invalidated, {
    type: "response-received",
    requestId: secondRequestId,
    response: priorState.response!,
  });

  assert.deepEqual(
    [firstRequestId, secondRequestId, invalidationId],
    [1, 2, 3],
  );
  assert.equal(afterFirstFailure, secondLoading);
  assert.equal(afterSecondSuccess, invalidated);
  assert.equal(invalidated.status, "idle");
  assert.equal(invalidated.response, null);
  assert.equal(invalidated.selected, null);
});
