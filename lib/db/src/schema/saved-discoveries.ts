import { createInsertSchema } from "drizzle-zod";
import {
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { workspacesTable } from "./identity";

export const savedDiscoveriesTable = pgTable(
  "saved_discoveries",
  {
    id: serial("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspacesTable.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    city: text("city").notNull(),
    interestA: text("interest_a").notNull(),
    interestB: text("interest_b").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("saved_discoveries_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const insertSavedDiscoverySchema = createInsertSchema(
  savedDiscoveriesTable,
).omit({
  id: true,
  workspaceId: true,
  createdAt: true,
});
export type InsertSavedDiscovery = z.infer<typeof insertSavedDiscoverySchema>;
export type SavedDiscovery = typeof savedDiscoveriesTable.$inferSelect;
