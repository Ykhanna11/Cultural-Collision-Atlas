import { Router, type IRouter } from "express";
import {
  GetAtlasOverviewResponse,
  GetOpportunityHeatmapBody,
  GetOpportunityHeatmapResponse,
  GetQlooStatusResponse,
  SearchQlooEntitiesBody,
  SearchQlooEntitiesResponse,
  TestQlooConnectionBody,
  TestQlooConnectionResponse,
} from "@workspace/api-zod";
import { count } from "drizzle-orm";
import { activationPlansTable, db, savedDiscoveriesTable } from "@workspace/db";
import {
  getQlooStatus,
  isQlooConfigured,
  qlooGet,
} from "../lib/qloo/client";
import { searchQlooEntities } from "../lib/qloo/entities";
import { requestQlooHeatmap } from "../lib/qloo/heatmap";
import { getVenueSourceStatus } from "../lib/venue-source";

const router: IRouter = Router();

router.get("/qloo/status", (_req, res): void => {
  res.json(GetQlooStatusResponse.parse(getQlooStatus()));
});

router.get("/atlas/overview", async (_req, res): Promise<void> => {
  const [discoveries, plans] = await Promise.all([
    db.select({ value: count() }).from(savedDiscoveriesTable),
    db.select({ value: count() }).from(activationPlansTable),
  ]);

  res.json(
    GetAtlasOverviewResponse.parse({
      savedDiscoveries: Number(discoveries[0]?.value ?? 0),
      savedPlans: Number(plans[0]?.value ?? 0),
      qloo: getQlooStatus(),
      venueProviderConfigured: getVenueSourceStatus().configured,
    }),
  );
});

router.post("/qloo/test", async (req, res): Promise<void> => {
  const parsed = TestQlooConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isQlooConfigured()) {
    res.json(
      TestQlooConnectionResponse.parse({
        ...getQlooStatus(),
        message:
          "Qloo is not connected. Configure QLOO_API_KEY in the server environment, then test the connection again.",
      }),
    );
    return;
  }

  try {
    await qlooGet("/search", { query: parsed.data.query, take: "1" });
  } catch (error) {
    req.log.warn(
      { status: typeof error === "object" && error !== null && "status" in error ? error.status : undefined },
      "Qloo connection test failed",
    );
  }

  res.json(TestQlooConnectionResponse.parse(getQlooStatus()));
});

router.post("/qloo/entities/search", async (req, res): Promise<void> => {
  const parsed = SearchQlooEntitiesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const entities = await searchQlooEntities(
      parsed.data.query,
      parsed.data.types,
    );
    res.json(SearchQlooEntitiesResponse.parse({ source: "qloo_api", entities }));
  } catch (error) {
    req.log.warn(
      { error: error instanceof Error ? error.message : "Unknown Qloo error" },
      "Qloo entity lookup failed",
    );
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number(error.status)
        : 502;
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: "Qloo entity search failed. No substitute or sample results were returned.",
    });
  }
});

router.post("/opportunities/heatmap", async (req, res): Promise<void> => {
  const parsed = GetOpportunityHeatmapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const points = await requestQlooHeatmap(
      parsed.data.city,
      parsed.data.entityId,
    );
    res.json(GetOpportunityHeatmapResponse.parse({ source: "qloo_api", points }));
  } catch (error) {
    req.log.warn(
      { error: error instanceof Error ? error.message : "Unknown Qloo error" },
      "Qloo heatmap request failed",
    );
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number(error.status)
        : 502;
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: "Qloo heatmap request failed. No map points were fabricated.",
    });
  }
});

export default router;
