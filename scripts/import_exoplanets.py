#!/usr/bin/env python3
"""Refresh all NASA confirmed exoplanets with Python 3 (standard library only).

The query deliberately has no WHERE/TOP clause: incomplete records stay in the
catalogue. A separately queried row count guards against truncated responses.
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

ENDPOINT = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
FIELDS = {
    "pl_name": "name", "hostname": "host", "ra": "raDeg", "dec": "decDeg",
    "sy_dist": "distancePc", "pl_orbsmax": "semiMajorAxisAu",
    "pl_orbper": "periodDays", "pl_rade": "radiusEarth", "pl_bmasse": "massEarth",
    "pl_bmassprov": "massProvenance", "pl_eqt": "temperatureK",
    "disc_year": "discoveryYear", "discoverymethod": "discoveryMethod",
}
QUERY = f"select {','.join(FIELDS)} from pscomppars order by pl_name"
COUNT_QUERY = "select count(*) as planet_count from pscomppars"
ACKNOWLEDGEMENT = (
    "Data: NASA Exoplanet Archive, operated by Caltech for NASA's "
    "Exoplanet Exploration Program. Acknowledgement and citation guidance: "
    "https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html"
)

def query_url(query):
    # MAXREC exceeds the full table; exact cardinality is verified below.
    return f"{ENDPOINT}?{urlencode({'query': query, 'format': 'json', 'MAXREC': 100000})}"

def fetch(query):
    request = Request(query_url(query), headers={"User-Agent": "AetherCosmicAtlas/1.0"})
    with urlopen(request, timeout=180) as response:
        raw = response.read()
    result = json.loads(raw)
    if not isinstance(result, list):
        raise ValueError("NASA TAP did not return an array of rows")
    return result, raw

def normalize(row):
    missing = set(FIELDS) - row.keys()
    if missing:
        raise ValueError(f"NASA response is missing columns: {sorted(missing)}")
    if not row["pl_name"] or not row["hostname"]:
        raise ValueError("A planet name or host is missing")
    planet = {"id": f"exo-{quote(row['pl_name'], safe='')}"}
    planet.update({target: row[source] for source, target in FIELDS.items()})
    for field in (
        "raDeg", "decDeg", "distancePc", "semiMajorAxisAu", "periodDays",
        "radiusEarth", "massEarth", "temperatureK", "discoveryYear",
    ):
        value = planet[field]
        if value is not None and (not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise ValueError(f"Non-finite/non-numeric {field} for {planet['name']}")
    return planet

def build_snapshot(rows, expected_count, raw, retrieved_at):
    if len(rows) != expected_count:
        raise ValueError(f"Incomplete download: received {len(rows)} of {expected_count} planets")
    if expected_count < 6000:
        raise ValueError("Unexpectedly small catalog; refusing to replace snapshot")
    planets = [normalize(row) for row in rows]
    if len({planet["id"] for planet in planets}) != len(planets):
        raise ValueError("Duplicate planet names in NASA response")
    missing_distance = sum(p["distancePc"] is None for p in planets)
    unpositioned = sum(
        p["distancePc"] is None or p["raDeg"] is None or p["decDeg"] is None
        or p["distancePc"] <= 0 for p in planets
    )
    return {
        "metadata": {
            "source": "NASA Exoplanet Archive",
            "table": "pscomppars",
            "sourceUrl": query_url(QUERY),
            "countUrl": query_url(COUNT_QUERY),
            "query": QUERY,
            "retrievedAt": retrieved_at,
            "planetCount": len(planets),
            "archiveRowCount": expected_count,
            "hostCount": len({planet["host"] for planet in planets}),
            "missingDistanceCount": missing_distance,
            "unpositionedCount": unpositioned,
            "rawResponseSha256": hashlib.sha256(raw).hexdigest(),
            "scope": "All confirmed exoplanets in pscomppars; no candidate or distance filters.",
            "acknowledgement": ACKNOWLEDGEMENT,
        },
        "planets": planets,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
        default=Path(__file__).resolve().parents[1] / "src" / "exoplanets.json")
    args = parser.parse_args()
    before, _ = fetch(COUNT_QUERY)
    expected = before[0]["planet_count"]
    rows, raw = fetch(QUERY)
    after, _ = fetch(COUNT_QUERY)
    if after[0]["planet_count"] != expected:
        raise ValueError("Archive changed during download; rerun for a consistent snapshot")
    snapshot = build_snapshot(rows, expected, raw, datetime.now(timezone.utc).isoformat())
    # One object per line enables readable diffs without shipping MBs of whitespace.
    serialized = (
        '{\n"metadata":' + json.dumps(snapshot["metadata"], ensure_ascii=False, indent=2)
        + ',\n"planets":[\n'
        + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
                     for p in snapshot["planets"])
        + '\n]\n}\n'
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(args.output)
    meta = snapshot["metadata"]
    print(f"Saved {meta['planetCount']} planets / {meta['hostCount']} hosts to {args.output}")
    print(f"Missing distances: {meta['missingDistanceCount']}; unpositioned: {meta['unpositionedCount']}")
    print(f"Retrieved: {meta['retrievedAt']}")

if __name__ == "__main__":
    main()
