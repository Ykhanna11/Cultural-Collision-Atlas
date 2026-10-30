# Overture Places local data

Overture Places is a downloadable geographic dataset, not a live Places API.
The application queries an extracted local GeoParquet file with DuckDB. It does
not download data at application startup and does not require cloud credentials.

## Install the extraction tools

```bash
python3 -m pip install -r scripts/requirements-overture.txt
```

The pinned extraction tooling is `overturemaps==1.0.2` and `duckdb==1.4.4`.

## Create a London extract

```bash
python3 scripts/extract-overture-places.py \
  --west -0.20 --south 51.45 --east -0.05 --north 51.55 \
  --release 2026-10-21.0 \
  --output-dir /var/local/cultural-atlas/overture/places
```

Always select an explicit release. The release in `coverage.json` is required
metadata for the extract and is reported through venue attribution. The example
bounding box covers central London only and deliberately avoids a global
download.

## Configure the application

```bash
OVERTURE_DATA_DIR=/var/local/cultural-atlas/overture/places
```

The directory must be outside generated build output. It should contain
`places.geo.parquet` and `coverage.json`.

`OVERPASS_URL` is optional and is used only as an explicit fallback after local
Overture data is unavailable. It is not contacted when local Overture succeeds.

## Inspect coverage

```bash
python3 scripts/inspect-overture-places.py \
  /var/local/cultural-atlas/overture/places
```

The command reports the stored coverage declaration, actual record bounds,
record count, and extract file size.

## Licensing and attribution

The Places theme is published under the CDLA Permissive 2.0 and Apache 2.0
licenses. Individual contributors can carry additional attribution
requirements. Records carry source metadata; redistribution must preserve the
appropriate source notices and Apache 2.0 NOTICE material where applicable,
including when a record is sourced from Foursquare. The data directory is
therefore part of the application's provenance and redistribution evidence.

Commercial deployment should have its legal/commercial terms verified against
the release and source metadata. This implementation does not assert that all
Places records or their source-derived derivations are unrestricted. The
application map tile provider has separate commercial terms and availability;
those terms are not covered by Overture licensing.

Zero-cost data access does not eliminate storage, compute, backup, monitoring,
operational, or commercial tile-map costs at SaaS scale.
