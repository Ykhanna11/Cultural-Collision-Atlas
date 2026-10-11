import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const activationPlansTable = pgTable("activation_plans", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  city: text("city").notNull(),
  interestA: text("interest_a").notNull(),
  interestB: text("interest_b").notNull(),
  bridgeName: text("bridge_name").notNull(),
  objective: text("objective").notNull(),
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivationPlanSchema = createInsertSchema(activationPlansTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivationPlan = z.infer<typeof insertActivationPlanSchema>;
export type ActivationPlan = typeof activationPlansTable.$inferSelect;
