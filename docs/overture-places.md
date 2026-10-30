# Overture Places Data

Overture Maps Places is the primary venue source. The application queries an
operator-provided local GeoParquet extract with the DuckDB Node.js binding. It
does not download data at application startup and requires no venue API key.

## Runtime and Native DuckDB

The verified workspace runtime is Node.js 24.22.2 and pnpm 12.3.4. The API
server uses `duckdb` 1.4.4. Its native install script is permitted by the
workspace `allowBuilds` policy; esbuild remains disallowed as a build script.

```bash
pnpm install
cd artifacts/api-server
node -e "const duckdb = require('duckdb'); console.log('DuckDB loaded:', typeof duckdb.Database)"
```

If the native binding is missing after an install that did not execute package
scripts, run `pnpm rebuild duckdb` from the workspace, then repeat the load
check. The API build externalizes DuckDB because its native loader must run at
runtime rather than be bundled by esbuild.

## Bounded London Extract

Use the official [Overture getting-data documentation](https://docs.overturemaps.org/getting-data/)
and [Python CLI](https://docs.overturemaps.org/getting-data/overturemaps-py/).
The CLI reads the cloud-hosted GeoParquet and transfers only records intersecting
the requested bounding box. Keep its temporary Python environment and extract
outside the repository; `.venv` is not ignored by this repository.

Python 3.14.2 was verified with the pinned extraction dependencies. For example:

```bash
python3 -m venv /tmp/cca-overture-venv
/tmp/cca-overture-venv/bin/python -m pip install -r scripts/requirements-overture.txt
PATH="/tmp/cca-overture-venv/bin:$PATH" python3 scripts/extract-overture-places.py \
  --west -0.20 --south 51.45 --east -0.05 --north 51.55 \
  --release 2026-10-21.0 \
  --output-dir /var/local/cultural-atlas/overture/places
```

The release is explicit and the extract covers central London only. The wrapper
writes `places.geo.parquet` and `coverage.json`. Repeating the same request with
matching coverage metadata reuses the extract; a different release or bounding
box refuses to overwrite existing files. Choose a new output directory to
refresh, inspect it, and then update `OVERTURE_DATA_DIR`.

```bash
/tmp/cca-overture-venv/bin/python scripts/inspect-overture-places.py \
  /var/local/cultural-atlas/overture/places
```

The inspection reports record count, actual record bounds, file size, and
coverage manifest. Local `data/overture/` locations are ignored by Git, but the
recommended `/var/local` location is outside the checkout entirely.

## Configure and Run

Set `OVERTURE_DATA_DIR` to the directory containing both files. The API returns
an actionable 503 when no dataset is available or the requested area is outside
its declared coverage; an empty search within coverage returns an empty result.
It never fabricates venues. Searches are filtered in DuckDB by spatial bounds,
keyword, and category; exact point/radius checks and a 50-result maximum are
applied before returning results. Repeated searches are cached for ten minutes,
and concurrent identical requests share the same query.

```bash
OVERTURE_DATA_DIR=/var/local/cultural-atlas/overture/places \
PORT=10000 pnpm --filter @workspace/api-server run dev
```

Run the frontend in another terminal; Vite proxies `/api` to port 10000:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/cultural-collision-atlas run dev
```

## Tests

Run the complete package test/build flow without a real dataset to exercise
missing-data responses:

```bash
env -u OVERTURE_DATA_DIR pnpm --filter @workspace/api-server test
```

Set the extract path to enable tests against actual London records through both
the Node provider and HTTP API. This is separate from tests using synthetic
fixtures:

```bash
OVERTURE_DATA_DIR=/var/local/cultural-atlas/overture/places \
pnpm --filter @workspace/api-server test
```

Run workspace typechecks with `pnpm run typecheck`. The API tests build the
server and frontend, then exercise the current routes and workflow tests.

## Attribution and Licensing

Review the current [Overture attribution and licensing guidance](https://docs.overturemaps.org/attribution/)
and the license/source fields in each extract. Places records retain source
dataset, provider, record ID, version, and license where supplied; the interface
and saved/exported plans retain that metadata and the Overture release
attribution. Individual sources can impose additional attribution, notice, or
redistribution requirements. The official Places section lists source-level
terms including CDLA Permissive 2.0, Foursquare Apache 2.0 (with `NOTICE.txt`),
and AllThePlaces CC0. It does not justify treating every Places record as
covered by one blanket license. Verify the exact release and record-level terms
before commercial redistribution. This is not a claim that all source records
or the platform are unrestricted.

Zero API fees do not remove storage, compute, backup, bandwidth, monitoring, or
commercial map-tile costs. Map tile provider terms are documented in
`docs/venue-discovery.md`.