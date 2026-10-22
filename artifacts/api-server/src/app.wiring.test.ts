import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import session from "express-session";
import type { Express, RequestHandler } from "express";

process.env.AUTH_BASE_URL = "https://atlas.test";
process.env.AUTH_ALLOWED_EMAILS = "allowed@example.test";
process.env.AUTH_SESSION_SECRET =
  "local-test-session-secret-value-at-least-32-bytes";
process.env.DATABASE_URL = "postgres://local-test:unused@127.0.0.1:1/test";
process.env.GOOGLE_OIDC_CLIENT_ID = "local-test-client";
process.env.GOOGLE_OIDC_CLIENT_SECRET = "local-test-client-secret";
delete process.env.QLOO_API_KEY;

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

const publicRoutes = new Set([
  "GET /healthz",
  "GET /auth/session",
  "GET /auth/login",
  "GET /auth/callback",
]);

let server: Server;
let baseUrl: string;

before(async () => {
  const sessionHandler = session({
    secret: randomBytes(32).toString("base64url"),
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
  }) as RequestHandler;
  const app = createApp({
    sessionHandler,
    beforeApi: (target: Express) => {
      target.get("/__test/session", (req, res) => {
        req.session.userId = "test-user";
        req.session.workspaceId = "test-workspace";
        req.session.email = "allowed@example.test";
        req.session.csrfToken = "valid-test-csrf";
        req.session.save((error) => {
          if (error) {
            res.sendStatus(500);
            return;
          }
          res.sendStatus(204);
        });
      });
    },
  });

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

test("every registered API route is protected unless explicitly public", () => {
  const routes = registeredRoutes(
    (router as unknown as { stack: ExpressLayer[] }).stack,
  );
  assert.ok(routes.length > 0);

  for (const route of routes) {
    assert.ok(route);
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (!enabled || method === "_all") continue;
      const routeKey = `${method.toUpperCase()} ${route.path}`;
      const handlers = route.stack.map((layer) => layer.handle.name);
      if (publicRoutes.has(routeKey)) continue;

      assert.ok(
        handlers.includes("requireAuthentication"),
        `${routeKey} must require authentication or be explicitly allowlisted`,
      );
      if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
        assert.ok(
          handlers.includes("requireCsrf"),
          `${routeKey} must require CSRF validation`,
        );
      }
    }
  }
});

test("real API wiring rejects unauthenticated access and enforces CSRF", async () => {
  const publicSession = await fetch(`${baseUrl}/auth/session`);
  assert.equal(publicSession.status, 200);

  const unauthenticatedRead = await fetch(`${baseUrl}/qloo/status`);
  assert.equal(unauthenticatedRead.status, 401);

  const unauthenticatedMutation = await fetch(`${baseUrl}/qloo/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "test" }),
  });
  assert.equal(unauthenticatedMutation.status, 401);

  const seededSession = await fetch(
    `${baseUrl.replace(/\/api$/, "")}/__test/session`,
  );
  assert.equal(seededSession.status, 204);
  const cookie = seededSession.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  const mutation = (headers: Record<string, string>) =>
    fetch(`${baseUrl}/qloo/test`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        origin: "https://atlas.test",
        ...headers,
      },
      body: JSON.stringify({ query: "test" }),
    });

  assert.equal((await mutation({})).status, 403);
  assert.equal((await mutation({ "x-csrf-token": "wrong-token" })).status, 403);
  assert.equal(
    (
      await mutation({
        "x-csrf-token": "valid-test-csrf",
        origin: "https://attacker.test",
      })
    ).status,
    403,
  );

  const authorized = await mutation({ "x-csrf-token": "valid-test-csrf" });
  assert.equal(authorized.status, 200);
  const responseBody = (await authorized.json()) as { configured?: boolean };
  assert.equal(responseBody.configured, false);
});
