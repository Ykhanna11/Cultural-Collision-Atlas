# Venue Discovery

The Opportunity Atlas uses the existing Leaflet map and Express venue API.
Overture Maps Places is the primary venue source; the application queries a
bounded local GeoParquet extract with DuckDB. See
[`docs/overture-places.md`](overture-places.md) for extraction and run steps.

## Search and Providers

- Searches accept a bounding box or a center/radius, optional category and
	keyword filters, and a bounded result limit of at most 50.
- DuckDB applies spatial, category, and keyword filtering to local files. The
	API performs exact point/radius checks, filters invalid coordinates, removes
	duplicate feature IDs, and caches identical results for ten minutes.
- The map starts in London. After the first search, map movement and filter
	changes refresh results after a short debounce; programmatic map fitting does
	not trigger a second request.
- Missing files, unreadable data, and requests outside declared extract coverage
	are unavailable-data errors, not empty successful searches. An empty search
	inside coverage returns an actual empty result.
- OpenStreetMap Overpass is only an explicit operator-configured fallback via
	`OVERPASS_URL`; the basic workflow does not contact public Overpass servers.
- No paid venue API credentials are required. Venue data does not provide
	Qloo-derived cultural evidence.

## Venue Evidence and Activation Plans

Venue facts and Qloo cultural evidence remain separate. Venue records retain
their provider ID, location, normalized category, available contact fields,
source metadata, attribution, and retrieval time. Missing source fields remain
missing. Operating status is source-reported when present; it is not treated as
verified current availability. The Places extract currently does not supply
opening hours.

Suitability explanations use category fit and operational-data completeness;
they do not imply audience demographics, footfall, cultural affinity, or
campaign performance. Users can inspect and select multiple venues. Their
provider facts and any available assessment are carried into activation plans,
saved snapshots, and JSON exports. Older single-venue plans remain supported.

## Map Tiles and Terms

The Opportunity Atlas uses the no-key OpenFreeMap vector style
`https://tiles.openfreemap.org/styles/dark` through MapLibre GL JS. The public
OpenFreeMap instance is free and does not require registration or API keys, but
its [Terms of Service](https://openfreemap.org/tos/) describe it as an
as-is/as-available service that may be discontinued without notice. It does not
provide an availability guarantee. The browser requests style, vector tiles,
sprites, and glyphs only as needed for interactive map rendering; the app does
not proxy, prefetch, bulk-download, or retain basemap tiles.

MapLibre's visible attribution control identifies OpenFreeMap, OpenMapTiles, and
OpenStreetMap contributors. The OpenStreetMap data remains under ODbL; see the
[OpenFreeMap quick start](https://openfreemap.org/quick_start/) and
[OpenStreetMap copyright page](https://www.openstreetmap.org/copyright). The
previous `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` basemap has been
removed. The public OSM tile service is separate from OSM's data license and must
not be treated as an unrestricted tile CDN.

Overture records may have source-specific licenses and notices. Preserve the
attribution and license metadata with saved/exported venue facts, review each
release's terms, and do not infer unrestricted commercial redistribution from
the top-level dataset license. Zero API fees do not eliminate storage, compute,
bandwidth, operational, or map-tile costs.
