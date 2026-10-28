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
  assert.equal(unavailableAgent.status, 503);
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
