import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, usersTable, workspacesTable } from "@workspace/db";

export const PUBLIC_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const PUBLIC_DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

let publicDemoWorkspacePromise: Promise<string> | undefined;

async function createPublicDemoWorkspace(): Promise<string> {
  await db.transaction(async (transaction) => {
    await transaction
      .insert(usersTable)
      .values({
        id: PUBLIC_DEMO_USER_ID,
        oidcSubject: "cultural-collision-atlas-public-demo",
        email: "public-demo@cultural-collision-atlas.invalid",
      })
      .onConflictDoNothing();

    const [user] = await transaction
      .select({
        id: usersTable.id,
        oidcSubject: usersTable.oidcSubject,
      })
      .from(usersTable)
      .where(eq(usersTable.id, PUBLIC_DEMO_USER_ID))
      .limit(1);
    if (user?.oidcSubject !== "cultural-collision-atlas-public-demo") {
      throw new Error("Public demo identity conflicts with existing data.");
    }

    await transaction
      .insert(workspacesTable)
      .values({
        id: PUBLIC_DEMO_WORKSPACE_ID,
        ownerUserId: PUBLIC_DEMO_USER_ID,
      })
      .onConflictDoNothing();

    const [workspace] = await transaction
      .select({
        id: workspacesTable.id,
        ownerUserId: workspacesTable.ownerUserId,
      })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, PUBLIC_DEMO_WORKSPACE_ID))
      .limit(1);
    if (workspace?.ownerUserId !== PUBLIC_DEMO_USER_ID) {
      throw new Error("Public demo workspace conflicts with existing data.");
    }
  });

  return PUBLIC_DEMO_WORKSPACE_ID;
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
