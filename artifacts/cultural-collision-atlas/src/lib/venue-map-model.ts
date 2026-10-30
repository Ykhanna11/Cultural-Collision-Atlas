import type { Venue } from "@workspace/api-client-react";

export interface VenueMarkerModel {
  venue: Venue;
  providerVenueId: string;
  coordinates: [longitude: number, latitude: number];
  selected: boolean;
  accessibleLabel: string;
  className: string;
}

export interface VenuePopupDetails {
  name: string;
  categories: string;
  address: string;
  coordinates: string;
  providerId: string;
  attribution: string;
}

export function venueMarkerModels(
  venues: readonly Venue[],
  selectedVenueId?: string,
  selectedVenueIds: readonly string[] = [],
): VenueMarkerModel[] {
  const seen = new Set<string>();
  return venues.flatMap((venue) => {
    if (seen.has(venue.providerVenueId)) return [];
    seen.add(venue.providerVenueId);
    const selected =
      venue.providerVenueId === selectedVenueId ||
      selectedVenueIds.includes(venue.providerVenueId);
    return [
      {
        venue,
        providerVenueId: venue.providerVenueId,
        coordinates: [venue.longitude, venue.latitude],
        selected,
        accessibleLabel: `${venue.name}${selected ? ", selected for activation plan" : ""}`,
        className: `venue-map-marker${selected ? " venue-map-marker-selected" : ""}`,
      },
    ];
  });
}

export function venuePopupDetails(venue: Venue): VenuePopupDetails {
  return {
    name: venue.name,
    categories: venue.categories.join(", ") || "Category not provided",
    address: venue.address ?? "Address not provided",
    coordinates: `${venue.latitude.toFixed(5)}, ${venue.longitude.toFixed(5)}`,
    providerId: venue.providerVenueId,
    attribution: venue.attribution,
  };
}

export function bindVenueMarkerSelection(
  element: Pick<EventTarget, "addEventListener">,
  venue: Venue,
  onSelect: (venue: Venue) => void,
): void {
  element.addEventListener("click", () => onSelect(venue));
}
