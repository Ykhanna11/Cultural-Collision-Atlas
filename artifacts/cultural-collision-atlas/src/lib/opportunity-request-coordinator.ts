export interface OpportunityRequestContext {
  analysisReference: string;
  city: string;
  entityId: string;
}

export interface OpportunityRequestHandle {
  version: number;
  key: string;
  context: OpportunityRequestContext;
}

export interface OpportunityRequestState<T> {
  loading: boolean;
  error: unknown;
  data?: T;
}

export function createOpportunityRequestCoordinator<T>() {
  let requestVersion = 0;
  let requestKey: string | null = null;
  let state: OpportunityRequestState<T> = {
    loading: false,
    error: null,
    data: undefined,
  };

  const normalize = (value: string) => value.trim().toLowerCase();

  const buildKey = (context: OpportunityRequestContext) => {
    return `${context.analysisReference}|${normalize(context.city)}|${context.entityId}`;
  };

  const beginRequest = (context: OpportunityRequestContext): OpportunityRequestHandle => {
    requestVersion += 1;
    requestKey = buildKey(context);
    state = { loading: true, error: null, data: undefined };
    return { version: requestVersion, key: requestKey, context };
  };

  const invalidate = () => {
    requestVersion += 1;
    requestKey = null;
    state = { loading: false, error: null, data: undefined };
  };

  const isCurrent = (handle: OpportunityRequestHandle) => {
    return requestVersion === handle.version && requestKey === handle.key;
  };

  const isResponseCurrent = ({
    activeContext,
    responseContext,
  }: {
    activeContext: OpportunityRequestContext | null;
    responseContext: OpportunityRequestContext | null;
  }) => {
    if (!activeContext || !responseContext) return false;
    return (
      activeContext.analysisReference.trim() === responseContext.analysisReference.trim() &&
      normalize(activeContext.city) === normalize(responseContext.city) &&
      activeContext.entityId === responseContext.entityId
    );
  };

  const applySuccess = (handle: OpportunityRequestHandle, response: T) => {
    if (!isCurrent(handle)) {
      return { ...state, ignored: true as const };
    }
    if (!isResponseCurrent({ activeContext: handle.context, responseContext: handle.context })) {
      return { ...state, ignored: true as const };
    }

    state = { loading: false, error: null, data: response };
    return { ...state, ignored: false as const };
  };

  const applyError = (handle: OpportunityRequestHandle, error: unknown) => {
    if (!isCurrent(handle)) {
      return { ...state, ignored: true as const };
    }

    state = { loading: false, error, data: undefined };
    return { ...state, ignored: false as const };
  };

  const applySettled = (handle: OpportunityRequestHandle) => {
    if (!isCurrent(handle)) {
      return { ...state, ignored: true as const };
    }

    state = { ...state, loading: false };
    return { ...state, ignored: false as const };
  };

  return {
    beginRequest,
    invalidate,
    isCurrent,
    isResponseCurrent,
    applySuccess,
    applyError,
    applySettled,
    getState: () => state,
  };
}
