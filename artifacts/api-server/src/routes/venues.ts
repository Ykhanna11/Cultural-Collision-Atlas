import { Router, type IRouter, type Request, type Response } from "express";
import {
  AssessVenueSuitabilityBody,
  AssessVenueSuitabilityResponse,
  GetVenueProviderStatusResponse,
  SearchVenuesBody,
  SearchVenuesResponse,
} from "@workspace/api-zod";
import { getVenueSourceStatus } from "../lib/venue-source";
import { openStreetMapVenueProvider, OverpassRequestError } from "../lib/openstreetmap";
import { overtureVenueProvider, OvertureDataUnavailableError } from "../lib/overture";
import type { VenueProvider } from "../lib/venue-provider";
import { assessVenueSuitability } from "../lib/venue-suitability";

const router: IRouter = Router();

async function searchPrimaryVenues(input: Parameters<VenueProvider["search"]>[0]) {
  try {
    return { provider: "overture" as const, venues: await overtureVenueProvider.search(input) };
  } catch (error) {
    if (!(error instanceof OvertureDataUnavailableError)) throw error;
    if (!process.env.OVERPASS_URL?.trim()) throw error;
    return { provider: "openstreetmap" as const, venues: await openStreetMapVenueProvider.search(input) };
  }
}

function logVenueProviderFailure(req: Request, error: unknown) {
  if (error instanceof OverpassRequestError) {
    req.log.error({
      upstreamHostname: error.diagnostic.hostname,
      upstreamStatus: error.diagnostic.status,
      errorName: error.name,
      errorMessage: error.message,
      timedOut: error.diagnostic.timedOut,
      durationMs: error.diagnostic.durationMs,
      responseBodyExcerpt: error.diagnostic.responseBodyExcerpt,
    }, "OpenStreetMap venue provider request failed.");
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  req.log.error({
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: message,
  }, "OpenStreetMap venue provider request failed.");
}

function sendVenueSearchError(req: Request, res: Response, error: unknown) {
  logVenueProviderFailure(req, error);
  if (error instanceof OvertureDataUnavailableError) {
    res.status(503).json({
      error: error.message,
      setupInstructions: "Configure OVERTURE_DATA_DIR with a bounded Overture Places GeoParquet extract; see docs/overture-places.md.",
    });
    return;
  }
  res.status(502).json({
    error: "Venue discovery is temporarily unavailable.",
    setupInstructions: "Check the configured venue data source and retry.",
  });
}

router.get("/opportunities/venues/status", (_req, res) => {
  res.json(GetVenueProviderStatusResponse.parse(getVenueSourceStatus()));
});

router.post("/opportunities/venues/search", async (req, res) => {
  const parsed = SearchVenuesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { bbox, radius } = parsed.data;
  if (!bbox && !radius) {
    res.status(400).json({ error: "A geographic bounding box or radius is required." });
    return;
  }
  if (radius) {
    if (Math.abs(radius.latitude) > 90 || Math.abs(radius.longitude) > 180) {
      res.status(400).json({ error: "Invalid radius center coordinates." });
      return;
    }
    if (!Number.isFinite(radius.kilometers) || radius.kilometers < 0.1 || radius.kilometers > 25) {
      res.status(400).json({ error: "Search radius must be between 0.1 and 25 kilometers." });
      return;
    }
    const normalized = { ...parsed.data, bbox: undefined, radius, limit: parsed.data.limit ?? 25 };
    try {
      const result = await searchPrimaryVenues(normalized);
      res.json(SearchVenuesResponse.parse({
        source: result.provider,
        venues: result.venues,
        attribution: result.provider === "overture"
          ? "Overture Maps Foundation, overturemaps.org; individual source licenses and notices apply."
          : "© OpenStreetMap contributors, ODbL. Map data and venue data may be cached for 10 minutes.",
      }));
    } catch (error) {
      sendVenueSearchError(req, res, error);
    }
    return;
  }
  if (!bbox) {
    res.status(400).json({ error: "A geographic bounding box or radius is required." });
    return;
  }
  if (
    !Object.values(bbox).every(Number.isFinite) ||
    bbox.south < -90 || bbox.north > 90 || bbox.west < -180 || bbox.east > 180 ||
    bbox.south >= bbox.north || bbox.west >= bbox.east
  ) {
    res.status(400).json({ error: "Invalid geographic bounding box." });
    return;
  }
  const latSpan = bbox.north - bbox.south;
  const lonSpan = bbox.east - bbox.west;
  if (latSpan > 2 || lonSpan > 3) {
    res.status(400).json({ error: "Venue searches must cover no more than 2 degrees latitude and 3 degrees longitude." });
    return;
  }
  try {
    const result = await searchPrimaryVenues({
      ...parsed.data,
      limit: parsed.data.limit ?? 25,
    });
    res.json(SearchVenuesResponse.parse({
      source: result.provider,
      venues: result.venues,
      attribution: result.provider === "overture"
        ? "Overture Maps Foundation, overturemaps.org; individual source licenses and notices apply."
        : "© OpenStreetMap contributors, ODbL. Map data and venue data may be cached for 10 minutes.",
    }));
  } catch (error) {
    sendVenueSearchError(req, res, error);
  }
});

router.post("/opportunities/venues/:providerVenueId/suitability", async (req, res) => {
  const input = AssessVenueSuitabilityBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  const venue = await overtureVenueProvider.find(req.params.providerVenueId)
    ?? await openStreetMapVenueProvider.find(req.params.providerVenueId);
  if (!venue) {
    res.status(404).json({ error: "Venue details are no longer available. Search again." });
    return;
  }
  res.json(AssessVenueSuitabilityResponse.parse(assessVenueSuitability({
    venue,
    interestA: input.data.interestA,
    interestB: input.data.interestB,
    bridgeName: input.data.bridgeName,
    categories: input.data.categories,
    qlooEvidence: input.data.qlooEvidence ?? [],
  })));
});

export default router;
