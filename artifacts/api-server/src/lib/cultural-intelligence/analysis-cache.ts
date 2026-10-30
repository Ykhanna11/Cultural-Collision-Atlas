import { randomUUID } from "node:crypto";
import type { BridgeCandidate } from "@workspace/api-zod";
import type { QlooRecommendationType } from "../qloo/insights";
import type { GeographicBounds, GeographicIntelligenceSummary } from "./geographic";

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

export interface CachedDiscoveryAnalysis {
  analysisReference: string;
  input: {
    interestA: string;
    interestAId: string;
    interestB: string;
    interestBId: string;
    city: string;
    cityEntityId?: string;
    recommendationType: QlooRecommendationType;
  };
  resultsA: unknown;
  resultsB: unknown;
  jointResults: unknown;
  tasteAnalysisA: unknown | null;
  tasteAnalysisB: unknown | null;
  candidates: BridgeCandidate[];
  createdAt: string;
  geographicSnapshot?: {
    requestKey: string;
    summary: GeographicIntelligenceSummary;
  };
}

export interface GeographicAnalysisCacheKey {
  city: string;
  entityId: string;
  bounds: GeographicBounds;
  categories: string[];
  query?: string;
  limit: number;
}

interface CacheEntry {
  expiresAt: number;
  analysis: CachedDiscoveryAnalysis;
}

const cache = new Map<string, CacheEntry>();

function geographicRequestKey(request: GeographicAnalysisCacheKey): string {
  return JSON.stringify({
    ...request,
    categories: [...request.categories].sort(),
  });
}

function prune(now: number): void {
  for (const [reference, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(reference);
  }
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) return;
    cache.delete(oldest);
  }
}

export function cacheDiscoveryAnalysis(
  analysis: Omit<CachedDiscoveryAnalysis, "analysisReference">,
  now = Date.now(),
): string {
  prune(now);
  const analysisReference = randomUUID();
  cache.set(analysisReference, {
    expiresAt: now + CACHE_TTL_MS,
    analysis: { ...analysis, analysisReference },
  });
  return analysisReference;
}

export type CachedAnalysisLookup =
  | { status: "found"; analysis: CachedDiscoveryAnalysis }
  | { status: "expired" | "unknown" | "candidate_not_found" };

export function getCachedDiscoveryAnalysis(
  analysisReference: string,
  candidateEntityId: string,
  now = Date.now(),
): CachedAnalysisLookup {
  const entry = cache.get(analysisReference);
  if (!entry) return { status: "unknown" };
  if (entry.expiresAt <= now) {
    cache.delete(analysisReference);
    return { status: "expired" };
  }
  if (!entry.analysis.candidates.some(({ id }) => id === candidateEntityId)) {
    return { status: "candidate_not_found" };
  }
  return { status: "found", analysis: entry.analysis };
}

export function cacheGeographicAnalysis(
  analysis: CachedDiscoveryAnalysis,
  request: GeographicAnalysisCacheKey,
  summary: GeographicIntelligenceSummary,
): void {
  analysis.geographicSnapshot = {
    requestKey: geographicRequestKey(request),
    summary,
  };
}

export function getCachedGeographicAnalysis(
  analysis: CachedDiscoveryAnalysis,
  request: GeographicAnalysisCacheKey,
): GeographicIntelligenceSummary | undefined {
  const cached = analysis.geographicSnapshot;
  return cached?.requestKey === geographicRequestKey(request)
    ? cached.summary
    : undefined;
}