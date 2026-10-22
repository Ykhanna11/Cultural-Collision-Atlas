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

export const activationPlansTable = pgTable(
  "activation_plans",
  {
    id: serial("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspacesTable.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    city: text("city").notNull(),
    interestA: text("interest_a").notNull(),
    interestB: text("interest_b").notNull(),
    bridgeName: text("bridge_name").notNull(),
    objective: text("objective").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activation_plans_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const insertActivationPlanSchema = createInsertSchema(
  activationPlansTable,
).omit({
  id: true,
  workspaceId: true,
  createdAt: true,
});
export type InsertActivationPlan = z.infer<typeof insertActivationPlanSchema>;
export type ActivationPlan = typeof activationPlansTable.$inferSelect;
