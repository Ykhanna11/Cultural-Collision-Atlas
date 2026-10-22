import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PgDialect, pgTable, serial, uuid } from "drizzle-orm/pg-core";
import {
  assignWorkspace,
  ownedRecordFilter,
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

test("record deletion predicates include both record ID and workspace ID", () => {
  const discovery = dialect.sqlToQuery(
    ownedRecordFilter(
      discoveriesTable.id,
      discoveriesTable.workspaceId,
      17,
      "workspace-a",
    ),
  );
  assert.match(discovery.sql, /saved_discoveries.*id/);
  assert.match(discovery.sql, /saved_discoveries.*workspace_id/);
  assert.deepEqual(discovery.params, [17, "workspace-a"]);

  const plan = dialect.sqlToQuery(
    ownedRecordFilter(plansTable.id, plansTable.workspaceId, 23, "workspace-b"),
  );
  assert.match(plan.sql, /activation_plans.*id/);
  assert.match(plan.sql, /activation_plans.*workspace_id/);
  assert.deepEqual(plan.params, [23, "workspace-b"]);
});

test("list filters and inserted records are bound to the authorized workspace", () => {
  const filter = dialect.sqlToQuery(
    workspaceFilter(discoveriesTable.workspaceId, "workspace-private"),
  );
  assert.match(filter.sql, /saved_discoveries.*workspace_id/);
  assert.deepEqual(filter.params, ["workspace-private"]);

  assert.deepEqual(assignWorkspace({ title: "Bridge" }, "workspace-private"), {
    title: "Bridge",
    workspaceId: "workspace-private",
  });
});

test("migration preserves legacy rows as unowned and quarantined", async () => {
  const migration = await readFile(
    new URL(
      "../../../../lib/db/migrations/0001_auth_workspaces.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN workspace_id uuid REFERENCES workspaces/);
  assert.doesNotMatch(
    migration,
    /UPDATE\s+(saved_discoveries|activation_plans)/i,
  );
  assert.match(migration, /CREATE TABLE sessions/);
});
