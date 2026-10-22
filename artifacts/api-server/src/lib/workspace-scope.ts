import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

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
