import { Router, type IRouter } from "express";
import {
  GetAtlasOverviewResponse,
  AnalyzeGeographicIntelligenceBody,
  AnalyzeGeographicIntelligenceResponse,
  GenerateActivationOpportunitiesBody,
  GenerateActivationOpportunitiesResponse,
  GetOpportunityHeatmapBody,
  GetOpportunityHeatmapResponse,
  GetQlooStatusResponse,
  SearchQlooEntitiesBody,
  SearchQlooEntitiesResponse,
  TestQlooConnectionBody,
  TestQlooConnectionResponse,
} from "@workspace/api-zod";
import { count, eq } from "drizzle-orm";
import { activationPlansTable, db, savedDiscoveriesTable } from "@workspace/db";
import {
  getQlooStatus,
  isQlooConfigured,
  QlooApiError,
  qlooGet,
} from "../lib/qloo/client";
import { searchQlooEntities } from "../lib/qloo/entities";
import { requestQlooHeatmap } from "../lib/qloo/heatmap";
import { summarizeGeographicIntelligence } from "../lib/cultural-intelligence/geographic";
import {
  analyzeUnifiedOpportunity,
} from "../lib/cultural-intelligence/analyze";
import {
  cacheGeographicAnalysis,
  getCachedDiscoveryAnalysis,
  getCachedGeographicAnalysis,
} from "../lib/cultural-intelligence/analysis-cache";
import { generateActivationOpportunities } from "../lib/cultural-intelligence/opportunity-discovery";
import { getVenueSourceStatus } from "../lib/venue-source";
import { providerRateLimit } from "../lib/provider-rate-limit";
import { readOvertureCoverage, overtureDataDirectory } from "../lib/overture";
import { searchPrimaryVenues } from "../lib/venue-discovery";
import { assessVenueSuitability } from "../lib/venue-suitability";
import {
  getPublicDemoWorkspaceId,
  workspaceFilter,
} from "../lib/workspace-scope";

const router: IRouter = Router();

router.post(
  "/opportunities/intelligence/analyze",
  providerRateLimit,
  async (req, res): Promise<void> => {
    const parsed = AnalyzeGeographicIntelligenceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { bounds } = parsed.data;
    if (
      bounds.south >= bounds.north || bounds.west >= bounds.east ||
      bounds.north - bounds.south > 2 || bounds.east - bounds.west > 3
    ) {
      res.status(400).json({
        error: "Geographic analysis requires ordered bounds no larger than 2 degrees latitude and 3 degrees longitude.",
      });
      return;
    }
    if (parsed.data.selectedVenueId && !parsed.data.analysisReference) {
      res.status(400).json({
        error: "Venue readiness requires the originating Discovery analysis reference.",
      });
      return;
    }

    const discoveryLookup = parsed.data.analysisReference
      ? getCachedDiscoveryAnalysis(parsed.data.analysisReference, parsed.data.entityId)
      : undefined;
    if (discoveryLookup && discoveryLookup.status !== "found") {
      res.status(discoveryLookup.status === "candidate_not_found" ? 400 : 410).json({
        error: discoveryLookup.status === "candidate_not_found"
          ? "The selected bridge does not belong to this Discovery analysis."
          : "The Discovery analysis reference expired or is unavailable. Run Discovery again.",
      });
      return;
    }
    const discoveryContext = discoveryLookup?.status === "found"
      ? discoveryLookup.analysis
      : undefined;
    if (
      discoveryContext &&
      discoveryContext.input.city.trim().toLowerCase() !== parsed.data.city.trim().toLowerCase()
    ) {
      res.status(409).json({ error: "The selected city does not match the Discovery analysis." });
      return;
    }

    const geographicRequest = {
      city: parsed.data.city.trim(),
      entityId: parsed.data.entityId,
      bounds,
      categories: parsed.data.categories ?? [],
      ...(parsed.data.query?.trim() && { query: parsed.data.query.trim() }),
      limit: parsed.data.limit ?? 25,
    };
    let summary = discoveryContext
      ? getCachedGeographicAnalysis(discoveryContext, geographicRequest)
      : undefined;

    if (!summary) {
      const [heatmapResult, venueResult] = await Promise.allSettled([
        requestQlooHeatmap(parsed.data.city, parsed.data.entityId),
        searchPrimaryVenues({
          bbox: bounds,
          categories: parsed.data.categories ?? [],
          ...(parsed.data.query?.trim() && { query: parsed.data.query.trim() }),
          limit: parsed.data.limit ?? 25,
        }),
      ]);
      if (heatmapResult.status === "rejected") {
        req.log.warn(
          { error: heatmapResult.reason instanceof Error ? heatmapResult.reason.message : "Unknown Qloo error" },
          "Geographic Qloo evidence request failed",
        );
      }
      if (venueResult.status === "rejected") {
        req.log.warn(
          { error: venueResult.reason instanceof Error ? venueResult.reason.message : "Unknown venue error" },
          "Geographic venue evidence request failed",
        );
      }

      const heatmapPoints = heatmapResult.status === "fulfilled" ? heatmapResult.value : [];
      const venues = venueResult.status === "fulfilled" ? venueResult.value.venues : [];
      summary = summarizeGeographicIntelligence({
        bounds,
        heatmapStatus: heatmapResult.status === "rejected"
          ? "unavailable"
          : heatmapPoints.length ? "returned" : "empty",
        heatmapPoints,
        venueStatus: venueResult.status === "rejected"
          ? "unavailable"
          : venues.length ? "returned" : "empty",
        venues,
        ...(venueResult.status === "fulfilled" && { venueSource: venueResult.value.provider }),
        overtureCoverage: readOvertureCoverage(overtureDataDirectory()),
      });
      if (discoveryContext) {
        cacheGeographicAnalysis(discoveryContext, geographicRequest, summary);
      }
    }

    const analysis = discoveryContext
      ? (() => {
          const candidate = discoveryContext.candidates.find(
            ({ id }) => id === parsed.data.entityId,
          );
          const venue = parsed.data.selectedVenueId
            ? summary.venues.records.find(
                ({ providerVenueId }) => providerVenueId === parsed.data.selectedVenueId,
              )
            : undefined;
          if (parsed.data.selectedVenueId && !venue) {
            return null;
          }
          const venueReadiness = venue && candidate
            ? assessVenueSuitability({
                venue,
                interestA: discoveryContext.input.interestA,
                interestB: discoveryContext.input.interestB,
                bridgeName: candidate.name,
                categories: parsed.data.categories ?? [],
                qlooEvidence: candidate.evidence,
              })
            : undefined;
          return analyzeUnifiedOpportunity({
            context: discoveryContext,
            candidateId: parsed.data.entityId,
            geography: summary,
            ...(venueReadiness && venue && {
              venueReadiness: {
                score: venueReadiness.score,
                sourceReferences: [`${venue.provider}:${venue.providerVenueId}`],
              },
            }),
          });
        })()
      : undefined;
    if (analysis === null) {
      res.status(400).json({
        error: "The selected venue is not part of this bounded geographic result.",
      });
      return;
    }

    res.json(AnalyzeGeographicIntelligenceResponse.parse({
      summary,
      ...(analysis && { analysis }),
    }));
  },
);

router.post(
  "/opportunities/intelligence/generate",
  async (req, res): Promise<void> => {
    const parsed = GenerateActivationOpportunitiesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const lookup = getCachedDiscoveryAnalysis(parsed.data.analysisReference, parsed.data.candidateId);
    if (lookup.status !== "found") {
      res.status(lookup.status === "candidate_not_found" ? 400 : 410).json({
        error: lookup.status === "candidate_not_found"
          ? "The selected candidate does not belong to this Discovery analysis."
          : "The Discovery analysis reference expired or is unavailable. Run Discovery again.",
      });
      return;
    }

    const summary = lookup.analysis.geographicSnapshot?.summary ?? {
      requestedBounds: { south: 0, west: 0, north: 0, east: 0 },
      observedBounds: null,
      heatmap: {
        status: "unavailable",
        source: "Qloo Insights API",
        pointCount: 0,
        duplicateCount: 0,
        invalidCoordinateCount: 0,
        points: [],
      },
      venues: {
        status: "unavailable",
        source: "Overture Maps Places",
        recordCount: 0,
        duplicateCount: 0,
        invalidCoordinateCount: 0,
        categoryCounts: [],
        records: [],
      },
      overtureCoverage: { status: "unknown", bounds: null },
      coverage: "unavailable",
      sourceSeparation: "No geographic evidence was preserved in the server-side analysis state.",
    };

    const analysis = analyzeUnifiedOpportunity({
      context: lookup.analysis,
      candidateId: parsed.data.candidateId,
      geography: summary,
    });

    const result = generateActivationOpportunities({
      analysis,
      context: {
        interestA: lookup.analysis.input.interestA,
        interestB: lookup.analysis.input.interestB,
        city: lookup.analysis.input.city,
        candidateName: analysis.candidateName,
        analysisReference: lookup.analysis.analysisReference,
      },
      venueRecords: summary.venues.records.map((venue) => ({
        provider: venue.provider,
        providerVenueId: venue.providerVenueId,
        name: venue.name,
        categories: venue.categories,
        attribution: venue.attribution,
        address: venue.address,
      })),
    });

    res.json(GenerateActivationOpportunitiesResponse.parse(result));
  },
);

router.get("/qloo/status", (_req, res): void => {
  res.json(GetQlooStatusResponse.parse(getQlooStatus()));
});

router.get(
  "/atlas/overview",
  async (_req, res): Promise<void> => {
    const workspaceId = await getPublicDemoWorkspaceId();
    const [discoveries, plans] = await Promise.all([
      db
        .select({ value: count() })
        .from(savedDiscoveriesTable)
        .where(
          workspaceFilter(savedDiscoveriesTable.workspaceId, workspaceId),
        ),
      db
        .select({ value: count() })
        .from(activationPlansTable)
        .where(
          workspaceFilter(activationPlansTable.workspaceId, workspaceId),
        ),
    ]);

    res.json(
      GetAtlasOverviewResponse.parse({
        savedDiscoveries: Number(discoveries[0]?.value ?? 0),
        savedPlans: Number(plans[0]?.value ?? 0),
        qloo: getQlooStatus(),
        venueProviderConfigured: getVenueSourceStatus().configured,
      }),
    );
  },
);

router.post(
  "/qloo/test",
  providerRateLimit,
  async (req, res): Promise<void> => {
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
        {
          status:
            typeof error === "object" && error !== null && "status" in error
              ? error.status
              : undefined,
        },
        "Qloo connection test failed",
      );
    }

    res.json(TestQlooConnectionResponse.parse(getQlooStatus()));
  },
);

router.post(
  "/qloo/entities/search",
  providerRateLimit,
  async (req, res): Promise<void> => {
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
      res.json(
        SearchQlooEntitiesResponse.parse({ source: "qloo_api", entities }),
      );
    } catch (error) {
      req.log.warn(
        {
          error: error instanceof Error ? error.message : "Unknown Qloo error",
        },
        "Qloo entity lookup failed",
      );
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : 502;
      const message =
        status === 401 || status === 403
          ? "Qloo rejected the server-side credential."
          : status === 429
            ? "Qloo rate limit reached. Try again later."
            : status === 503
              ? "Qloo is not configured for entity search."
              : error instanceof QlooApiError
                ? error.message
                : error instanceof Error
                  ? `Qloo returned unusable entity-search data: ${error.message}`
                  : "Qloo entity search failed unexpectedly.";
      res.status(status >= 400 && status < 600 ? status : 502).json({
        error: `${message} No substitute or sample results were returned.`,
      });
    }
  },
);

router.post(
  "/opportunities/heatmap",
  providerRateLimit,
  async (req, res): Promise<void> => {
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
      res.json(
        GetOpportunityHeatmapResponse.parse({ source: "qloo_api", points }),
      );
    } catch (error) {
      req.log.warn(
        {
          error: error instanceof Error ? error.message : "Unknown Qloo error",
        },
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
  },
);

export default router;
