import {
  isRecord,
  QlooApiError,
  qlooGet,
  recordQlooSuccess,
} from "./client";

export interface QlooEntity {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  description: string | null;
  placeType: string | null;
  administrativeLevel: number | null;
  ancestorNames: string[];
  source: "qloo_api";
}

export type QlooEntitySearchType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:locality"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:videogame";

export async function searchQlooEntities(
  query: string,
  types?: QlooEntitySearchType[],
): Promise<QlooEntity[]> {
  let payload: unknown;
  try {
    payload = await qlooGet<unknown>("/search", {
      query,
      take: "8",
      ...(types && { types }),
    });
  } catch (error) {
    if (error instanceof QlooApiError && error.status === 404) {
      recordQlooSuccess();
      return [];
    }
    throw error;
  }
  return parseQlooEntityResults(payload);
}

export function parseQlooEntityResults(payload: unknown): QlooEntity[] {
  const root = isRecord(payload) ? payload : null;
  if (root && "success" in root && root.success !== true) {
    throw new Error("Qloo entity search reported an unsuccessful response.");
  }
  const rawResults = root?.results;
  if (!Array.isArray(rawResults)) {
    throw new Error("Qloo entity search returned an unrecognized response shape.");
  }

  return rawResults.map((entity, index): QlooEntity => {
    if (!isRecord(entity)) {
      throw new Error(`Qloo entity search result ${index} was not an object.`);
    }
    const id = entity.entity_id;
    const name = entity.name;
    if (!isQlooEntityId(id)) {
      throw new Error(`Qloo entity search result ${index} had an invalid entity_id.`);
    }
    if (typeof name !== "string" || !name.trim()) {
      throw new Error(`Qloo entity search result ${index} had an invalid name.`);
    }
    const properties = isRecord(entity.properties) ? entity.properties : null;
    const rawDescription =
      (typeof entity.description === "string" && entity.description) ||
      (typeof properties?.short_description === "string" &&
        properties.short_description) ||
      (typeof properties?.description === "string" && properties.description) ||
      null;
    const description =
      rawDescription && !/^(none|null|undefined)$/i.test(rawDescription.trim())
        ? rawDescription.trim()
        : null;
    const ancestors = Array.isArray(properties?.ancestors)
      ? properties.ancestors
      : [];
    return {
      id,
      name,
      type:
        typeof entity.type === "string"
          ? entity.type
          : Array.isArray(entity.types) && typeof entity.types[0] === "string"
            ? entity.types[0]
            : null,
      subtype: typeof entity.subtype === "string" ? entity.subtype : null,
      description,
      placeType:
        typeof properties?.place === "string" ? properties.place : null,
      administrativeLevel:
        typeof properties?.admin_level === "number" &&
        Number.isInteger(properties.admin_level)
          ? properties.admin_level
          : null,
      ancestorNames: ancestors.flatMap((ancestor): string[] =>
        isRecord(ancestor) && typeof ancestor.name === "string"
          ? [ancestor.name]
          : [],
      ),
      source: "qloo_api",
    };
  });
}

export async function isVerifiedQlooCityLocality(
  entityId: string,
): Promise<boolean> {
  const payload = await qlooGet<unknown>("/entities", {
    entity_ids: [entityId],
  });
  return responseContainsCityLocality(payload, entityId);
}

export function responseContainsCityLocality(
  payload: unknown,
  entityId: string,
): boolean {
  const root = isRecord(payload) ? payload : null;
  const rawResults = root?.results;
  const entities = Array.isArray(rawResults)
    ? rawResults
    : isRecord(rawResults) && Array.isArray(rawResults.entities)
      ? rawResults.entities
      : null;
  if (!entities) {
    throw new Error("Qloo entity lookup returned an unrecognized response shape.");
  }

  return entities.some(
    (entity) =>
      isRecord(entity) &&
      entity.entity_id === entityId &&
      isRecord(entity.properties) &&
      entity.properties.place === "city",
  );
}

export function isQlooEntityId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  );
}
