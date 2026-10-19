import { isRecord, qlooGet } from "./client";

export interface QlooEntity {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  description: string | null;
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
  const payload = await qlooGet<unknown>("/search", {
    query,
    take: "8",
    ...(types && { types }),
  });
  const root = isRecord(payload) ? payload : null;
  const rawResults = root?.results;
  const entities = Array.isArray(rawResults)
    ? rawResults
    : isRecord(rawResults) && Array.isArray(rawResults.entities)
      ? rawResults.entities
      : null;

  if (!Array.isArray(entities)) {
    throw new Error("Qloo entity search returned an unrecognized response shape.");
  }

  return entities.flatMap((entity): QlooEntity[] => {
    if (!isRecord(entity)) return [];
    const id = entity.entity_id;
    const name = entity.name;
    if (typeof id !== "string" || typeof name !== "string") return [];
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
    return [{
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
      source: "qloo_api",
    }];
  });
}
