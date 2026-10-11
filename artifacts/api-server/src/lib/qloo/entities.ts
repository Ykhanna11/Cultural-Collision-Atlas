import { isRecord, qlooGet } from "./client";

export interface QlooEntity {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  source: "qloo_api";
}

export async function searchQlooEntities(query: string): Promise<QlooEntity[]> {
  const payload = await qlooGet<unknown>("/search", { query, take: "8" });
  const root = isRecord(payload) ? payload : null;
  const results = root && isRecord(root.results) ? root.results : null;
  const entities = results?.entities;

  if (!Array.isArray(entities)) {
    throw new Error("Qloo entity search returned an unrecognized response shape.");
  }

  return entities.flatMap((entity): QlooEntity[] => {
    if (!isRecord(entity)) return [];
    const id = entity.entity_id;
    const name = entity.name;
    if (typeof id !== "string" || typeof name !== "string") return [];
    return [{
      id,
      name,
      type: typeof entity.type === "string" ? entity.type : null,
      subtype: typeof entity.subtype === "string" ? entity.subtype : null,
      source: "qloo_api",
    }];
  });
}
