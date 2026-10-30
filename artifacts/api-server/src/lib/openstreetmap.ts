import type { VenueProvider, VenueSearchInput } from "./venue-provider";
import type { Venue } from "./venue-source";

const OVERPASS_URL =
  process.env.OVERPASS_URL?.trim() || "https://overpass-api.de/api/interpreter";
const MAX_RESULTS = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_REQUEST_SPACING_MS = 1_500;
const MAX_CACHE_ENTRIES = 200;
const MAX_DETAIL_ENTRIES = 2_000;
export const OVERPASS_REQUEST_TIMEOUT_MS = 30_000;

const CACHE = new Map<string, { expiresAt: number; venues: Venue[] }>();
const VENUES = new Map<string, Venue>();
let lastRequestAt = 0;
let requestTail = Promise.resolve();

export function radiusToBoundingBox(radius: NonNullable<VenueSearchInput["radius"]>) {
  const latitudeDelta = radius.kilometers / 111.32;
  const longitudeScale = Math.max(Math.cos(radius.latitude * Math.PI / 180), 0.01);
  const longitudeDelta = radius.kilometers / (111.32 * longitudeScale);
  return {
    south: radius.latitude - latitudeDelta,
    west: radius.longitude - longitudeDelta,
    north: radius.latitude + latitudeDelta,
    east: radius.longitude + longitudeDelta,
  };
}

export function pruneExpiredCache(now = Date.now()) {
  for (const [key, value] of CACHE) {
    if (value.expiresAt <= now) CACHE.delete(key);
  }
  while (CACHE.size > MAX_CACHE_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (typeof oldest !== "string") break;
    CACHE.delete(oldest);
  }
  while (VENUES.size > MAX_DETAIL_ENTRIES) {
    const oldest = VENUES.keys().next().value;
    if (typeof oldest !== "string") break;
    VENUES.delete(oldest);
  }
}

export const VENUE_CATEGORIES = [
  "restaurant",
  "cafe",
  "shopping",
  "entertainment",
  "sports",
  "culture",
  "museum",
  "event_space",
] as const;

export function normalizeVenueCategory(tags: Record<string, string>): string[] {
  const categories = new Set<string>();
  if (tags.amenity === "restaurant" || tags.cuisine) categories.add("restaurant");
  if (tags.amenity === "cafe" || tags.amenity === "bar" || tags.amenity === "pub") {
    categories.add(tags.amenity === "cafe" ? "cafe" : "entertainment");
  }
  if (tags.shop || tags.amenity === "marketplace") categories.add("shopping");
  if (tags.leisure || tags.sport) categories.add("sports");
  if (
    tags.tourism === "museum" ||
    tags.amenity === "arts_centre" ||
    tags.amenity === "theatre"
  ) {
    categories.add("culture");
  }
  if (tags.tourism === "museum") categories.add("museum");
  if (
    tags.amenity === "community_centre" ||
    tags.amenity === "conference_centre" ||
    tags.amenity === "events_venue"
  ) {
    categories.add("event_space");
  }
  if (tags.amenity === "cinema") categories.add("entertainment");
  return [...categories].length ? [...categories] : ["other"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOverpassVenueElements(payload: unknown): Venue[] {
  if (!isRecord(payload) || !Array.isArray(payload.elements)) return [];
  const retrievedAt = new Date().toISOString();
  const seen = new Set<string>();

  return payload.elements.flatMap((element): Venue[] => {
    if (!isRecord(element) || !isRecord(element.tags)) return [];
    const tags = element.tags as Record<string, unknown>;
    const stringTags: Record<string, string> = Object.fromEntries(
      Object.entries(tags).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    const latitude =
      typeof element.lat === "number"
        ? element.lat
        : isRecord(element.center) && typeof element.center.lat === "number"
          ? element.center.lat
          : undefined;
    const longitude =
      typeof element.lon === "number"
        ? element.lon
        : isRecord(element.center) && typeof element.center.lon === "number"
          ? element.center.lon
          : undefined;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !stringTags.name?.trim()
    ) {
      return [];
    }
    const providerVenueId = `${element.type ?? "osm"}-${element.id ?? ""}`;
    if (!element.id || seen.has(providerVenueId)) return [];
    seen.add(providerVenueId);

    const addressParts = [
      stringTags["addr:housenumber"],
      stringTags["addr:street"],
      stringTags["addr:city"],
      stringTags["addr:postcode"],
    ].filter(Boolean);
    const website = stringTags.website || stringTags["contact:website"] || undefined;
    const phone = stringTags.phone || stringTags["contact:phone"] || undefined;
    const email = stringTags.email || stringTags["contact:email"] || undefined;
    const openingHours = stringTags.opening_hours || undefined;

    return [{
      provider: "openstreetmap",
      providerVenueId,
      name: stringTags.name.trim(),
      latitude,
      longitude,
      ...(addressParts.length > 0 && { address: addressParts.join(" ") }),
      categories: normalizeVenueCategory(stringTags),
      ...(website && { website }),
      ...(phone && { phone }),
      ...(email && { email }),
      ...(openingHours && { openingHours }),
      attribution: "© OpenStreetMap contributors, ODbL",
      retrievedAt,
    }];
  });
}

export function buildOverpassQuery(input: VenueSearchInput): string {
  const bbox = input.bbox ?? radiusToBoundingBox(input.radius!);
  const { south, west, north, east } = bbox;
  const filters = input.categories.flatMap((category) => {
    switch (category) {
      case "restaurant":
        return ['nwr["amenity"="restaurant"]', 'nwr["cuisine"]'];
      case "cafe":
        return ['nwr["amenity"="cafe"]'];
      case "shopping":
        return ['nwr["shop"]', 'nwr["amenity"="marketplace"]'];
      case "entertainment":
        return ['nwr["amenity"="cinema"]', 'nwr["amenity"="bar"]', 'nwr["amenity"="pub"]'];
      case "sports":
        return ['nwr["leisure"]', 'nwr["sport"]'];
      case "culture":
        return ['nwr["amenity"="arts_centre"]', 'nwr["amenity"="theatre"]'];
      case "museum":
        return ['nwr["tourism"="museum"]'];
      case "event_space":
        return ['nwr["amenity"="community_centre"]', 'nwr["amenity"="conference_centre"]', 'nwr["amenity"="events_venue"]'];
      default:
        return [];
    }
  });
  const selectedFilters = filters.length ? [...new Set(filters)] : ['nwr["amenity"]', 'nwr["shop"]', 'nwr["tourism"]', 'nwr["leisure"]'];
  const selectors = selectedFilters.map((filter) => `${filter}(${south},${west},${north},${east});`).join("");
  const resultLimit = Math.min(MAX_RESULTS, Math.max(1, input.limit));
  return `[out:json][timeout:12];(${selectors});out center tags ${resultLimit};`;
}

export interface OverpassDiagnostic {
  hostname?: string;
  status?: number;
  timedOut: boolean;
  durationMs: number;
  responseBodyExcerpt?: string;
}

export class OverpassRequestError extends Error {
  diagnostic: OverpassDiagnostic;

  constructor(message: string, diagnostic: OverpassDiagnostic) {
    super(message);
    this.name = "OverpassRequestError";
    this.diagnostic = diagnostic;
  }
}

function upstreamHostname(): string | undefined {
  try {
    return new URL(OVERPASS_URL).hostname || undefined;
  } catch {
    return undefined;
  }
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^/\s@]+@/gi, "$1[redacted]@")
    .replace(/([?&](?:token|key|api[_-]?key|authorization)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(["']?(?:password|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 500);
}

export async function fetchOverpassQuery(query: string, timeoutMs = OVERPASS_REQUEST_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      let responseBodyExcerpt: string | undefined;
      try {
        responseBodyExcerpt = sanitizeDiagnosticText(await response.text());
      } catch {
        responseBodyExcerpt = undefined;
      }
      throw new OverpassRequestError(
        `Overpass returned HTTP ${response.status}.`,
        { hostname: upstreamHostname(), status: response.status, timedOut, durationMs, responseBodyExcerpt },
      );
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new OverpassRequestError(
        "Overpass returned an invalid JSON response.",
        {
          hostname: upstreamHostname(),
          status: response.status,
          timedOut,
          durationMs: Date.now() - startedAt,
          responseBodyExcerpt: sanitizeDiagnosticText(text),
        },
      );
    }
  } catch (error) {
    if (error instanceof OverpassRequestError) throw error;
    timedOut ||= controller.signal.aborted;
    const nativeError = error instanceof Error ? error : new Error(String(error));
    throw new OverpassRequestError(
      sanitizeDiagnosticText(nativeError.message),
      {
        hostname: upstreamHostname(),
        timedOut,
        durationMs: Date.now() - startedAt,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForThrottle(): Promise<void> {
  const wait = Promise.resolve(requestTail).then(async () => {
    const remaining = MIN_REQUEST_SPACING_MS - (Date.now() - lastRequestAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    lastRequestAt = Date.now();
  });
  requestTail = wait;
  return wait;
}

export const openStreetMapVenueProvider: VenueProvider = {
  id: "openstreetmap",
  async search(input) {
    if (!input.bbox && input.radius) input = { ...input, bbox: radiusToBoundingBox(input.radius), radius: undefined };
    if (!input.bbox) throw new Error("A bounding box or radius is required.");
    if (
      input.bbox.south >= input.bbox.north ||
      input.bbox.west >= input.bbox.east ||
      input.bbox.north - input.bbox.south > 2 ||
      input.bbox.east - input.bbox.west > 3 ||
      Object.values(input.bbox).some((coordinate) => !Number.isFinite(coordinate))
    ) {
      throw new Error("Invalid geographic bounding box.");
    }
    pruneExpiredCache();
    const categories = [...new Set(input.categories)].sort().join(",");
    const cacheKey = JSON.stringify({
      bbox: input.bbox,
      categories,
      query: input.query?.trim().toLowerCase() ?? "",
      limit: input.limit,
    });
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.venues.slice(0, input.limit);

    await waitForThrottle();
    const payload = await fetchOverpassQuery(buildOverpassQuery({ ...input, limit: input.limit }));
    const normalized = parseOverpassVenueElements(payload)
      .filter((venue) => !input.query?.trim() || venue.name.toLowerCase().includes(input.query.trim().toLowerCase()))
      .filter((venue) => input.categories.length === 0 || input.categories.some((category) => venue.categories.includes(category)))
      .slice(0, Math.min(input.limit, MAX_RESULTS));

    CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, venues: normalized });
    pruneExpiredCache();
    for (const venue of normalized) VENUES.set(venue.providerVenueId, venue);
    return normalized;
  },
  async find(providerVenueId) {
    return VENUES.get(providerVenueId);
  },
};
