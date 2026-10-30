import React from "react";
import { BASEMAP_ATTRIBUTION_TEXT } from "../lib/map-config";

export function BasemapUnavailableNotice() {
  return (
    <div
      className="venue-map-fallback"
      role="status"
      aria-label="Basemap unavailable"
    >
      <strong>OpenFreeMap basemap unavailable</strong>
      <span>
        The basemap could not be loaded. Actual venue results remain selectable
        below and can still be sent to the Activation Planner.
      </span>
      <span className="venue-map-fallback-attribution">
        {BASEMAP_ATTRIBUTION_TEXT}
      </span>
    </div>
  );
}
