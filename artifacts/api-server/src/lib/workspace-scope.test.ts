import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PgDialect, pgTable, serial, uuid } from "drizzle-orm/pg-core";
import {
  assignWorkspace,
  getPublicDemoWorkspaceDatabaseDiagnostic,
  initializePublicDemoWorkspace,
  ownedRecordFilter,
  PUBLIC_DEMO_USER_ID,
  PUBLIC_DEMO_WORKSPACE_ID,
  type PublicDemoWorkspaceStore,
  type PublicDemoWorkspaceTransaction,
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

type DemoUser = { id: string; oidcSubject: string; email: string };
type DemoWorkspace = { id: string; ownerUserId: string };

class MemoryWorkspaceStore implements PublicDemoWorkspaceStore {
  users = new Map<string, DemoUser>();
  workspaces = new Map<string, DemoWorkspace>();
  failWorkspaceInsert = false;

  async transaction<T>(
    callback: (transaction: PublicDemoWorkspaceTransaction) => Promise<T>,
  ): Promise<T> {
    const usersBefore = new Map(this.users);
    const workspacesBefore = new Map(this.workspaces);
    const transaction: PublicDemoWorkspaceTransaction = {
      insertUserIfAbsent: async (user) => {
        const duplicate = [...this.users.values()].some((existing) =>
          existing.id === user.id ||
          existing.oidcSubject === user.oidcSubject ||
          existing.email === user.email,
        );
        if (!duplicate) this.users.set(user.id, user);
      },
      findUser: async (id) => {
        const user = this.users.get(id);
        return user && { id: user.id, oidcSubject: user.oidcSubject };
      },
      insertWorkspaceIfAbsent: async (workspace) => {
        if (this.failWorkspaceInsert) throw new Error("mock database failure");
        const duplicate = [...this.workspaces.values()].some((existing) =>
          existing.id === workspace.id ||
          existing.ownerUserId === workspace.ownerUserId,
        );
        if (!duplicate) this.workspaces.set(workspace.id, workspace);
      },
      findWorkspace: async (id) => {
        const workspace = this.workspaces.get(id);
        return workspace && {
          id: workspace.id,
          ownerUserId: workspace.ownerUserId,
        };
      },
    };

    try {
      return await callback(transaction);
    } catch (error) {
      this.users = usersBefore;
      this.workspaces = workspacesBefore;
      throw error;
    }
  }
}

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

test("first and repeated initialization create one stable demo user and workspace", async () => {
  const store = new MemoryWorkspaceStore();

  assert.equal(await initializePublicDemoWorkspace(store), PUBLIC_DEMO_WORKSPACE_ID);
  assert.equal(await initializePublicDemoWorkspace(store), PUBLIC_DEMO_WORKSPACE_ID);
  assert.equal(store.users.size, 1);
  assert.equal(store.workspaces.size, 1);
  assert.equal(store.users.get(PUBLIC_DEMO_USER_ID)?.oidcSubject, "cultural-collision-atlas-public-demo");
  assert.equal(store.workspaces.get(PUBLIC_DEMO_WORKSPACE_ID)?.ownerUserId, PUBLIC_DEMO_USER_ID);
});

test("initialization adopts the existing matching demo identity and workspace", async () => {
  const store = new MemoryWorkspaceStore();
  store.users.set(PUBLIC_DEMO_USER_ID, {
    id: PUBLIC_DEMO_USER_ID,
    oidcSubject: "cultural-collision-atlas-public-demo",
    email: "public-demo@cultural-collision-atlas.invalid",
  });
  store.workspaces.set(PUBLIC_DEMO_WORKSPACE_ID, {
    id: PUBLIC_DEMO_WORKSPACE_ID,
    ownerUserId: PUBLIC_DEMO_USER_ID,
  });

  assert.equal(await initializePublicDemoWorkspace(store), PUBLIC_DEMO_WORKSPACE_ID);
  assert.equal(store.users.size, 1);
  assert.equal(store.workspaces.size, 1);
});

test("identity and workspace conflicts fail without changing existing rows", async () => {
  const identityStore = new MemoryWorkspaceStore();
  identityStore.users.set(PUBLIC_DEMO_USER_ID, {
    id: PUBLIC_DEMO_USER_ID,
    oidcSubject: "different-subject",
    email: "other@invalid.example",
  });
  await assert.rejects(
    initializePublicDemoWorkspace(identityStore),
    /identity conflicts with existing data/,
  );
  assert.equal(identityStore.users.get(PUBLIC_DEMO_USER_ID)?.oidcSubject, "different-subject");
  assert.equal(identityStore.workspaces.size, 0);

  const workspaceStore = new MemoryWorkspaceStore();
  workspaceStore.users.set(PUBLIC_DEMO_USER_ID, {
    id: PUBLIC_DEMO_USER_ID,
    oidcSubject: "cultural-collision-atlas-public-demo",
    email: "public-demo@cultural-collision-atlas.invalid",
  });
  workspaceStore.workspaces.set(PUBLIC_DEMO_WORKSPACE_ID, {
    id: PUBLIC_DEMO_WORKSPACE_ID,
    ownerUserId: "00000000-0000-4000-8000-000000000099",
  });
  await assert.rejects(
    initializePublicDemoWorkspace(workspaceStore),
    /workspace conflicts with existing data/,
  );
  assert.equal(workspaceStore.workspaces.get(PUBLIC_DEMO_WORKSPACE_ID)?.ownerUserId, "00000000-0000-4000-8000-000000000099");
});

test("transaction failure rolls back a partially inserted demo identity", async () => {
  const store = new MemoryWorkspaceStore();
  store.failWorkspaceInsert = true;

  await assert.rejects(
    initializePublicDemoWorkspace(store),
    /mock database failure/,
  );
  assert.equal(store.users.size, 0);
  assert.equal(store.workspaces.size, 0);
});

test("database diagnostics retain PostgreSQL context without connection fields", () => {
  const diagnostic = getPublicDemoWorkspaceDatabaseDiagnostic({
    code: "42P01",
    message: 'relation "users" does not exist',
    schema: "public",
    table: "users",
    cause: Object.assign(new Error("underlying database cause"), { code: "42P01" }),
  });

  assert.deepEqual(diagnostic, {
    code: "42P01",
    message: 'relation "users" does not exist',
    schema: "public",
    table: "users",
    cause: { code: "42P01", message: "underlying database cause" },
  });
  assert.equal("connectionString" in diagnostic, false);
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
