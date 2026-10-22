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
  DEFAULT_QLOO_RECOMMENDATION_TYPE,
  compareJointInterests,
  compareSingleInterest,
  isQlooRecommendationType,
  requestTasteAnalysis,
} from "../lib/qloo/insights";
import { isQlooConfigured } from "../lib/qloo/client";
import { loadTasteAnalysis } from "../lib/qloo/taste-analysis";
import {
  isQlooEntityId,
  isVerifiedQlooCityLocality,
} from "../lib/qloo/entities";

const router: IRouter = Router();

router.post("/discoveries", async (req, res): Promise<void> => {
  const parsed = DiscoverCulturalBridgesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const recommendationType =
    parsed.data.recommendationType ?? DEFAULT_QLOO_RECOMMENDATION_TYPE;
  if (!isQlooRecommendationType(recommendationType)) {
    res.status(400).json({
      error: "Unsupported Qloo recommendation category.",
    });
    return;
  }
  if (!isQlooConfigured()) {
    res.status(503).json({
      error: "Qloo is not connected. No bridge candidates were generated.",
      setupInstructions:
        "Configure QLOO_API_KEY in the server environment, then verify the connection in Settings.",
    });
    return;
  }

  const input = parsed.data;
  try {
    if (input.cityEntityId) {
      if (
        !isQlooEntityId(input.cityEntityId) ||
        !(await isVerifiedQlooCityLocality(input.cityEntityId))
      ) {
        res.status(400).json({
          error: "Select a valid Qloo city locality before discovering.",
        });
        return;
      }
    }

    const [resultsA, resultsB, jointResults, tasteResults] = await Promise.all([
      compareSingleInterest(
        input.interestAId,
        input.city,
        recommendationType,
        input.cityEntityId,
      ),
      compareSingleInterest(
        input.interestBId,
        input.city,
        recommendationType,
        input.cityEntityId,
      ),
      compareJointInterests(
        input.interestAId,
        input.interestBId,
        input.city,
        recommendationType,
        input.cityEntityId,
      ),
      loadTasteAnalysis(
        [input.interestAId, input.interestBId],
        requestTasteAnalysis,
      ),
    ]);
    for (const [index, result] of tasteResults.entries()) {
      if ("error" in result) {
        req.log.warn(
          {
            interest: index === 0 ? "A" : "B",
            status:
              typeof result.error === "object" &&
              result.error !== null &&
              "status" in result.error
                ? result.error.status
                : undefined,
          },
          "Optional Qloo Taste Analysis request failed",
        );
      }
    }

    const ranked = rankBridgeCandidates({
      interestA: input.interestA,
      interestAId: input.interestAId,
      interestB: input.interestB,
      interestBId: input.interestBId,
      recommendationType,
      selectedCityEntityId: input.cityEntityId,
      tasteAnalysis: {
        interestA: tasteResults[0]?.payload,
        interestB: tasteResults[1]?.payload,
      },
      resultsA,
      resultsB,
      jointResults,
    });
    const hasTwoSidedCandidates = ranked.some(
      (candidate) => candidate.confidence === "high",
    );
    res.json(
      DiscoverCulturalBridgesResponse.parse({
        source: "qloo_api",
        candidates: ranked,
        caveat:
          "Qloo's joint-interest results and any matching single-interest results are aggregate recommendation evidence. Candidate confidence indicates whether per-result explainability explicitly returned positive contributions from both selected entities, one, or neither; Qloo may omit lower-impact contributions. This does not prove that the same individuals share both interests or predict activation success. The score is derived only from returned Qloo affinity or affinity rank, not input attribution or probability." +
          " Taste Analysis overlap is supplementary exact-tag evidence, not entity-level input attribution; unavailable or incomplete tags are not treated as negative matches." +
          (recommendationType === "urn:entity:place"
            ? input.cityEntityId
              ? " Place locality status compares the returned city entity ID with the selected Qloo city ID using a city-proper interpretation; it is geographic evidence, not cultural relevance evidence."
              : " Place locality status is unavailable because this request did not select a canonical Qloo city ID; it is geographic evidence, not cultural relevance evidence."
            : "") +
          (hasTwoSidedCandidates
            ? ""
            : " No returned candidate has explicit positive per-result attribution from both selected entities; one-sided or unavailable-attribution results should be treated as exploratory, not substantiated two-interest bridges."),
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
