export interface StaleAnalysisContext {
  analysisReference: string;
  city: string;
  entityId: string;
  candidateName: string;
}

export function isStaleAnalysisFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; message?: string; data?: unknown; error?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  const message = [
    typeof candidate.message === 'string' ? candidate.message : '',
    typeof candidate.error === 'string' ? candidate.error : '',
    typeof candidate.data === 'object' && candidate.data !== null && 'error' in candidate.data && typeof candidate.data.error === 'string'
      ? candidate.data.error
      : '',
  ].join(' ');

  if (status === 410 || status === 409) return true;
  if (status !== 400) return false;

  return /expired or is unavailable|expired analysis|analysis reference expired|does not belong to this discovery analysis|does not match the discovery analysis|selected bridge does not belong|selected city does not match/i.test(message);
}

export function getStaleAnalysisNotice({
  analysisContext,
  city,
  entityId,
  error,
}: {
  analysisContext: StaleAnalysisContext | null;
  city: string;
  entityId: string;
  error: unknown;
}): string | null {
  if (!analysisContext) return null;

  const cityMatches = city.trim().toLowerCase() === analysisContext.city.trim().toLowerCase();
  const entityMatches = entityId === analysisContext.entityId;

  if (isStaleAnalysisFailure(error) || !cityMatches || !entityMatches) {
    return 'This Discovery analysis is stale, invalid, or no longer matches the active city/entity. Run Discovery again to refresh cultural evidence and re-check venue readiness.';
  }

  return null;
}
