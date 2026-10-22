import type { HeatmapPoint } from "@workspace/api-client-react";

export const HEATMAP_MARKER_SIZE_PX = 10;

export interface HeatmapPointDisplay {
  label: string;
  coordinates: string;
  markerSize: number;
  affinity: string;
  affinityRank: string;
  popularity: string;
}

export function describeHeatmapPoint(
  point: HeatmapPoint,
  index: number,
): HeatmapPointDisplay {
  return {
    label: `Point ${index + 1}`,
    coordinates: `${point.latitude}, ${point.longitude}`,
    markerSize: HEATMAP_MARKER_SIZE_PX,
    affinity:
      typeof point.affinity === "number"
        ? String(point.affinity)
        : "Not returned",
    affinityRank:
      typeof point.affinityRank === "number"
        ? String(point.affinityRank)
        : "Not returned",
    popularity:
      typeof point.popularity === "number"
        ? String(point.popularity)
        : "Not returned",
  };
}
