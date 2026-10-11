import { Router, type IRouter } from "express";
import {
  DeleteSavedDiscoveryParams,
  DiscoverCulturalBridgesBody,
  DiscoverCulturalBridgesResponse,
  ListSavedDiscoveriesResponse,
  SaveDiscoveryBody,
  SaveDiscoveryResponse,
} from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { db, savedDiscoveriesTable } from "@workspace/db";
import { rankBridgeCandidates } from "../lib/bridge-ranking";
import {
  compareJointInterests,
  compareSingleInterest,
} from "../lib/qloo/insights";
import { isQlooConfigured } from "../lib/qloo/client";
import { extractExplainability } from "../lib/qloo/explainability";

const router: IRouter = Router();

router.post("/discoveries", async (req, res): Promise<void> => {
  const parsed = DiscoverCulturalBridgesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isQlooConfigured()) {
    res.status(503).json({
      error: "Qloo is not connected. No bridge candidates were generated.",
      setupInstructions:
        "Add QLOO_API_KEY in the Replit project's Secrets, then verify the connection in Settings.",
    });
    return;
  }

  const input = parsed.data;
  try {
    const [resultsA, resultsB, jointResults] = await Promise.all([
      compareSingleInterest(input.interestAId, input.city),
      compareSingleInterest(input.interestBId, input.city),
      compareJointInterests(input.interestAId, input.interestBId, input.city),
    ]);

    const ranked = rankBridgeCandidates({
      interestA: input.interestA,
      interestB: input.interestB,
      resultsA,
      resultsB,
      jointResults,
    });
    const hasExplainability = [
      extractExplainability(resultsA),
      extractExplainability(resultsB),
      extractExplainability(jointResults),
    ].some(Boolean);
    const candidates = ranked.map(({ explainability: _explainability, ...candidate }) => ({
      ...candidate,
      ...(hasExplainability && {
        evidence: [
          ...candidate.evidence,
          {
            source: "Qloo Insights API",
            label: "Explainability metadata",
            value: "Qloo returned explainability metadata for this comparison.",
            kind: "observed_api" as const,
          },
        ],
      }),
    }));

    res.json(
      DiscoverCulturalBridgesResponse.parse({
        source: "qloo_api",
        candidates,
        caveat:
          "Qloo affinity is aggregate cultural evidence. It does not prove that the same individuals share both interests or predict activation success. The bridge score is a derived ranking aid, not a probability.",
        generatedAt: new Date(),
      }),
    );
  } catch (error) {
    req.log.warn(
      { error: error instanceof Error ? error.message : "Unknown Qloo error" },
      "Cultural bridge discovery failed",
    );
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number(error.status)
        : 502;
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error:
        "Qloo did not return usable evidence for this comparison. No sample candidates were substituted.",
    });
  }
});

router.get("/discoveries/saved", async (_req, res): Promise<void> => {
  const discoveries = await db
    .select()
    .from(savedDiscoveriesTable)
    .orderBy(desc(savedDiscoveriesTable.createdAt));
  res.json(ListSavedDiscoveriesResponse.parse(discoveries));
});

router.post("/discoveries/saved", async (req, res): Promise<void> => {
  const parsed = SaveDiscoveryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [discovery] = await db
    .insert(savedDiscoveriesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(SaveDiscoveryResponse.parse(discovery));
});

router.delete("/discoveries/saved/:id", async (req, res): Promise<void> => {
  const parsed = DeleteSavedDiscoveryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [deleted] = await db
    .delete(savedDiscoveriesTable)
    .where(eq(savedDiscoveriesTable.id, parsed.data.id))
    .returning({ id: savedDiscoveriesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Saved discovery not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
