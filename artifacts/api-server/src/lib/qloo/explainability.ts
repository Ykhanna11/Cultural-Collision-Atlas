import { isRecord } from "./client";

export function extractExplainability(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const topLevelQuery = isRecord(value.query) ? value.query : null;
  const results = isRecord(value.results) ? value.results : null;
  const resultsQuery = results && isRecord(results.query) ? results.query : null;
  const explainability =
    topLevelQuery?.explainability ?? resultsQuery?.explainability;
  return isRecord(explainability) ? explainability : null;
}
