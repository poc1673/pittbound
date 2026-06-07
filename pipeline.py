#!/usr/bin/env python3
"""Load property sales CSV, geocode addresses, and write listings JSON."""

from __future__ import annotations

import argparse
import csv
import json
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_CSV = Path("sample data.csv")
DEFAULT_OUTPUT = Path("data/listings.json")
GEOCODER_URL = (
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
)
GEOCODE_DELAY_SEC = 0.15

PITTSBURGH_BOUNDS = {
    "lat_min": 40.35,
    "lat_max": 40.52,
    "lng_min": -80.1,
    "lng_max": -79.85,
}

LISTING_KEYS = (
    "id",
    "address",
    "lat",
    "lng",
    "neighborhood",
    "price",
    "beds",
    "baths",
    "sqft",
    "imageUrls",
    "summary",
    "tags",
    "sourceUrl",
)


def strip_row(row: dict[str, str]) -> dict[str, str]:
    return {
        key.strip(): value.strip() if isinstance(value, str) else value
        for key, value in row.items()
    }


def load_csv(path: str | Path) -> list[dict[str, str]]:
    csv_path = Path(path)
    with csv_path.open(newline="", encoding="utf-8") as handle:
        rows = [strip_row(row) for row in csv.DictReader(handle)]

    return [
        row
        for row in rows
        if row.get("FULL_ADDRESS") and row.get("PRICE")
    ]


def geocode_address(full_address: str) -> dict[str, float | str] | None:
    query = urllib.parse.urlencode(
        {
            "address": full_address,
            "benchmark": "4",
            "format": "json",
        }
    )
    url = f"{GEOCODER_URL}?{query}"

    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            payload = json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None

    matches = payload.get("result", {}).get("addressMatches", [])
    if not matches:
        return None

    coordinates = matches[0].get("coordinates", {})
    if "x" not in coordinates or "y" not in coordinates:
        return None

    return {
        "lat": float(coordinates["y"]),
        "lng": float(coordinates["x"]),
        "matched_address": matches[0].get("matchedAddress", full_address),
    }


def geocode_rows(
    rows: list[dict[str, str]],
    *,
    limit: int | None = None,
    delay_sec: float = GEOCODE_DELAY_SEC,
) -> tuple[list[dict], list[dict[str, str]]]:
    selected = rows if limit is None else rows[:limit]
    geocoded: list[dict] = []
    failed: list[dict[str, str]] = []
    total = len(selected)

    for index, row in enumerate(selected, start=1):
        coords = geocode_address(row["FULL_ADDRESS"])
        if coords is None:
            failed.append(row)
            print(
                f"Geocoded {index}/{total}... FAILED: {row['FULL_ADDRESS']}",
                file=sys.stderr,
            )
        else:
            geocoded.append({**row, **coords})
            print(f"Geocoded {index}/{total}... OK")

        if index < total and delay_sec > 0:
            time.sleep(delay_sec)

    if failed:
        print(
            f"\nFailed to geocode {len(failed)} address(es):",
            file=sys.stderr,
        )
        for row in failed:
            print(f"  - {row['FULL_ADDRESS']}", file=sys.stderr)

    return geocoded, failed


def normalize_address(full_address: str) -> str:
    parts = [part.strip() for part in full_address.split(",") if part.strip()]
    if not parts:
        return full_address

    normalized_parts = []
    for part_index, part in enumerate(parts):
        if part_index == len(parts) - 1 and len(parts) >= 2:
            normalized_parts.append(part.upper())
            continue

        words = part.split()
        normalized_words = []
        for word in words:
            if word.isupper() and len(word) <= 4:
                normalized_words.append(word.title())
            elif word.isupper():
                normalized_words.append(word.title())
            else:
                normalized_words.append(word)
        normalized_parts.append(" ".join(normalized_words))

    return ", ".join(normalized_parts)


def to_listing(row: dict, index: int) -> dict:
    return {
        "id": f"listing-{index:03d}",
        "address": normalize_address(row["FULL_ADDRESS"]),
        "lat": float(row["lat"]),
        "lng": float(row["lng"]),
        "neighborhood": "Unknown",
        "price": int(float(row["PRICE"])),
        "beds": 0,
        "baths": 0,
        "sqft": 0,
        "imageUrls": [],
        "summary": "",
        "tags": [],
        "sourceUrl": "",
    }


def write_listings_json(listings: list[dict], output_path: str | Path) -> None:
    path = Path(output_path)
    path.write_text(
        json.dumps(listings, indent=2) + "\n",
        encoding="utf-8",
    )


def build_listings(
    csv_path: str | Path = DEFAULT_CSV,
    output_path: str | Path = DEFAULT_OUTPUT,
    *,
    limit: int | None = None,
) -> int:
    rows = load_csv(csv_path)
    geocoded_rows, _failed = geocode_rows(rows, limit=limit)
    listings = [
        to_listing(row, index)
        for index, row in enumerate(geocoded_rows, start=1)
    ]
    write_listings_json(listings, output_path)
    return len(listings)


def in_pittsburgh_bounds(lat: float, lng: float) -> bool:
    return (
        PITTSBURGH_BOUNDS["lat_min"] <= lat <= PITTSBURGH_BOUNDS["lat_max"]
        and PITTSBURGH_BOUNDS["lng_min"] <= lng <= PITTSBURGH_BOUNDS["lng_max"]
    )


def _test_step_1() -> None:
    rows = load_csv(DEFAULT_CSV)
    assert len(rows) == 688, f"expected 688 rows, got {len(rows)}"
    first = rows[0]
    assert first["FULL_ADDRESS"] == "1210 ROUND TOP ST, PITTSBURGH, PA 15205"
    assert int(first["PRICE"]) == 91000
    print("Step 1 passed: CSV loaded correctly.")


def _test_step_2() -> None:
    result = geocode_address("5854 HOBART ST, PITTSBURGH, PA 15217")
    assert result is not None, "geocoding returned no match"
    assert isinstance(result["lat"], float)
    assert isinstance(result["lng"], float)
    assert in_pittsburgh_bounds(result["lat"], result["lng"])
    print(
        "Step 2 passed: geocoded sample address to "
        f"lat={result['lat']}, lng={result['lng']}."
    )


def _test_step_3() -> None:
    rows = load_csv(DEFAULT_CSV)
    geocoded_rows, failed = geocode_rows(rows, limit=3)
    assert len(geocoded_rows) + len(failed) == 3
    assert len(geocoded_rows) == 3, f"expected 3 geocoded rows, got {len(geocoded_rows)}"
    for row in geocoded_rows:
        assert "lat" in row and "lng" in row
        assert in_pittsburgh_bounds(row["lat"], row["lng"])
    print("Step 3 passed: geocoded first 3 rows successfully.")


def _test_step_4() -> None:
    row = {
        "FULL_ADDRESS": "5854 HOBART ST, PITTSBURGH, PA 15217",
        "PRICE": "745000",
        "lat": 40.4321,
        "lng": -79.9212,
    }
    listing = to_listing(row, 1)
    assert set(listing.keys()) == set(LISTING_KEYS)
    assert listing["address"] == "5854 Hobart St, Pittsburgh, PA 15217"
    assert listing["price"] == 745000
    assert isinstance(listing["lat"], float)
    assert isinstance(listing["lng"], float)
    print("Step 4 passed: listing transformation matches schema.")


def _test_step_5() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        output_path = Path(temp_dir) / "sample_listings.json"
        count = build_listings(DEFAULT_CSV, output_path, limit=2)
        assert count == 2, f"expected 2 listings, got {count}"

        listings = json.loads(output_path.read_text(encoding="utf-8"))
        assert isinstance(listings, list)
        assert len(listings) == 2
        first = listings[0]
        assert set(first.keys()) == set(LISTING_KEYS)
        assert first["price"] > 0
        assert in_pittsburgh_bounds(first["lat"], first["lng"])
    print("Step 5 passed: end-to-end pipeline wrote valid JSON.")


STEP_TESTS = {
    "1": _test_step_1,
    "2": _test_step_2,
    "3": _test_step_3,
    "4": _test_step_4,
    "5": _test_step_5,
}


def run_tests(step: str) -> None:
    if step == "all":
        for test_fn in STEP_TESTS.values():
            test_fn()
        print("All step tests passed.")
        return

    if step not in STEP_TESTS:
        raise SystemExit(f"Unknown test step: {step}. Use 1-5 or all.")

    STEP_TESTS[step]()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Geocode property sales CSV and write listings JSON."
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_CSV),
        help=f"Input CSV path (default: {DEFAULT_CSV})",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output JSON path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--test",
        choices=[*STEP_TESTS.keys(), "all"],
        help="Run a built-in pipeline test step (1-5 or all).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Geocode only the first N rows (useful for testing).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.test:
        run_tests(args.test)
        return

    count = build_listings(args.input, args.output, limit=args.limit)
    print(f"Wrote {count} listing(s) to {args.output}")


if __name__ == "__main__":
    main()

