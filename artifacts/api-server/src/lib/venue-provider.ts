import type { Venue } from "./venue-source";

export interface VenueSearchInput {
  bbox?: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  radius?: {
    latitude: number;
    longitude: number;
    kilometers: number;
  };
  categories: string[];
  query?: string;
  limit: number;
}

export interface VenueProvider {
  readonly id: Venue["provider"];
  search(input: VenueSearchInput): Promise<Venue[]>;
  find(providerVenueId: string): Promise<Venue | undefined>;
}
