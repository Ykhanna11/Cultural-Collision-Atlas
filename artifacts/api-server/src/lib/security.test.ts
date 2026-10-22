import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import session from "express-session";
import { requireAuthentication, requireCsrf } from "./security.ts";

let server: Server;
let baseUrl: string;
let providerCalls = 0;

before(async () => {
  process.env.AUTH_BASE_URL = "https://atlas.test";
  process.env.AUTH_ALLOWED_EMAILS = "allowed@example.test";

  const app = express();
  app.use(
    session({
      secret: randomBytes(32).toString("base64url"),
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.get("/seed-session", (req, res) => {
    req.session.userId = "user-a";
    req.session.workspaceId = "workspace-a";
    req.session.email = "allowed@example.test";
    req.session.csrfToken = "test-csrf-token";
    res.sendStatus(204);
  });
  app.use(requireAuthentication);
  app.use(requireCsrf);
  app.get("/protected", (_req, res) => res.sendStatus(204));
  app.post("/qloo/discoveries", (_req, res) => {
    providerCalls += 1;
    res.sendStatus(204);
  });

  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

test("unauthenticated requests are rejected before a provider operation", async () => {
  const protectedResponse = await fetch(`${baseUrl}/protected`);
  assert.equal(protectedResponse.status, 401);

  const providerResponse = await fetch(`${baseUrl}/qloo/discoveries`, {
    method: "POST",
    headers: {
      origin: "https://atlas.test",
      "x-csrf-token": "test-csrf-token",
    },
  });
  assert.equal(providerResponse.status, 401);
  assert.equal(providerCalls, 0);
});

test("authorized requests require a matching session CSRF token and origin", async () => {
  const seedResponse = await fetch(`${baseUrl}/seed-session`);
  const cookie = seedResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  const protectedResponse = await fetch(`${baseUrl}/protected`, {
    headers: { cookie },
  });
  assert.equal(protectedResponse.status, 204);

  const badOrigin = await fetch(`${baseUrl}/qloo/discoveries`, {
    method: "POST",
    headers: {
      cookie,
      origin: "https://attacker.test",
      "x-csrf-token": "test-csrf-token",
    },
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(providerCalls, 0);

  const badToken = await fetch(`${baseUrl}/qloo/discoveries`, {
    method: "POST",
    headers: {
      cookie,
      origin: "https://atlas.test",
      "x-csrf-token": "wrong-token",
    },
  });
  assert.equal(badToken.status, 403);
  assert.equal(providerCalls, 0);

  const authorized = await fetch(`${baseUrl}/qloo/discoveries`, {
    method: "POST",
    headers: {
      cookie,
      origin: "https://atlas.test",
      "x-csrf-token": "test-csrf-token",
    },
  });
  assert.equal(authorized.status, 204);
  assert.equal(providerCalls, 1);
});

test("removing an email from the allowlist invalidates its existing session", async () => {
  const seedResponse = await fetch(`${baseUrl}/seed-session`);
  const cookie = seedResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  process.env.AUTH_ALLOWED_EMAILS = "other@example.test";
  try {
    const response = await fetch(`${baseUrl}/protected`, {
      headers: { cookie },
    });
    assert.equal(response.status, 401);
  } finally {
    process.env.AUTH_ALLOWED_EMAILS = "allowed@example.test";
  }
});

test("an empty email allowlist rejects an existing authenticated session", async () => {
  const seedResponse = await fetch(`${baseUrl}/seed-session`);
  const cookie = seedResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  process.env.AUTH_ALLOWED_EMAILS = " , ";
  try {
    const response = await fetch(`${baseUrl}/protected`, {
      headers: { cookie },
    });
    assert.equal(response.status, 401);
  } finally {
    process.env.AUTH_ALLOWED_EMAILS = "allowed@example.test";
  }
});
