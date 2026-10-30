import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

for (const name of [
  "AUTH_BASE_URL",
  "AUTH_ALLOWED_EMAILS",
  "AUTH_SESSION_SECRET",
  "GOOGLE_OIDC_CLIENT_ID",
  "GOOGLE_OIDC_CLIENT_SECRET",
]) {
  delete process.env[name];
}
process.env.DATABASE_URL = "postgres://127.0.0.1:1/test";
delete process.env.QLOO_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const [{ createApp }, { default: router }] = await Promise.all([
  import("./app.ts"),
  import("./routes/index.ts"),
]);

type ExpressLayer = {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
    stack: Array<{ handle: { name: string } }>;
  };
  handle?: { stack?: ExpressLayer[] };
};

function registeredRoutes(layers: ExpressLayer[]): ExpressLayer["route"][] {
  return layers.flatMap((layer) =>
    layer.route
      ? [layer.route]
      : layer.handle?.stack
        ? registeredRoutes(layer.handle.stack)
        : [],
  );
}

let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp();
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

test("all feature routes are registered without authentication middleware", () => {
  const routes = registeredRoutes(
    (router as unknown as { stack: ExpressLayer[] }).stack,
  );
  assert.ok(routes.length > 0);

  for (const route of routes) {
    assert.ok(route);
    assert.equal(String(route.path).startsWith("/auth/"), false);
    for (const layer of route.stack) {
      assert.notEqual(layer.handle.name, "requireAuthentication");
      assert.notEqual(layer.handle.name, "requireCsrf");
    }
  }
});

test("health and provider APIs work without cookies or CSRF tokens", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.has("set-cookie"), false);

  const qlooStatus = await fetch(`${baseUrl}/qloo/status`);
  assert.equal(qlooStatus.status, 200);
  assert.equal(qlooStatus.headers.has("set-cookie"), false);

  const connectionTest = await fetch(`${baseUrl}/qloo/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "test" }),
  });
  assert.equal(connectionTest.status, 200);
  assert.deepEqual(await connectionTest.json(), {
    state: "not_configured",
    configured: false,
    verified: false,
    message:
      "Qloo is not connected. Configure QLOO_API_KEY in the server environment, then test the connection again.",
    checkedAt: null,
  });

  const agentValidation = await fetch(`${baseUrl}/activation-plans/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(agentValidation.status, 400);

  const unavailableAgent = await fetch(`${baseUrl}/activation-plans/agent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: {
        interestA: "Jazz",
        interestAId: "10000000-0000-4000-8000-000000000001",
        interestB: "Streetwear",
        interestBId: "10000000-0000-4000-8000-000000000002",
        city: "New York",
        activationType: "pop-up",
        budgetRange: "$5k-$10k",
        objective: "Test an opt-in concept",
      },
      bridgeId: "20000000-0000-4000-8000-000000000001",
      bridgeName: "Culture market",
    }),
  });
  assert.equal(unavailableAgent.status, 200);
  const fallbackPlan = await unavailableAgent.json() as {
    source: string;
    fallbackReason: string;
    caveat: string;
  };
  assert.equal(fallbackPlan.source, "deterministic_fallback");
  assert.equal(fallbackPlan.fallbackReason, "credentials_unavailable");
  assert.match(fallbackPlan.caveat, /not AI-generated/);
});

test("workspace database failures return a generic JSON error without connection details", async () => {
  const response = await fetch(`${baseUrl}/activation-plans`);
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const body = await response.text();
  assert.match(body, /Public demo workspace is temporarily unavailable/);
  assert.doesNotMatch(body, /postgres:\/\/|synthetic_test_user|synthetic_test_password|DATABASE_URL/i);
});

test("entity search forwards Qloo entities, distinguishes empty results, and preserves provider errors", async (context) => {
  const previousKey = process.env.QLOO_API_KEY;
  process.env.QLOO_API_KEY = "route-test-only";
  let upstreamStatus = 200;
  let upstreamPayload: unknown = {
    success: true,
    results: [{
      entity_id: "a0c4e68e-031c-4c54-8f5a-51a48fcf6651",
      name: "Nike",
      type: "urn:entity:brand",
      subtype: "sportswear",
    }],
  };
  const realFetch = globalThis.fetch;
  context.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(String(input));
    if (url.origin !== "https://hackathon.api.qloo.com") {
      return realFetch(input, init);
    }
    return new Response(JSON.stringify(upstreamPayload), { status: upstreamStatus });
  });

  try {
    const success = await fetch(`${baseUrl}/qloo/entities/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Nike", types: ["urn:entity:brand"] }),
    });
    assert.equal(success.status, 200);
    const result = await success.json() as {
      source: string;
      entities: Array<{
        id: string;
        name: string;
        type: string | null;
        subtype: string | null;
      }>;
    };
    assert.equal(result.source, "qloo_api");
    assert.equal(result.entities[0].name, "Nike");
    assert.equal(result.entities[0].id, "a0c4e68e-031c-4c54-8f5a-51a48fcf6651");
    assert.equal(result.entities[0].type, "urn:entity:brand");
    assert.equal(result.entities[0].subtype, "sportswear");

    upstreamStatus = 404;
    upstreamPayload = { code: 404, reason: "Not Found", message: "No results" };
    const empty = await fetch(`${baseUrl}/qloo/entities/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "No catalog match" }),
    });
    assert.equal(empty.status, 200);
    const emptyResult = await empty.json() as { entities: unknown[] };
    assert.deepEqual(emptyResult.entities, []);

    upstreamStatus = 429;
    const rateLimited = await fetch(`${baseUrl}/qloo/entities/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Naruto" }),
    });
    assert.equal(rateLimited.status, 429);
    const rateLimitError = await rateLimited.json() as { error: string };
    assert.match(rateLimitError.error, /No substitute or sample results/);
  } finally {
    if (previousKey === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = previousKey;
  }
});

test("public writes retain request validation and abuse limits", async () => {
  const invalidRequest = () =>
    fetch(`${baseUrl}/discoveries/saved`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal((await invalidRequest()).status, 400);
  }
  assert.equal((await invalidRequest()).status, 429);
});
