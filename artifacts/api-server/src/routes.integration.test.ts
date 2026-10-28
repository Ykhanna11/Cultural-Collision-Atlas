import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
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
      DATABASE_URL: databaseUrl,
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

test("the API starts without OAuth configuration and serves public feature routes", async () => {
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);

  const qlooStatus = await fetch(`${baseUrl}/qloo/status`);
  assert.equal(qlooStatus.status, 200);
  assert.equal(qlooStatus.headers.has("set-cookie"), false);

  const publicRequests: Array<{
    method: string;
    path: string;
    body: unknown;
    expectedStatus: number;
  }> = [
    { method: "POST", path: "/qloo/test", body: { query: "test" }, expectedStatus: 200 },
    { method: "POST", path: "/discoveries", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/discoveries/saved", body: {}, expectedStatus: 400 },
    { method: "DELETE", path: "/discoveries/saved/not-an-id", body: null, expectedStatus: 400 },
    { method: "POST", path: "/activation-plans", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/activation-plans/agent", body: {}, expectedStatus: 400 },
    { method: "DELETE", path: "/activation-plans/not-an-id", body: null, expectedStatus: 400 },
    { method: "POST", path: "/qloo/entities/search", body: {}, expectedStatus: 400 },
    { method: "POST", path: "/opportunities/heatmap", body: {}, expectedStatus: 400 },
  ];

  for (const { method, path, body, expectedStatus } of publicRequests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, expectedStatus, `${method} ${path}`);
    assert.equal(response.status === 401 || response.status === 403, false);
  }

  const removedAuthEndpoint = await fetch(`${baseUrl}/auth/session`);
  assert.equal(removedAuthEndpoint.status, 404);
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
  const bundle = await scriptResponse.text();
  assert.doesNotMatch(bundle, /Continue with Google|\/api\/auth\/login|Checking sign-in/);

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
