import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const databaseUrl = "postgres://synthetic_test_user:synthetic_test_password@127.0.0.1:1/staging_test";
let apiProcess: ChildProcess;
let baseUrl: string;
let appUrl: string;

async function getUnusedPort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

before(async () => {
  const port = await getUnusedPort();
  apiProcess = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      PATH: process.env.PATH,
      AUTH_BASE_URL: "https://atlas.example.test",
      AUTH_ALLOWED_EMAILS: "staging-user@example.test",
      AUTH_SESSION_SECRET: randomBytes(32).toString("base64url"),
      DATABASE_URL: databaseUrl,
      GOOGLE_OIDC_CLIENT_ID: "test-client-id",
      GOOGLE_OIDC_CLIENT_SECRET: "test-client-secret",
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: "ignore",
  });
  baseUrl = `http://127.0.0.1:${port}/api`;
  appUrl = baseUrl.slice(0, -"/api".length);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (apiProcess.exitCode !== null || apiProcess.signalCode !== null) {
      throw new Error("API subprocess exited before becoming ready.");
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("API subprocess did not become ready.");
});

after(async () => {
  if (
    apiProcess &&
    apiProcess.exitCode === null &&
    apiProcess.signalCode === null
  ) {
    apiProcess.kill("SIGTERM");
    await once(apiProcess, "exit");
  }
});

test("the real API keeps health public and rejects protected routes unauthenticated", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);

  const protectedRequests: Array<{
    method: string;
    path: string;
  }> = [
    { method: "GET", path: "/atlas/overview" },
    { method: "GET", path: "/qloo/status" },
    { method: "POST", path: "/discoveries" },
    { method: "GET", path: "/discoveries/saved" },
    { method: "POST", path: "/discoveries/saved" },
    { method: "DELETE", path: "/discoveries/saved/1" },
    { method: "GET", path: "/activation-plans" },
    { method: "POST", path: "/activation-plans" },
    { method: "POST", path: "/activation-plans/agent" },
    { method: "DELETE", path: "/activation-plans/1" },
    { method: "POST", path: "/qloo/test" },
    { method: "POST", path: "/qloo/entities/search" },
    { method: "POST", path: "/opportunities/heatmap" },
    { method: "POST", path: "/auth/logout" },
  ];

  for (const { method, path } of protectedRequests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});

test("production serves frontend assets and falls back only for frontend routes", async () => {
  const indexResponse = await fetch(appUrl, {
    headers: { accept: "text/html" },
  });
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();
  const scriptPath = indexHtml.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(scriptPath);

  const scriptResponse = await fetch(new URL(scriptPath, appUrl));
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type") ?? "", /javascript/);

  const spaResponse = await fetch(`${appUrl}/saved-discoveries`, {
    headers: { accept: "text/html" },
  });
  assert.equal(spaResponse.status, 200);
  assert.equal(await spaResponse.text(), indexHtml);

  const unknownApiResponse = await fetch(`${baseUrl}/unknown-route`, {
    headers: { accept: "text/html" },
  });
  assert.equal(unknownApiResponse.status, 404);
  assert.match(
    unknownApiResponse.headers.get("content-type") ?? "",
    /application\/json/,
  );
  assert.doesNotMatch(await unknownApiResponse.text(), /<html/i);

  const missingAssetResponse = await fetch(`${appUrl}/assets/not-found.js`);
  assert.equal(missingAssetResponse.status, 404);
});

test("the real API refuses to start without authentication configuration", async () => {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    PORT: "1",
  };
  delete env.AUTH_BASE_URL;
  delete env.AUTH_ALLOWED_EMAILS;
  delete env.AUTH_SESSION_SECRET;
  delete env.GOOGLE_OIDC_CLIENT_ID;
  delete env.GOOGLE_OIDC_CLIENT_SECRET;

  const child = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [exitCode] = await once(child, "exit");
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /AUTH_BASE_URL/);
});
