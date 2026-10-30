import assert from "node:assert/strict";
import { test } from "node:test";

process.env.QLOO_BASE_URL = "https://hackathon.api.qloo.com";
delete process.env.QLOO_API_KEY;

const { QlooApiError, getQlooStatus, qlooGet } = await import("./client.ts");

const testCredential = "test-only-not-a-credential";

function setTestCredential(): void {
  process.env.QLOO_API_KEY = testCredential;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("reports unconfigured and configured-unverified states accurately", async (context) => {
  delete process.env.QLOO_API_KEY;
  const fetchMock = context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ unexpected: true }),
  );

  assert.deepEqual(getQlooStatus(), {
    state: "not_configured",
    configured: false,
    verified: false,
    message: "Qloo is not connected. Add QLOO_API_KEY to the project's Secrets to enable live requests.",
    checkedAt: null,
  });
  await assert.rejects(qlooGet("/search", { query: "Jazz" }), QlooApiError);
  assert.equal(fetchMock.mock.callCount(), 0);

  setTestCredential();
  assert.equal(getQlooStatus().state, "configured_unverified");
  assert.equal(getQlooStatus().verified, false);
});

test("uses the hackathon base URL, sends the key header, builds query parameters, and parses JSON", async (context) => {
  setTestCredential();
  let requestUrl: URL | undefined;
  let requestHeaders: Headers | undefined;
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requestUrl = new URL(String(input));
    requestHeaders = new Headers(init?.headers);
    return jsonResponse({ results: [{ entity_id: "qloo-entity", name: "Jazz" }] });
  });

  const result = await qlooGet<{ results: Array<{ name: string }> }>("/search", {
    query: "Jazz & soul",
    take: "1",
    types: ["urn:entity:artist", "urn:entity:book"],
  });

  assert.equal(requestUrl?.origin, "https://hackathon.api.qloo.com");
  assert.equal(requestUrl?.pathname, "/search");
  assert.equal(requestUrl?.searchParams.get("query"), "Jazz & soul");
  assert.equal(requestUrl?.searchParams.get("take"), "1");
  assert.equal(
    requestUrl?.searchParams.get("types"),
    "urn:entity:artist,urn:entity:book",
  );
  assert.ok(
    requestHeaders?.get("x-api-key") === process.env.QLOO_API_KEY,
    "configured credential must be sent only in the x-api-key header",
  );
  assert.equal(requestHeaders?.get("accept"), "application/json");
  assert.deepEqual(result.results[0], { entity_id: "qloo-entity", name: "Jazz" });
  assert.equal(getQlooStatus().state, "verified");
  assert.equal(getQlooStatus().verified, true);
  assert.ok(getQlooStatus().checkedAt instanceof Date);
});

test("authentication, rate-limit, and provider failures clear current verification but retain last success", async (context) => {
  setTestCredential();
  const lastSuccess = getQlooStatus().checkedAt;
  let responseStatus = 401;
  context.mock.method(globalThis, "fetch", async () =>
    new Response(null, { status: responseStatus }),
  );

  for (const status of [401, 403, 429, 500, 503]) {
    responseStatus = status;
    await assert.rejects(
      qlooGet("/search", { query: "Jazz" }),
      (error: unknown) => error instanceof QlooApiError && error.status === status,
    );
    const current = getQlooStatus();
    assert.equal(current.configured, true);
    assert.equal(current.verified, false);
    assert.equal(current.state, "error");
    assert.equal(current.checkedAt, lastSuccess);
  }
});

test("malformed JSON is an error and does not replace the last successful timestamp", async (context) => {
  setTestCredential();
  const lastSuccess = getQlooStatus().checkedAt;
  context.mock.method(globalThis, "fetch", async () =>
    new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await assert.rejects(
    qlooGet("/search", { query: "Jazz" }),
    (error: unknown) => error instanceof QlooApiError && error.status === 502,
  );
  assert.equal(getQlooStatus().state, "error");
  assert.equal(getQlooStatus().verified, false);
  assert.equal(getQlooStatus().checkedAt, lastSuccess);
});

test("network failures and timeout rejections are normalized without live requests", async (context) => {
  setTestCredential();
  let failure: Error = new TypeError("network unavailable");
  let receivedSignal: AbortSignal | undefined;
  context.mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    receivedSignal = init?.signal as AbortSignal | undefined;
    throw failure;
  });

  for (const error of [
    new TypeError("network unavailable"),
    new DOMException("request timed out", "TimeoutError"),
  ]) {
    failure = error;
    await assert.rejects(
      qlooGet("/search", { query: "Jazz" }),
      (caught: unknown) => caught instanceof QlooApiError && caught.status === 502,
    );
    assert.equal(getQlooStatus().state, "error");
    assert.equal(getQlooStatus().verified, false);
    assert.ok(receivedSignal instanceof AbortSignal);
  }
});

test("a later successful response clears the error without losing its fresh status", async (context) => {
  setTestCredential();
  context.mock.method(globalThis, "fetch", async () => jsonResponse({ ok: true }));

  assert.deepEqual(await qlooGet("/search", { query: "Jazz" }), { ok: true });
  assert.equal(getQlooStatus().state, "verified");
  assert.equal(getQlooStatus().verified, true);
});