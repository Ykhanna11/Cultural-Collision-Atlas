import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Venue } from "@workspace/api-client-react";
import { BasemapUnavailableNotice } from "@/components/basemap-unavailable-notice";
import {
  BASEMAP_ATTRIBUTION_HTML,
  OPENFREEMAP_STYLE_URL,
  shouldFallbackFromBasemapError,
} from "@/lib/map-config";
import {
  bindVenueMarkerSelection,
  venueMarkerModels,
  venuePopupDetails,
} from "@/lib/venue-map-model";

setWorkerUrl(workerUrl);

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
function markerPopup(venue: Venue): HTMLElement {
  const details = venuePopupDetails(venue);
  const content = document.createElement("div");
  content.className = "venue-map-popup";

  const title = document.createElement("strong");
  title.textContent = details.name;
  content.append(title);

  for (const [label, value] of [
    ["Category", details.categories],
    ["Address", details.address],
    ["Coordinates", details.coordinates],
    ["Provider ID", details.providerId],
    ["Source", details.attribution],
  ]) {
    const row = document.createElement("span");
    row.textContent = `${label}: ${value}`;
    content.append(row);
  }
  return content;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = error.status;
  return typeof status === "number" ? status : undefined;
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
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const ignoreNextMoveEndRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const [basemapUnavailable, setBasemapUnavailable] = useState(false);
  onSelectRef.current = onSelect;
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: elementRef.current,
      style: OPENFREEMAP_STYLE_URL,
      center: [-0.125, 51.5],
      zoom: 14,
      maxZoom: 19,
      attributionControl: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new AttributionControl({
        compact: false,
        customAttribution: BASEMAP_ATTRIBUTION_HTML,
      }),
      "bottom-right",
    );

    let fallbackTriggered = false;
    const fallbackToPlainCanvas = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      window.clearTimeout(fallbackTimer);
      setBasemapUnavailable(true);
      map.setStyle({
        version: 8,
        sources: {},
        layers: [
          {
            id: "basemap-unavailable-background",
            type: "background",
            paint: { "background-color": "#0b101b" },
          },
        ],
      });
    };
    const fallbackTimer = window.setTimeout(fallbackToPlainCanvas, 15000);
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
    map.once("load", () => {
      window.clearTimeout(fallbackTimer);
      if (!fallbackTriggered) publishBounds();
    });
    map.on("error", (event) => {
      if (shouldFallbackFromBasemapError(errorStatus(event.error))) {
        fallbackToPlainCanvas();
      }
    });
    mapRef.current = map;

    const invalidateSize = () => map.resize();
    const resizeObserver = new ResizeObserver(invalidateSize);
    resizeObserver.observe(elementRef.current);
    window.addEventListener("orientationchange", invalidateSize);
    return () => {
      window.clearTimeout(fallbackTimer);
      resizeObserver.disconnect();
      window.removeEventListener("orientationchange", invalidateSize);
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const model of venueMarkerModels(
      venues,
      selectedVenueId,
      selectedVenueIds,
    )) {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = model.className;
      markerElement.setAttribute("aria-label", model.accessibleLabel);
      markerElement.title = model.accessibleLabel;
      const markerDot = document.createElement("span");
      markerDot.setAttribute("aria-hidden", "true");
      markerElement.append(markerDot);

      const popup = new Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 16,
      }).setDOMContent(markerPopup(model.venue));
      const marker = new Marker({ element: markerElement, anchor: "center" })
        .setLngLat(model.coordinates)
        .setPopup(popup)
        .addTo(map);
      bindVenueMarkerSelection(markerElement, model.venue, (venue) => {
        onSelectRef.current(venue);
      });
      markersRef.current.set(model.providerVenueId, marker);
    }
  }, [venues, selectedVenueId, selectedVenueIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitRequest === 0 || venues.length === 0) return;
    const coordinates = venueMarkerModels(venues).map(
      ({ coordinates }) => coordinates,
    );
    if (coordinates.length === 0) return;
    const bounds = coordinates.reduce(
      (current, coordinate) => current.extend(coordinate),
      new LngLatBounds(coordinates[0], coordinates[0]),
    );
    ignoreNextMoveEndRef.current = true;
    map.once("moveend", () => {
      ignoreNextMoveEndRef.current = false;
    });
    map.fitBounds(bounds, { padding: 28, maxZoom: 16, duration: 0 });
  }, [fitRequest, venues]);

  return (
    <div className="venue-map-shell" data-testid="venue-map-shell">
      <div
        ref={elementRef}
        className="venue-map-canvas"
        aria-label="Interactive OpenFreeMap venue map"
      />
      {basemapUnavailable && <BasemapUnavailableNotice />}
    </div>
  );
}
