import type { HeatmapPoint } from "../qloo/heatmap";
import type { Venue } from "../venue-source";

export interface GeographicBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type GeographicSourceStatus = "returned" | "empty" | "unavailable";

export interface GeographicIntelligenceInput {
  bounds: GeographicBounds;
  heatmapStatus: GeographicSourceStatus;
  heatmapPoints: readonly HeatmapPoint[];
  venueStatus: GeographicSourceStatus;
  venues: readonly Venue[];
  venueSource?: "overture" | "openstreetmap" | "mixed";
  overtureCoverage?: GeographicBounds;
}

export type GeographicCoverageStatus =
  | "complete"
  | "partial"
  | "unavailable";

export interface GeographicIntelligenceSummary {
  requestedBounds: GeographicBounds;
  observedBounds: GeographicBounds | null;
  heatmap: {
    status: GeographicSourceStatus;
    source: "Qloo Insights API";
    pointCount: number;
    duplicateCount: number;
    invalidCoordinateCount: number;
    points: HeatmapPoint[];
  };
  venues: {
    status: GeographicSourceStatus;
    source: "Overture Maps Places" | "OpenStreetMap" | "mixed";
    recordCount: number;
    duplicateCount: number;
    invalidCoordinateCount: number;
    categoryCounts: Array<{ category: string; count: number }>;
    records: Venue[];
  };
  overtureCoverage: {
    status: "covered" | "partial" | "outside" | "unknown";
    bounds: GeographicBounds | null;
  };
  coverage: GeographicCoverageStatus;
  sourceSeparation: string;
}

function validBounds(bounds: GeographicBounds): boolean {
  return [bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite) &&
    bounds.south >= -90 && bounds.north <= 90 &&
    bounds.west >= -180 && bounds.east <= 180 &&
    bounds.south <= bounds.north && bounds.west <= bounds.east;
}

function pointInBounds(
  latitude: number,
  longitude: number,
  bounds: GeographicBounds,
): boolean {
  return latitude >= bounds.south && latitude <= bounds.north &&
    longitude >= bounds.west && longitude <= bounds.east;
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function coverageFor(
  requested: GeographicBounds,
  coverage?: GeographicBounds,
): GeographicIntelligenceSummary["overtureCoverage"] {
  if (!coverage || !validBounds(coverage)) return { status: "unknown", bounds: null };
  const intersects = requested.west <= coverage.east && requested.east >= coverage.west &&
    requested.south <= coverage.north && requested.north >= coverage.south;
  if (!intersects) return { status: "outside", bounds: coverage };
  const fullyCovered = requested.west >= coverage.west && requested.east <= coverage.east &&
    requested.south >= coverage.south && requested.north <= coverage.north;
  return { status: fullyCovered ? "covered" : "partial", bounds: coverage };
}

function observedBounds(
  heatmapPoints: readonly HeatmapPoint[],
  venues: readonly Venue[],
): GeographicBounds | null {
  const coordinates = [
    ...heatmapPoints.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ...venues.map(({ latitude, longitude }) => ({ latitude, longitude })),
  ];
  if (coordinates.length === 0) return null;
  return {
    south: Math.min(...coordinates.map(({ latitude }) => latitude)),
    west: Math.min(...coordinates.map(({ longitude }) => longitude)),
    north: Math.max(...coordinates.map(({ latitude }) => latitude)),
    east: Math.max(...coordinates.map(({ longitude }) => longitude)),
  };
}

export function summarizeGeographicIntelligence(
  input: GeographicIntelligenceInput,
): GeographicIntelligenceSummary {
  if (!validBounds(input.bounds)) {
    throw new Error("Geographic analysis requires valid, ordered bounds.");
  }

  let invalidHeatmapCoordinates = 0;
  let duplicateHeatmapPoints = 0;
  const heatmapKeys = new Set<string>();
  const heatmapPoints = input.heatmapPoints.filter((point) => {
    if (!validCoordinate(point.latitude, point.longitude)) {
      invalidHeatmapCoordinates += 1;
      return false;
    }
    if (!pointInBounds(point.latitude, point.longitude, input.bounds)) return false;
    const key = JSON.stringify([
      point.latitude,
      point.longitude,
      point.affinity ?? null,
      point.affinityRank ?? null,
      point.popularity ?? null,
    ]);
    if (heatmapKeys.has(key)) {
      duplicateHeatmapPoints += 1;
      return false;
    }
    heatmapKeys.add(key);
    return true;
  });

  let invalidVenueCoordinates = 0;
  let duplicateVenues = 0;
  const venueIds = new Set<string>();
  const venues = input.venues.filter((venue) => {
    if (!validCoordinate(venue.latitude, venue.longitude)) {
      invalidVenueCoordinates += 1;
      return false;
    }
    if (!pointInBounds(venue.latitude, venue.longitude, input.bounds)) return false;
    const key = `${venue.provider}:${venue.providerVenueId}`;
    if (venueIds.has(key)) {
      duplicateVenues += 1;
      return false;
    }
    venueIds.add(key);
    return true;
  });

  const categoryCounts = new Map<string, number>();
  for (const venue of venues) {
    for (const category of new Set(venue.categories)) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }
  const venueSources = new Set(venues.map(({ provider }) => provider));
  const venueSource = input.venueSource === "mixed" || venueSources.size > 1
    ? "mixed"
    : input.venueSource === "openstreetmap" || venueSources.has("openstreetmap")
      ? "OpenStreetMap"
      : "Overture Maps Places";
  const overtureCoverage = coverageFor(input.bounds, input.overtureCoverage);
  const unavailableCount = [input.heatmapStatus, input.venueStatus]
    .filter((status) => status === "unavailable").length;
  const coverage: GeographicCoverageStatus = unavailableCount === 2
    ? "unavailable"
    : unavailableCount > 0 || overtureCoverage.status !== "covered"
      ? "partial"
      : "complete";

  return {
    requestedBounds: { ...input.bounds },
    observedBounds: observedBounds(heatmapPoints, venues),
    heatmap: {
      status: input.heatmapStatus,
      source: "Qloo Insights API",
      pointCount: heatmapPoints.length,
      duplicateCount: duplicateHeatmapPoints,
      invalidCoordinateCount: invalidHeatmapCoordinates,
      points: [...heatmapPoints],
    },
    venues: {
      status: input.venueStatus,
      source: venueSource,
      recordCount: venues.length,
      duplicateCount: duplicateVenues,
      invalidCoordinateCount: invalidVenueCoordinates,
      categoryCounts: [...categoryCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, count]) => ({ category, count })),
      records: [...venues],
    },
    overtureCoverage,
    coverage,
    sourceSeparation:
      "Qloo heatmap points are cultural signals; venue records are physical places. They share only the requested geographic bounds and are never treated as the same entity.",
  };
}