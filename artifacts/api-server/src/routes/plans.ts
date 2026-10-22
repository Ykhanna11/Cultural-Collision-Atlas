import { Router, type IRouter } from "express";
import {
  DeleteActivationPlanParams,
  ListActivationPlansResponse,
  SaveActivationPlanBody,
  SaveActivationPlanResponse,
} from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { activationPlansTable, db } from "@workspace/db";
import {
  assignWorkspace,
  ownedRecordFilter,
  workspaceFilter,
} from "../lib/workspace-scope";
import { requireAuthentication, requireCsrf } from "../lib/security";

const router: IRouter = Router();

router.get(
  "/activation-plans",
  requireAuthentication,
  async (req, res): Promise<void> => {
    const plans = await db
      .select()
      .from(activationPlansTable)
      .where(
        workspaceFilter(
          activationPlansTable.workspaceId,
          req.session.workspaceId!,
        ),
      )
      .orderBy(desc(activationPlansTable.createdAt));
    res.json(ListActivationPlansResponse.parse(plans));
  },
);

router.post(
  "/activation-plans",
  requireAuthentication,
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = SaveActivationPlanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [plan] = await db
      .insert(activationPlansTable)
      .values(assignWorkspace(parsed.data, req.session.workspaceId!))
      .returning();
    res.status(201).json(SaveActivationPlanResponse.parse(plan));
  },
);

router.delete(
  "/activation-plans/:id",
  requireAuthentication,
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = DeleteActivationPlanParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [deleted] = await db
      .delete(activationPlansTable)
      .where(
        ownedRecordFilter(
          activationPlansTable.id,
          activationPlansTable.workspaceId,
          parsed.data.id,
          req.session.workspaceId!,
        ),
      )
      .returning({ id: activationPlansTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Activation plan not found." });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
