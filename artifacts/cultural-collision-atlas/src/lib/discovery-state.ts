import type {
  BridgeCandidate,
  DiscoveryResponse,
} from "@workspace/api-client-react";

export interface DiscoveryEvidenceState {
  response: DiscoveryResponse | null;
  selected: BridgeCandidate | null;
  status: "idle" | "loading" | "error";
  activeRequestId: number | null;
}

export type DiscoveryEvidenceAction =
  | { type: "interest-changed"; side: "a" | "b"; requestId: number }
  | { type: "request-invalidated"; requestId: number }
  | { type: "request-started"; requestId: number }
  | { type: "request-failed"; requestId: number }
  | {
      type: "response-received";
      requestId: number;
      response: DiscoveryResponse;
    }
  | { type: "candidate-selected"; candidate: BridgeCandidate | null };

export const initialDiscoveryEvidenceState: DiscoveryEvidenceState = {
  response: null,
  selected: null,
  status: "idle",
  activeRequestId: null,
};

export function nextDiscoveryRequestId(currentRequestId: number): number {
  return currentRequestId + 1;
}

export function discoveryEvidenceReducer(
  state: DiscoveryEvidenceState,
  action: DiscoveryEvidenceAction,
): DiscoveryEvidenceState {
  switch (action.type) {
    case "interest-changed":
    case "request-invalidated":
      return {
        ...initialDiscoveryEvidenceState,
        activeRequestId: action.requestId,
      };
    case "request-started":
      return {
        ...initialDiscoveryEvidenceState,
        status: "loading",
        activeRequestId: action.requestId,
      };
    case "request-failed":
      if (action.requestId !== state.activeRequestId) return state;
      return { ...state, response: null, selected: null, status: "error" };
    case "response-received":
      if (action.requestId !== state.activeRequestId) return state;
      return {
        ...state,
        response: action.response,
        selected: null,
        status: "idle",
      };
    case "candidate-selected":
      return { ...state, selected: action.candidate };
  }
}
