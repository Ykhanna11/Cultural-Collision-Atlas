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
  attribution: string;
  retrievedAt: string;
}

export function getVenueSourceStatus() {
  const overtureDirectory = process.env.OVERTURE_DATA_DIR?.trim();
  return {
    configured: Boolean(overtureDirectory),
    state: "unknown",
    message:
      overtureDirectory
        ? "An Overture local dataset has been configured. Live coverage has not been checked by the status request."
        : "Overture local venue data is not configured.",
  };
}
