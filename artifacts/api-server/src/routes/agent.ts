import { Router, type IRouter } from "express";
import {
  GenerateActivationPlanWithAgentBody,
  GenerateActivationPlanWithAgentResponse,
} from "@workspace/api-zod";
import {
  createDeterministicActivationPlan,
  runLiveActivationPlanner,
} from "../lib/agent/activation-planner";
import { providerRateLimit } from "../lib/provider-rate-limit";

const router: IRouter = Router();

router.post(
  "/activation-plans/agent",
  providerRateLimit,
  async (req, res): Promise<void> => {
    const parsed = GenerateActivationPlanWithAgentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const result = await runLiveActivationPlanner({
        ...parsed.data.input,
        bridgeId: parsed.data.bridgeId,
        bridgeName: parsed.data.bridgeName,
      });
      if (result.source === "deterministic_fallback") {
        req.log.info(
          { source: result.source, fallbackReason: result.fallbackReason },
          "Returning deterministic activation plan fallback",
        );
      }
      res.json(GenerateActivationPlanWithAgentResponse.parse(result));
    } catch {
      req.log.warn("AI activation planning failed.");
      res.json(
        GenerateActivationPlanWithAgentResponse.parse(
          createDeterministicActivationPlan(
            {
              ...parsed.data.input,
              bridgeId: parsed.data.bridgeId,
              bridgeName: parsed.data.bridgeName,
            },
            "model_or_provider_failure",
          ),
        ),
      );
    }
  },
);

export default router;
