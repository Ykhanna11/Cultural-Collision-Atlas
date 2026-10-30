import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import duckdb from "duckdb";
import type { VenueProvider, VenueSearchInput } from "./venue-provider";
import type { Venue } from "./venue-source";

const MAX_RESULTS = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE = new Map<string, { expiresAt: number; venues: Venue[] }>();
const VENUES = new Map<string, Venue>();

export interface OvertureCoverage {
  release?: string;
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface OvertureSourceRecord {
  id?: unknown;
  name?: unknown;
  taxonomy?: unknown;
  categories?: unknown;
  addresses?: unknown;
  geometry?: unknown;
  bbox?: unknown;
  sources?: unknown;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function nestedName(value: unknown): string | undefined {
  const parsed = parseJsonObject(value);
  if (typeof parsed !== "object" || parsed === null) return text(parsed);
  const record = parsed as Record<string, unknown>;
  return text(record.primary) ?? text(record.name);
}

export function overtureTaxonomies(value: unknown): string[] {
  const parsed = parseJsonObject(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
  const record = parsed as Record<string, unknown>;
  const values = [
    text(record.primary),
    ...(Array.isArray(record.alternatives) ? record.alternatives.map(text) : []),
  ];
  return [...new Set(values.filter((item): item is string => Boolean(item)))];
}

export function overtureAddress(value: unknown): string | undefined {
  const parsed = parseJsonObject(value);
  const addresses = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null ? [parsed] : [];
  const address = addresses[0];
  if (typeof address !== "object" || address === null) return undefined;
  const record = address as Record<string, unknown>;
  const parts = [
    text(record.freeform),
    [text(record.house_number), text(record.street)].filter(Boolean).join(" "),
    text(record.locality),
    text(record.region),
    text(record.country),
    text(record.postcode),
  ].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(", ") || undefined;
}

function parsePointGeometry(value: unknown): { longitude: number; latitude: number } | undefined {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    if (bytes.length < 21) return undefined;
    try {
      const littleEndian = bytes[0] === 1;
      const x = littleEndian ? bytes.readDoubleLE(5) : bytes.readDoubleBE(5);
      const y = littleEndian ? bytes.readDoubleLE(13) : bytes.readDoubleBE(13);
      return { longitude: x, latitude: y };
    } catch {
      return undefined;
    }
  }
  const parsed = parseJsonObject(value) as Record<string, unknown> | undefined;
  if (parsed && parsed.type === "Point" && Array.isArray(parsed.coordinates)) {
    const [longitude, latitude] = parsed.coordinates;
    return finiteNumber(longitude) !== undefined && finiteNumber(latitude) !== undefined
      ? { longitude: Number(longitude), latitude: Number(latitude) }
      : undefined;
  }
  return undefined;
}

export function overtureCategories(taxonomies: string[], explicitCategories?: unknown): string[] {
  const categoryValues = [
    ...taxonomies.map((value) => value.toLowerCase()),
    ...(Array.isArray(explicitCategories)
      ? explicitCategories.map((value) => typeof value === "string" ? value.toLowerCase() : "")
      : []),
  ];
  const categories = new Set<string>();
  if (categoryValues.some((value) => /museum/.test(value))) categories.add("museum");
  if (categoryValues.some((value) => /(theatre|theater|arts_center|arts_centre|gallery)/.test(value))) categories.add("culture");
  if (categoryValues.some((value) => /(restaurant|food_service)/.test(value))) categories.add("restaurant");
  if (categoryValues.some((value) => /(cafe|coffee_shop)/.test(value))) categories.add("cafe");
  if (categoryValues.some((value) => /(shopping|shop|store|retail)/.test(value))) categories.add("shopping");
  if (categoryValues.some((value) => /(cinema|movie|bar|pub)/.test(value))) categories.add("entertainment");
  if (categoryValues.some((value) => /(sports|stadium|gym|fitness|leisure)/.test(value))) categories.add("sports");
  if (categoryValues.some((value) => /(event_space|conference_centre|conference_center|community_centre|community_center)/.test(value))) categories.add("event_space");
  return [...categories];
}

export function parseOvertureVenueRecord(record: OvertureSourceRecord, release = "release unknown"): Venue | undefined {
  const name = nestedName(record.name);
  const id = text(record.id);
  if (!name || !id) return undefined;
  const point = parsePointGeometry(record.geometry);
  if (!point || point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return undefined;
  const taxonomies = overtureTaxonomies(record.taxonomy);
  const categories = overtureCategories(taxonomies, record.categories);
  return {
    provider: "overture",
    providerVenueId: `overture-${id}`,
    name,
    latitude: point.latitude,
    longitude: point.longitude,
    ...(overtureAddress(record.addresses) && { address: overtureAddress(record.addresses) }),
    categories,
    attribution: `Overture Maps Places, ${release}. Dataset sources retained in the licensed extract; Overture attribution and individual source notices apply.`,
    retrievedAt: new Date().toISOString(),
  };
}

export function readOvertureCoverage(directory: string): OvertureCoverage | undefined {
  const manifestPath = join(resolve(directory), "coverage.json");
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<OvertureCoverage>;
    const values = [manifest.west, manifest.south, manifest.east, manifest.north].map(finiteNumber);
    if (values.some((value) => value === undefined)) return undefined;
    return {
      west: values[0]!,
      south: values[1]!,
      east: values[2]!,
      north: values[3]!,
      ...(text(manifest.release) && { release: text(manifest.release) }),
    };
  } catch {
    return undefined;
  }
}

function dataFiles(directory: string): string[] {
  const resolved = resolve(directory);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) return [];
  return readdirSync(resolved).filter((name) => name.endsWith(".parquet")).map((name) => join(resolved, name));
}

export class OvertureDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OvertureDataUnavailableError";
  }

  export function overtureDataDirectory(): string {
    return resolve(process.env.OVERTURE_DATA_DIR?.trim() || "data/overture/places");
  }
}

function allRows(database: duckdb.Database, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolveRows, rejectRows) => {
    database.all(sql, (error, rows) => error ? rejectRows(error) : resolveRows(rows as Record<string, unknown>[]));
  });
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

export const overtureVenueProvider: VenueProvider = {
  id: "overture",
  async search(input) {
    const directory = overtureDataDirectory();
    const files = dataFiles(directory);
    if (files.length === 0) throw new OvertureDataUnavailableError("No readable Overture GeoParquet data is configured.");
    const bbox = input.bbox ?? ({ south: input.radius!.latitude - input.radius!.kilometers / 111.32, west: input.radius!.longitude - input.radius!.kilometers / 111.32, north: input.radius!.latitude + input.radius!.kilometers / 111.32, east: input.radius!.longitude + input.radius!.kilometers / 111.32 });
    const coverage = readOvertureCoverage(directory);
    if (coverage && (bbox.west < coverage.west || bbox.south < coverage.south || bbox.east > coverage.east || bbox.north > coverage.north)) {
      throw new OvertureDataUnavailableError("The requested area is outside the configured Overture coverage.");
    }
    const cacheKey = JSON.stringify({ bbox, categories: [...input.categories].sort(), query: input.query?.trim().toLowerCase(), limit: input.limit });
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.venues.slice(0, input.limit);

    const database = new duckdb.Database(":memory:");
    try {
      const fileList = files.map((file) => `'${escapeSqlString(file)}'`).join(",");
      const rows = await allRows(database, `
        SELECT id, names.primary AS name, taxonomy, categories, addresses, geometry, sources
        FROM read_parquet([${fileList}], filename=true)
        WHERE bbox.xmin >= ${bbox.west}
          AND bbox.xmax <= ${bbox.east}
          AND bbox.ymin >= ${bbox.south}
          AND bbox.ymax <= ${bbox.north}
        LIMIT ${Math.min(MAX_RESULTS, Math.max(1, input.limit)) * 4}
      `);
      const normalized = rows.map((row) => parseOvertureVenueRecord({
        id: row.id,
        name: row.name,
        taxonomy: row.taxonomy,
        categories: row.categories,
        addresses: row.addresses,
        geometry: row.geometry,
        sources: row.sources,
      }, coverage?.release)).filter((venue): venue is Venue => Boolean(venue))
        .filter((venue) => bboxPointContained(venue, bbox))
        .filter((venue) => !input.query?.trim() || venue.name.toLowerCase().includes(input.query.trim().toLowerCase()))
        .filter((venue) => input.categories.length === 0 || input.categories.some((category) => venue.categories.includes(category)))
        .filter((venue, index, venues) => venues.findIndex((candidate) => candidate.providerVenueId === venue.providerVenueId) === index)
        .slice(0, Math.min(MAX_RESULTS, input.limit));
      CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, venues: normalized });
      for (const venue of normalized) VENUES.set(venue.providerVenueId, venue);
      return normalized;
    } catch (error) {
      if (error instanceof Error && /parquet|io|file/i.test(error.message)) {
        throw new OvertureDataUnavailableError("The configured Overture GeoParquet data is unreadable or corrupt.");
      }
      throw error;
    } finally {
      database.close();
    }
  },
  async find(providerVenueId: string) {
    return VENUES.get(providerVenueId);
  },
};

function bboxPointContained(venue: Venue, bbox: NonNullable<VenueSearchInput["bbox"]>): boolean {
  return venue.longitude >= bbox.west && venue.longitude <= bbox.east && venue.latitude >= bbox.south && venue.latitude <= bbox.north;
}
