import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const savedDiscoveriesTable = pgTable("saved_discoveries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  city: text("city").notNull(),
  interestA: text("interest_a").notNull(),
  interestB: text("interest_b").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSavedDiscoverySchema = createInsertSchema(savedDiscoveriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSavedDiscovery = z.infer<typeof insertSavedDiscoverySchema>;
export type SavedDiscovery = typeof savedDiscoveriesTable.$inferSelect;
