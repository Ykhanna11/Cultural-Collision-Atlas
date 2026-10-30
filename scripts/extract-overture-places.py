#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract a bounded Overture Maps Places GeoParquet file.")
    parser.add_argument("--west", type=float, required=True)
    parser.add_argument("--south", type=float, required=True)
    parser.add_argument("--east", type=float, required=True)
    parser.add_argument("--north", type=float, required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--release", required=True, help="Explicit Overture release, for example 2026-10-21.0")
    args = parser.parse_args()
    if not (-180 <= args.west < args.east <= 180 and -90 <= args.south < args.north <= 90):
        parser.error("invalid geographic bounding box")
    executable = shutil.which("overturemaps")
    if not executable:
        parser.error("overturemaps is required; install scripts/requirements-overture.txt")

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "places.geo.parquet"
    manifest_path = output_dir / "coverage.json"
    manifest = {
        "release": args.release,
        "west": args.west,
        "south": args.south,
        "east": args.east,
        "north": args.north,
    }
    if output.exists():
        try:
            existing_manifest = json.loads(manifest_path.read_text(encoding="utf8"))
        except (OSError, json.JSONDecodeError):
            existing_manifest = None
        if output.is_file() and output.stat().st_size > 0 and existing_manifest == manifest:
            print(json.dumps({"output": str(output), "coverage": str(manifest_path), "reused": True, **manifest}))
            return 0
        parser.error("places.geo.parquet already exists with different or missing coverage metadata; choose another output directory to avoid overwriting data")
    if manifest_path.exists():
        parser.error("coverage.json already exists without places.geo.parquet; choose another output directory to avoid overwriting data")

    subprocess.run([
        executable,
        "download",
        "--bbox",
        f"{args.west},{args.south},{args.east},{args.north}",
        "-f",
        "geoparquet",
        "--type",
        "place",
        "--release",
        args.release,
        "--output",
        str(output),
    ], check=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"output": str(output), "coverage": str(manifest_path), **manifest}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
