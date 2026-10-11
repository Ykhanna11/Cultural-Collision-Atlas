import { isRecord, qlooGet } from "./client";

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  affinity?: number;
  affinityRank?: number;
  popularity?: number;
}

export async function requestQlooHeatmap(
  city: string,
  entityId: string,
): Promise<HeatmapPoint[]> {
  const payload = await qlooGet<unknown>("/v2/insights/", {
    "filter.type": "urn:heatmap",
    "filter.location.query": city,
    "signal.interests.entities": entityId,
  });

  const results =
    isRecord(payload) && isRecord(payload.results) ? payload.results : null;
  if (!results || !Array.isArray(results.heatmap)) {
    throw new Error("Qloo heatmap returned an unrecognized response shape.");
  }

  return results.heatmap.flatMap((item): HeatmapPoint[] => {
    if (!isRecord(item) || !isRecord(item.location) || !isRecord(item.query)) {
      return [];
    }
    const { latitude, longitude } = item.location;
    if (typeof latitude !== "number" || typeof longitude !== "number") return [];
    const query = item.query;
    return [{
      latitude,
      longitude,
      ...(typeof query.affinity === "number" && { affinity: query.affinity }),
      ...(typeof query.affinity_rank === "number" && {
        affinityRank: query.affinity_rank,
      }),
      ...(typeof query.popularity === "number" && { popularity: query.popularity }),
    }];
  });
}
