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

The current map uses
`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` and visibly attributes
`© OpenStreetMap contributors`. OSM data is free to use under ODbL attribution
requirements, but the public tile service is donation-funded, best-effort, and
not a commercial SaaS service guarantee. Follow the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/):
honor HTTP caching, do not prefetch or provide offline tiles from this service,
and keep attribution visible. OSMF may block access or withdraw it. Commercial
production should select a provider or self-hosted tile source with terms and
capacity suitable for the deployment; do not assume public tiles are
unrestricted.

Overture records may have source-specific licenses and notices. Preserve the
attribution and license metadata with saved/exported venue facts, review each
release's terms, and do not infer unrestricted commercial redistribution from
the top-level dataset license. Zero API fees do not eliminate storage, compute,
bandwidth, operational, or map-tile costs.
