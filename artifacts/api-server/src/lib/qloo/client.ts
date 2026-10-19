const QLOO_BASE_URL =
  process.env.QLOO_BASE_URL?.trim() ||
  "https://hackathon.api.qloo.com";
const QLOO_API_KEY_ENV = "QLOO_API_KEY";

export class QlooApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QlooApiError";
  }
}

type QlooQueryValue = string | string[];
type QlooQuery = Record<string, QlooQueryValue>;

let verifiedAt: Date | null = null;
let lastError: string | null = null;

export function isQlooConfigured(): boolean {
  return Boolean(process.env[QLOO_API_KEY_ENV]?.trim());
}

export function recordQlooSuccess(): void {
  verifiedAt = new Date();
  lastError = null;
}

export function recordQlooError(status: number): void {
  lastError =
    status === 401 || status === 403
      ? "Qloo rejected the configured credential. Check the QLOO_API_KEY secret."
      : `The authenticated Qloo request failed with HTTP ${status}.`;
}

export function getQlooStatus() {
  const configured = isQlooConfigured();
  const verified = configured && verifiedAt !== null;

  return {
    state: !configured
      ? ("not_configured" as const)
      : lastError
        ? ("error" as const)
        : verified
          ? ("verified" as const)
          : ("configured_unverified" as const),
    configured,
    verified,
    message: !configured
      ? "Qloo is not connected. Add QLOO_API_KEY to the project's Secrets to enable live requests."
      : lastError ??
        (verified
          ? `An authenticated Qloo request succeeded at ${verifiedAt?.toISOString()}.`
          : "QLOO_API_KEY is set, but a live request has not verified the connection yet."),
    checkedAt: verifiedAt,
  };
}

export async function qlooGet<T = unknown>(
  path: "/search" | "/v2/insights/",
  query: QlooQuery,
): Promise<T> {
  const apiKey = process.env[QLOO_API_KEY_ENV]?.trim();
  if (!apiKey) {
    throw new QlooApiError("Qloo credentials are not configured.", 503);
  }

  const url = new URL(path, QLOO_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(","));
    } else {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    recordQlooError(502);
    throw new QlooApiError("Could not reach the Qloo API.", 502);
  }

  if (!response.ok) {
    recordQlooError(response.status);
    throw new QlooApiError(
      `The Qloo API returned HTTP ${response.status}.`,
      response.status,
    );
  }

  recordQlooSuccess();
  try {
    return (await response.json()) as T;
  } catch {
    recordQlooError(502);
    throw new QlooApiError("Qloo returned a response that was not valid JSON.", 502);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
