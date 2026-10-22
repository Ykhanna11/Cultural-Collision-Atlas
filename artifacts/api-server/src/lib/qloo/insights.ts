import { qlooGet, type QlooApiError } from "./client";

export const QLOO_RECOMMENDATION_TYPES = [
  "urn:entity:brand",
  "urn:entity:place",
  "urn:entity:destination",
] as const;

export type QlooRecommendationType =
  (typeof QLOO_RECOMMENDATION_TYPES)[number];

export const DEFAULT_QLOO_RECOMMENDATION_TYPE: QlooRecommendationType =
  "urn:entity:brand";

export function isQlooRecommendationType(
  value: unknown,
): value is QlooRecommendationType {
  return QLOO_RECOMMENDATION_TYPES.some((type) => type === value);
}

export interface QlooInsightRequest {
  entityIds: string[];
  city: string;
  entityType?: QlooRecommendationType;
}

export async function requestRecommendations(
  input: QlooInsightRequest,
): Promise<unknown> {
  return qlooGet("/v2/insights/", {
    "filter.type": input.entityType ?? DEFAULT_QLOO_RECOMMENDATION_TYPE,
    "signal.interests.entities": input.entityIds,
    "signal.location.query": input.city,
    "feature.explainability": "true",
  });
}

export async function compareSingleInterest(
  entityId: string,
  city: string,
  entityType?: QlooRecommendationType,
): Promise<unknown> {
  return requestRecommendations({ entityIds: [entityId], city, entityType });
}

export async function compareJointInterests(
  entityAId: string,
  entityBId: string,
  city: string,
  entityType?: QlooRecommendationType,
): Promise<unknown> {
  return requestRecommendations({
    entityIds: [entityAId, entityBId],
    city,
    entityType,
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
