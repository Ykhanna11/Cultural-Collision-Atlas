import { openStreetMapVenueProvider } from "./openstreetmap";
import { overtureVenueProvider, OvertureDataUnavailableError } from "./overture";
import type { VenueSearchInput } from "./venue-provider";

export async function searchPrimaryVenues(input: VenueSearchInput) {
  try {
    return {
      provider: "overture" as const,
      venues: await overtureVenueProvider.search(input),
    };
  } catch (error) {
    if (!(error instanceof OvertureDataUnavailableError)) throw error;
    if (!process.env.OVERPASS_URL?.trim()) throw error;
    return {
      provider: "openstreetmap" as const,
      venues: await openStreetMapVenueProvider.search(input),
    };
  }
}