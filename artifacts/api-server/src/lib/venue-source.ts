import { getOvertureDataStatus } from "./overture";

export interface Venue {
  provider: "openstreetmap" | "overture";
  providerVenueId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  categories: string[];
  website?: string;
  phone?: string;
  email?: string;
  rating?: number;
  ratingCount?: number;
  openingHours?: string;
  sourceMetadata?: {
    basicCategory?: string;
    taxonomy?: string[];
    operatingStatus?: string;
    sources?: Array<{
      dataset?: string;
      license?: string;
      provider?: string;
      recordId?: string;
      version?: string;
    }>;
  };
  attribution: string;
  retrievedAt: string;
}

export function getVenueSourceStatus() {
  return getOvertureDataStatus();
}
