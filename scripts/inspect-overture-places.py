#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import duckdb


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect a local Overture Places GeoParquet extract.")
    parser.add_argument("data_dir")
    args = parser.parse_args()
    data_dir = Path(args.data_dir).expanduser().resolve()
    files = sorted(str(path) for path in data_dir.glob("*.parquet"))
    if not files:
        parser.error("no .parquet files found in the configured data directory")
    escaped = ", ".join("'" + path.replace("'", "''") + "'" for path in files)
    connection = duckdb.connect()
    count = connection.execute(f"SELECT count(*) FROM read_parquet([{escaped}])").fetchone()[0]
    bounds = connection.execute(f"""
        SELECT min(bbox.xmin), min(bbox.ymin), max(bbox.xmax), max(bbox.ymax)
        FROM read_parquet([{escaped}])
    """).fetchone()
    manifest_path = data_dir / "coverage.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8")) if manifest_path.exists() else None
    result = {
        "recordCount": count,
        "recordBounds": {
            "west": bounds[0],
            "south": bounds[1],
            "east": bounds[2],
            "north": bounds[3],
        },
        "fileBytes": sum(path.stat().st_size for path in data_dir.glob("*.parquet")),
        "coverage": manifest,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
