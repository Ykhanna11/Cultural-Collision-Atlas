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
  onSelect: (venue: Venue) => void;
  onBoundsChange: (bounds: VenueMapBounds) => void;
  fitRequest: number;
}

export function VenueMap({
  venues,
  selectedVenueId,
  onSelect,
  onBoundsChange,
  fitRequest,
}: VenueMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onSelectRef.current = onSelect;
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, {
      center: [0, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    const publishBounds = () => {
      const bounds = map.getBounds();
      onBoundsChangeRef.current({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });
    };
    map.on("moveend", publishBounds);
    map.on("click", (event: L.LeafletMouseEvent) => {
      const span = 0.04;
      onBoundsChangeRef.current({
        south: event.latlng.lat - span / 2,
        west: event.latlng.lng - span / 2,
        north: event.latlng.lat + span / 2,
        east: event.latlng.lng + span / 2,
      });
    });
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

    for (const venue of venues) {
      const selected = venue.providerVenueId === selectedVenueId;
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
  }, [venues, selectedVenueId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitRequest === 0 || venues.length === 0) return;
    const bounds = L.latLngBounds(
      venues.map((venue) => [venue.latitude, venue.longitude]),
    );
    map.fitBounds(bounds.pad(0.18), { maxZoom: 16 });
  }, [fitRequest, venues]);

  return (
    <div
      ref={elementRef}
      className="h-[420px] w-full rounded-xl bg-[#0b101b] lg:h-[520px]"
      aria-label="Interactive OpenStreetMap venue map"
    />
  );
}
