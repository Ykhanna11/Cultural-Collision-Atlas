import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import duckdb from "duckdb";
import type { VenueProvider, VenueSearchInput } from "./venue-provider";
import type { Venue } from "./venue-source";

const MAX_RESULTS = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const CACHE = new Map<string, { expiresAt: number; venues: Venue[] }>();
const VENUES = new Map<string, Venue>();
const IN_FLIGHT = new Map<string, Promise<Venue[]>>();
const VERIFIED_DIRECTORIES = new Set<string>();

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
  basic_category?: unknown;
  websites?: unknown;
  phones?: unknown;
  emails?: unknown;
  operating_status?: unknown;
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
  const direct = text(value);
  if (direct) return direct;
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
    ...(Array.isArray(record.hierarchy) ? record.hierarchy.map(text) : []),
    ...(Array.isArray(record.alternates) ? record.alternates.map(text) : []),
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
    ...(typeof explicitCategories === "string"
      ? [explicitCategories.toLowerCase()]
      : Array.isArray(explicitCategories)
        ? explicitCategories.map((value) => typeof value === "string" ? value.toLowerCase() : "")
      : []),
  ];
  const categories = new Set<string>();
  if (categoryValues.some((value) => /museum/.test(value))) categories.add("museum");
  if (categoryValues.some((value) => /(theatre|theater|arts|gallery|cultural|heritage|music_venue)/.test(value))) categories.add("culture");
  if (categoryValues.some((value) => /(restaurant|food_service|dining|fast_food)/.test(value))) categories.add("restaurant");
  if (categoryValues.some((value) => /(cafe|coffee|tea_house)/.test(value))) categories.add("cafe");
  if (categoryValues.some((value) => /(shopping|store|retail|market|grocery|book_shop|clothing_shop)/.test(value) || /shop/.test(value.replaceAll("coffee_shop", "")))) categories.add("shopping");
  if (categoryValues.some((value) => /(cinema|movie|bar|pub|nightclub|entertainment|amusement)/.test(value))) categories.add("entertainment");
  if (categoryValues.some((value) => /(sports|stadium|gym|fitness|leisure|recreation)/.test(value))) categories.add("sports");
  if (categoryValues.some((value) => /(event_space|event_venue|conference|convention|community_centre|community_center)/.test(value))) categories.add("event_space");
  return [...categories];
}

function firstText(value: unknown): string | undefined {
  const parsed = parseJsonObject(value);
  return Array.isArray(parsed) ? parsed.map(text).find((item): item is string => Boolean(item)) : text(parsed);
}

function sourceReferences(value: unknown): NonNullable<Venue["sourceMetadata"]>["sources"] {
  const parsed = parseJsonObject(value);
  if (!Array.isArray(parsed)) return undefined;
  const sources = parsed.flatMap((source) => {
    if (typeof source !== "object" || source === null || Array.isArray(source)) return [];
    const record = source as Record<string, unknown>;
    const reference = {
      ...(text(record.dataset) && { dataset: text(record.dataset) }),
      ...(text(record.license) && { license: text(record.license) }),
      ...(text(record.provider) && { provider: text(record.provider) }),
      ...(text(record.record_id) && { recordId: text(record.record_id) }),
      ...(text(record.version) && { version: text(record.version) }),
    };
    return Object.keys(reference).length ? [reference] : [];
  });
  return sources.length ? sources : undefined;
}

export function parseOvertureVenueRecord(record: OvertureSourceRecord, release = "release unknown"): Venue | undefined {
  const name = nestedName(record.name);
  const id = text(record.id);
  if (!name || !id) return undefined;
  const point = parsePointGeometry(record.geometry);
  if (!point || point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return undefined;
  const taxonomies = overtureTaxonomies(record.taxonomy);
  const categories = overtureCategories(taxonomies, [record.basic_category, record.categories]
    .flatMap((value) => Array.isArray(value) ? value : [value]));
  const metadataSources = sourceReferences(record.sources);
  return {
    provider: "overture",
    providerVenueId: `overture-${id}`,
    name,
    latitude: point.latitude,
    longitude: point.longitude,
    ...(overtureAddress(record.addresses) && { address: overtureAddress(record.addresses) }),
    categories,
    ...(firstText(record.websites) && { website: firstText(record.websites) }),
    ...(firstText(record.phones) && { phone: firstText(record.phones) }),
    ...(firstText(record.emails) && { email: firstText(record.emails) }),
    ...(metadataSources || text(record.basic_category) || taxonomies.length || text(record.operating_status)) && {
      sourceMetadata: {
        ...(text(record.basic_category) && { basicCategory: text(record.basic_category) }),
        ...(taxonomies.length && { taxonomy: taxonomies }),
        ...(metadataSources && { sources: metadataSources }),
        ...(text(record.operating_status) && { operatingStatus: text(record.operating_status) }),
      },
    },
    attribution: `Overture Maps Foundation, overturemaps.org, ${release}. Individual source licenses and notices apply.`,
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
  return readdirSync(resolved).filter((name) => name.endsWith(".parquet")).sort().map((name) => join(resolved, name));
}

export class OvertureDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OvertureDataUnavailableError";
  }
}

export function overtureDataDirectory(): string {
  return resolve(process.env.OVERTURE_DATA_DIR?.trim() || "data/overture/places");
}

function allRows(database: duckdb.Database, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolveRows, rejectRows) => {
    database.all(sql, (error, rows) => error ? rejectRows(error) : resolveRows(rows as Record<string, unknown>[]));
  });
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

const CATEGORY_PATTERNS: Record<string, string> = {
  restaurant: "restaurant|food_service|dining|fast_food",
  cafe: "cafe|coffee|tea_house",
  shopping: "shopping|shop|store|retail|market|grocery",
  entertainment: "cinema|movie|bar|pub|nightclub|entertainment|amusement",
  sports: "sports|stadium|gym|fitness|leisure|recreation",
  culture: "museum|theatre|theater|arts|gallery|cultural|heritage|music_venue",
  museum: "museum",
  event_space: "event_space|event_venue|conference|convention|community_centre|community_center",
};

function searchBoundingBox(input: VenueSearchInput) {
  if (input.bbox) return input.bbox;
  const radius = input.radius;
  if (!radius) throw new Error("A geographic bounding box or radius is required.");
  const latitudeDelta = radius.kilometers / 111.32;
  const longitudeScale = Math.max(Math.cos(radius.latitude * Math.PI / 180), 0.01);
  const longitudeDelta = Math.min(180, radius.kilometers / (111.32 * longitudeScale));
  return {
    south: Math.max(-90, radius.latitude - latitudeDelta),
    west: Math.max(-180, radius.longitude - longitudeDelta),
    north: Math.min(90, radius.latitude + latitudeDelta),
    east: Math.min(180, radius.longitude + longitudeDelta),
  };
}

function withinRadius(venue: Venue, radius: NonNullable<VenueSearchInput["radius"]>): boolean {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(venue.latitude - radius.latitude);
  const longitudeDelta = radians(venue.longitude - radius.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(radius.latitude)) * Math.cos(radians(venue.latitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) <= radius.kilometers;
}

function rememberCache(key: string, venues: Venue[]) {
  CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, venues });
  while (CACHE.size > MAX_CACHE_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (typeof oldest !== "string") break;
    CACHE.delete(oldest);
  }
  for (const venue of venues) VENUES.set(venue.providerVenueId, venue);
  while (VENUES.size > MAX_CACHE_ENTRIES * MAX_RESULTS) {
    const oldest = VENUES.keys().next().value;
    if (typeof oldest !== "string") break;
    VENUES.delete(oldest);
  }
}

export function getOvertureDataStatus() {
  const directory = overtureDataDirectory();
  try {
    const available = dataFiles(directory).length > 0;
    const verified = VERIFIED_DIRECTORIES.has(directory);
    return {
      configured: available,
      state: !available ? "unavailable" as const : verified ? "reachable" as const : "unknown" as const,
      message: available
        ? verified
          ? "A local Overture Places GeoParquet extract was queried successfully."
          : "A local Overture Places GeoParquet extract was found. Query it to verify the file contents."
        : "No Overture Places GeoParquet extract is available. Configure OVERTURE_DATA_DIR or follow docs/overture-places.md.",
    };
  } catch {
    return {
      configured: false,
      state: "unavailable" as const,
      message: "The configured Overture Places data directory is unavailable. Check its permissions and configuration.",
    };
  }
}

export const overtureVenueProvider: VenueProvider = {
  id: "overture",
  async search(input) {
    const directory = overtureDataDirectory();
    let files: string[];
    try {
      files = dataFiles(directory);
    } catch {
      throw new OvertureDataUnavailableError("The configured Overture Places data directory is unavailable.");
    }
    if (files.length === 0) throw new OvertureDataUnavailableError("No readable Overture GeoParquet data is configured.");
    const bbox = searchBoundingBox(input);
    const coverage = readOvertureCoverage(directory);
    if (coverage && (bbox.west < coverage.west || bbox.south < coverage.south || bbox.east > coverage.east || bbox.north > coverage.north)) {
      throw new OvertureDataUnavailableError("The requested area is outside the configured Overture coverage.");
    }
    const limit = Math.min(MAX_RESULTS, Math.max(1, Math.floor(input.limit || 25)));
    const cacheKey = JSON.stringify({ directory, bbox, radius: input.radius, categories: [...input.categories].sort(), query: input.query?.trim().toLowerCase(), limit });
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.venues.slice(0, limit);
    const pending = IN_FLIGHT.get(cacheKey);
    if (pending) return pending;

    const search = (async () => {
      const database = new duckdb.Database(":memory:");
      try {
        const fileList = files.map((file) => `'${escapeSqlString(file)}'`).join(",");
        const predicates = [
          "names.primary IS NOT NULL",
          "length(trim(names.primary)) > 0",
          `bbox.xmax >= ${bbox.west}`,
          `bbox.xmin <= ${bbox.east}`,
          `bbox.ymax >= ${bbox.south}`,
          `bbox.ymin <= ${bbox.north}`,
        ];
        if (input.query?.trim()) {
          predicates.push(`position(lower('${escapeSqlString(input.query.trim())}') in lower(names.primary)) > 0`);
        }
        const patterns = [...new Set(input.categories.flatMap((category) => CATEGORY_PATTERNS[category] ? [CATEGORY_PATTERNS[category]] : []))];
        if (patterns.length) {
          const pattern = patterns.map((value) => `regexp_matches(lower(coalesce(basic_category, '') || ' ' || coalesce(to_json(taxonomy), '')), '${value}')`).join(" OR ");
          predicates.push(`(${pattern})`);
        }
        const rows = await allRows(database, `
          SELECT id, names.primary AS name, basic_category, taxonomy, addresses,
            websites, phones, emails, operating_status, geometry, sources
          FROM read_parquet([${fileList}])
          WHERE ${predicates.join(" AND ")}
          QUALIFY row_number() OVER (PARTITION BY id ORDER BY version DESC) = 1
          ORDER BY id
          LIMIT ${limit * 8}
        `);
        VERIFIED_DIRECTORIES.add(directory);
        const seen = new Set<string>();
        const normalized = rows.map((row) => parseOvertureVenueRecord({
          id: row.id,
          name: row.name,
          taxonomy: row.taxonomy,
          basic_category: row.basic_category,
          addresses: row.addresses,
          websites: row.websites,
          phones: row.phones,
          emails: row.emails,
          operating_status: row.operating_status,
          geometry: row.geometry,
          sources: row.sources,
        }, coverage?.release)).filter((venue): venue is Venue => Boolean(venue))
          .filter((venue) => bboxPointContained(venue, bbox))
          .filter((venue) => !input.radius || withinRadius(venue, input.radius))
          .filter((venue) => input.categories.length === 0 || input.categories.some((category) => venue.categories.includes(category)))
          .filter((venue) => {
            if (seen.has(venue.providerVenueId)) return false;
            seen.add(venue.providerVenueId);
            return true;
          })
          .slice(0, limit);
        rememberCache(cacheKey, normalized);
        return normalized;
      } catch (error) {
        if (error instanceof Error && /parquet|io|file/i.test(error.message)) {
          throw new OvertureDataUnavailableError("The configured Overture GeoParquet data is unreadable or corrupt.");
        }
        throw error;
      } finally {
        database.close();
      }
    })();
    IN_FLIGHT.set(cacheKey, search);
    try {
      return await search;
    } finally {
      IN_FLIGHT.delete(cacheKey);
    }
  },
  async find(providerVenueId: string) {
    return VENUES.get(providerVenueId);
  },
};

function bboxPointContained(venue: Venue, bbox: NonNullable<VenueSearchInput["bbox"]>): boolean {
  return venue.longitude >= bbox.west && venue.longitude <= bbox.east && venue.latitude >= bbox.south && venue.latitude <= bbox.north;
}
