import { qlooGet, type QlooApiError } from "./client";

export interface QlooInsightRequest {
  entityIds: string[];
  city: string;
  entityType?: string;
}

export async function requestRecommendations(
  input: QlooInsightRequest,
): Promise<unknown> {
  return qlooGet("/v2/insights/", {
    "filter.type": input.entityType ?? "urn:entity:brand",
    "signal.interests.entities": input.entityIds,
    "signal.location.query": input.city,
    "feature.explainability": "true",
  });
}

export async function compareSingleInterest(
  entityId: string,
  city: string,
): Promise<unknown> {
  return requestRecommendations({ entityIds: [entityId], city });
}

export async function compareJointInterests(
  entityAId: string,
  entityBId: string,
  city: string,
): Promise<unknown> {
  return requestRecommendations({
    entityIds: [entityAId, entityBId],
    city,
  });
}

export function getQlooStatusCode(error: unknown): number | null {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as QlooApiError).status === "number"
    ? (error as QlooApiError).status
    : null;
}
