export const OPENFREEMAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/dark";

export const BASEMAP_ATTRIBUTION_HTML =
  '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

export const BASEMAP_ATTRIBUTION_TEXT =
  "OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors (ODbL)";

export function shouldFallbackFromBasemapError(status?: number): boolean {
  return status === undefined || status < 200 || status >= 400;
}
