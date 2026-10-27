import { Router, type IRouter } from "express";
import {
  GenerateActivationPlanWithAgentBody,
  GenerateActivationPlanWithAgentResponse,
} from "@workspace/api-zod";
import { isQlooConfigured } from "../lib/qloo/client";
import {
  ActivationPlannerError,
  runLiveActivationPlanner,
} from "../lib/agent/activation-planner";
import { providerRateLimit } from "../lib/provider-rate-limit";
import { requireAuthentication, requireCsrf } from "../lib/security";

const router: IRouter = Router();

router.post(
  "/activation-plans/agent",
  requireAuthentication,
  requireCsrf,
  providerRateLimit,
  async (req, res): Promise<void> => {
    const parsed = GenerateActivationPlanWithAgentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!process.env.OPENAI_API_KEY?.trim() || !process.env.OPENAI_MODEL?.trim()) {
      res.status(503).json({
        error: "AI planning is unavailable. Configure OPENAI_API_KEY and OPENAI_MODEL.",
      });
      return;
    }
    if (!isQlooConfigured()) {
      res.status(503).json({
        error: "AI planning is unavailable because Qloo is not configured.",
      });
      return;
    }

    try {
      const result = await runLiveActivationPlanner({
        ...parsed.data.input,
        bridgeId: parsed.data.bridgeId,
        bridgeName: parsed.data.bridgeName,
      });
      res.json(GenerateActivationPlanWithAgentResponse.parse(result));
    } catch (error) {
      if (error instanceof ActivationPlannerError) {
        const status =
          error.reason === "invalid_tool_call" ||
          error.reason === "invalid_model_output"
            ? 502
            : error.reason === "budget_exhausted"
              ? 429
              : error.reason === "insufficient_evidence"
                ? 422
                : 502;
        req.log.warn(
          { reason: error.reason },
          "AI activation planning stopped safely",
        );
        res.status(status).json({ error: error.message });
        return;
      }
      req.log.warn("AI activation planning failed.");
      res.status(502).json({
        error: "AI activation planning failed. Use the deterministic planner instead.",
      });
    }
  },
);

export default router;
