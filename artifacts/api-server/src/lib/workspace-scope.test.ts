import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PgDialect, pgTable, serial, uuid } from "drizzle-orm/pg-core";
import {
  assignWorkspace,
  ownedRecordFilter,
  PUBLIC_DEMO_WORKSPACE_ID,
  workspaceFilter,
} from "./workspace-scope.ts";

const dialect = new PgDialect();
const discoveriesTable = pgTable("saved_discoveries", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id"),
});
const plansTable = pgTable("activation_plans", {
  id: serial("id").primaryKey(),
  workspaceId: uuid("workspace_id"),
});

test("saved discoveries and activation plans share one isolated public-demo scope", () => {
  assert.match(PUBLIC_DEMO_WORKSPACE_ID, /^[0-9a-f-]{36}$/);

  const discovery = dialect.sqlToQuery(
    ownedRecordFilter(
      discoveriesTable.id,
      discoveriesTable.workspaceId,
      17,
      PUBLIC_DEMO_WORKSPACE_ID,
    ),
  );
  assert.match(discovery.sql, /saved_discoveries.*id/);
  assert.match(discovery.sql, /saved_discoveries.*workspace_id/);
  assert.deepEqual(discovery.params, [17, PUBLIC_DEMO_WORKSPACE_ID]);

  const plan = dialect.sqlToQuery(
    ownedRecordFilter(
      plansTable.id,
      plansTable.workspaceId,
      23,
      PUBLIC_DEMO_WORKSPACE_ID,
    ),
  );
  assert.match(plan.sql, /activation_plans.*id/);
  assert.match(plan.sql, /activation_plans.*workspace_id/);
  assert.deepEqual(plan.params, [23, PUBLIC_DEMO_WORKSPACE_ID]);

  assert.deepEqual(
    assignWorkspace({ title: "Bridge" }, PUBLIC_DEMO_WORKSPACE_ID),
    { title: "Bridge", workspaceId: PUBLIC_DEMO_WORKSPACE_ID },
  );
});

test("workspace list filters exclude legacy and unrelated private records", () => {
  for (const [table, column] of [
    ["saved_discoveries", discoveriesTable.workspaceId],
    ["activation_plans", plansTable.workspaceId],
  ] as const) {
    const filter = dialect.sqlToQuery(
      workspaceFilter(column, PUBLIC_DEMO_WORKSPACE_ID),
    );
    assert.match(filter.sql, new RegExp(`${table}.*workspace_id`));
    assert.deepEqual(filter.params, [PUBLIC_DEMO_WORKSPACE_ID]);
  }
});

test("authentication migration remains additive and preserves existing data", async () => {
  const migration = await readFile(
    new URL(
      "../../../../lib/db/migrations/0001_auth_workspaces.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN workspace_id uuid REFERENCES workspaces/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE FROM|DROP TABLE|DROP COLUMN)\b/i);
  assert.match(migration, /CREATE TABLE sessions/);
});
