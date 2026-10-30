import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Venue } from "@workspace/api-client-react";

export interface VenueMapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface VenueMapProps {
  venues: Venue[];
  selectedVenueId?: string;
  selectedVenueIds?: string[];
  onSelect: (venue: Venue) => void;
  onBoundsChange: (bounds: VenueMapBounds) => void;
  fitRequest: number;
}

export function VenueMap({
  venues,
  selectedVenueId,
  selectedVenueIds = [],
  onSelect,
  onBoundsChange,
  fitRequest,
}: VenueMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const ignoreNextMoveEndRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onSelectRef.current = onSelect;
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, {
      center: [51.5, -0.125],
      zoom: 14,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    const publishBounds = () => {
      if (ignoreNextMoveEndRef.current) {
        ignoreNextMoveEndRef.current = false;
        return;
      }
      const bounds = map.getBounds();
      onBoundsChangeRef.current({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    };
    map.on("moveend", publishBounds);
    map.whenReady(publishBounds);
    mapRef.current = map;
    const invalidateSize = () => map.invalidateSize({ pan: false });
    const resizeObserver = new ResizeObserver(invalidateSize);
    resizeObserver.observe(elementRef.current);
    window.addEventListener("orientationchange", invalidateSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("orientationchange", invalidateSize);
      map.off();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    const seen = new Set<string>();
    for (const venue of venues) {
      if (seen.has(venue.providerVenueId)) continue;
      seen.add(venue.providerVenueId);
      const selected = venue.providerVenueId === selectedVenueId || selectedVenueIds.includes(venue.providerVenueId);
      const marker = L.marker([venue.latitude, venue.longitude], {
        icon: L.divIcon({
          className: "venue-map-marker",
          html: `<span class="${selected ? "venue-map-marker-selected" : ""}"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        title: venue.name,
      }).addTo(map);
      marker.on("click", () => onSelectRef.current(venue));
      markersRef.current.set(venue.providerVenueId, marker);
    }
  }, [venues, selectedVenueId, selectedVenueIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitRequest === 0 || venues.length === 0) return;
    const bounds = L.latLngBounds(
      venues.map((venue) => [venue.latitude, venue.longitude]),
    );
    const paddedBounds = bounds.pad(0.18);
    if (!map.getBounds().equals(paddedBounds)) {
      ignoreNextMoveEndRef.current = true;
      map.once("moveend", () => {
        ignoreNextMoveEndRef.current = false;
      });
      map.fitBounds(paddedBounds, { maxZoom: 16 });
    }
  }, [fitRequest, venues]);

  return (
    <div
      ref={elementRef}
      className="h-[420px] w-full rounded-xl bg-[#0b101b] lg:h-[520px]"
      aria-label="Interactive OpenStreetMap venue map"
    />
  );
}
