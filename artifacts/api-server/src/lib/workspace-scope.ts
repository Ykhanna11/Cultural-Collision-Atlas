import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, usersTable, workspacesTable } from "@workspace/db";
import { logger } from "./logger";

export const PUBLIC_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const PUBLIC_DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

let publicDemoWorkspacePromise: Promise<string> | undefined;
type DrizzleWorkspaceTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export interface PublicDemoWorkspaceTransaction {
  insertUserIfAbsent(user: {
    id: string;
    oidcSubject: string;
    email: string;
  }): Promise<void>;
  findUser(id: string): Promise<{ id: string; oidcSubject: string } | undefined>;
  insertWorkspaceIfAbsent(workspace: {
    id: string;
    ownerUserId: string;
  }): Promise<void>;
  findWorkspace(
    id: string,
  ): Promise<{ id: string; ownerUserId: string } | undefined>;
}

export interface PublicDemoWorkspaceStore {
  transaction<T>(
    callback: (transaction: PublicDemoWorkspaceTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface PublicDemoWorkspaceDatabaseDiagnostic {
  code?: string;
  message: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  detail?: string;
  hint?: string;
  cause?: { code?: string; message: string };
}

function readErrorField(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

function safeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[connection string redacted]")
    .replace(/\b(password|passwd|pwd)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/password authentication failed for user ["'][^"']+["']/gi,
      "password authentication failed for user [redacted]");
}

export function getPublicDemoWorkspaceDatabaseDiagnostic(
  error: unknown,
): PublicDemoWorkspaceDatabaseDiagnostic {
  const cause = readErrorField(error, "cause");
  const message = safeDiagnosticText(readErrorField(error, "message")) ??
    "Unknown database initialization error.";
  const causeMessage = safeDiagnosticText(readErrorField(cause, "message"));
  const causeCode = safeDiagnosticText(readErrorField(cause, "code"));
  return {
    ...(safeDiagnosticText(readErrorField(error, "code")) && {
      code: safeDiagnosticText(readErrorField(error, "code")),
    }),
    message,
    ...(safeDiagnosticText(readErrorField(error, "schema")) && {
      schema: safeDiagnosticText(readErrorField(error, "schema")),
    }),
    ...(safeDiagnosticText(readErrorField(error, "table")) && {
      table: safeDiagnosticText(readErrorField(error, "table")),
    }),
    ...(safeDiagnosticText(readErrorField(error, "column")) && {
      column: safeDiagnosticText(readErrorField(error, "column")),
    }),
    ...(safeDiagnosticText(readErrorField(error, "constraint")) && {
      constraint: safeDiagnosticText(readErrorField(error, "constraint")),
    }),
    ...(safeDiagnosticText(readErrorField(error, "detail")) && {
      detail: safeDiagnosticText(readErrorField(error, "detail")),
    }),
    ...(safeDiagnosticText(readErrorField(error, "hint")) && {
      hint: safeDiagnosticText(readErrorField(error, "hint")),
    }),
    ...(causeMessage && {
      cause: {
        ...(causeCode && { code: causeCode }),
        message: causeMessage,
      },
    }),
  };
}

export class PublicDemoWorkspaceInitializationError extends Error {
  constructor() {
    super("Public demo workspace is temporarily unavailable.");
    this.name = "PublicDemoWorkspaceInitializationError";
  }
}

export async function initializePublicDemoWorkspace(
  store: PublicDemoWorkspaceStore,
): Promise<string> {
  return store.transaction(async (transaction) => {
    await transaction.insertUserIfAbsent({
      id: PUBLIC_DEMO_USER_ID,
      oidcSubject: "cultural-collision-atlas-public-demo",
      email: "public-demo@cultural-collision-atlas.invalid",
    });

    const user = await transaction.findUser(PUBLIC_DEMO_USER_ID);
    if (user?.oidcSubject !== "cultural-collision-atlas-public-demo") {
      throw new Error("Public demo identity conflicts with existing data.");
    }

    await transaction.insertWorkspaceIfAbsent({
      id: PUBLIC_DEMO_WORKSPACE_ID,
      ownerUserId: PUBLIC_DEMO_USER_ID,
    });

    const workspace = await transaction.findWorkspace(PUBLIC_DEMO_WORKSPACE_ID);
    if (workspace?.ownerUserId !== PUBLIC_DEMO_USER_ID) {
      throw new Error("Public demo workspace conflicts with existing data.");
    }

    return PUBLIC_DEMO_WORKSPACE_ID;
  });
}

async function createPublicDemoWorkspace(): Promise<string> {
  try {
    return await initializePublicDemoWorkspace({
      transaction: (callback) => db.transaction(async (transaction: DrizzleWorkspaceTransaction) => callback({
        insertUserIfAbsent: async (user) => {
          await transaction
            .insert(usersTable)
            .values(user)
            .onConflictDoNothing();
        },
        findUser: async (id) => {
          const [user] = await transaction
            .select({
              id: usersTable.id,
              oidcSubject: usersTable.oidcSubject,
            })
            .from(usersTable)
            .where(eq(usersTable.id, id))
            .limit(1);
          return user;
        },
        insertWorkspaceIfAbsent: async (workspace) => {
          await transaction
            .insert(workspacesTable)
            .values(workspace)
            .onConflictDoNothing();
        },
        findWorkspace: async (id) => {
          const [workspace] = await transaction
            .select({
              id: workspacesTable.id,
              ownerUserId: workspacesTable.ownerUserId,
            })
            .from(workspacesTable)
            .where(eq(workspacesTable.id, id))
            .limit(1);
          return workspace;
        },
      })),
    });
  } catch (error) {
    logger.error(
      { databaseError: getPublicDemoWorkspaceDatabaseDiagnostic(error) },
      "Public demo workspace initialization failed",
    );
    throw new PublicDemoWorkspaceInitializationError();
  }
}

export async function getPublicDemoWorkspaceId(): Promise<string> {
  publicDemoWorkspacePromise ??= createPublicDemoWorkspace();
  try {
    return await publicDemoWorkspacePromise;
  } catch (error) {
    publicDemoWorkspacePromise = undefined;
    throw error;
  }
}

export function workspaceFilter(
  workspaceColumn: AnyPgColumn,
  workspaceId: string,
): SQL {
  return eq(workspaceColumn, workspaceId);
}

export function ownedRecordFilter(
  recordIdColumn: AnyPgColumn,
  workspaceColumn: AnyPgColumn,
  recordId: number,
  workspaceId: string,
): SQL {
  return and(
    eq(recordIdColumn, recordId),
    workspaceFilter(workspaceColumn, workspaceId),
  )!;
}

export function assignWorkspace<T extends object>(
  record: T,
  workspaceId: string,
): T & { workspaceId: string } {
  return { ...record, workspaceId };
}
