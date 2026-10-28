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
  getPublicDemoWorkspaceId,
  ownedRecordFilter,
  workspaceFilter,
} from "../lib/workspace-scope";
import { publicMutationRateLimit } from "../lib/public-mutation-rate-limit";

const router: IRouter = Router();

router.get(
  "/activation-plans",
  async (_req, res): Promise<void> => {
    const workspaceId = await getPublicDemoWorkspaceId();
    const plans = await db
      .select()
      .from(activationPlansTable)
      .where(
        workspaceFilter(activationPlansTable.workspaceId, workspaceId),
      )
      .orderBy(desc(activationPlansTable.createdAt));
    res.json(ListActivationPlansResponse.parse(plans));
  },
);

router.post(
  "/activation-plans",
  publicMutationRateLimit,
  async (req, res): Promise<void> => {
    const parsed = SaveActivationPlanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const workspaceId = await getPublicDemoWorkspaceId();
    const [plan] = await db
      .insert(activationPlansTable)
      .values(assignWorkspace(parsed.data, workspaceId))
      .returning();
    res.status(201).json(SaveActivationPlanResponse.parse(plan));
  },
);

router.delete(
  "/activation-plans/:id",
  publicMutationRateLimit,
  async (req, res): Promise<void> => {
    const parsed = DeleteActivationPlanParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const workspaceId = await getPublicDemoWorkspaceId();
    const [deleted] = await db
      .delete(activationPlansTable)
      .where(
        ownedRecordFilter(
          activationPlansTable.id,
          activationPlansTable.workspaceId,
          parsed.data.id,
          workspaceId,
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
