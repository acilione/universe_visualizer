#!/usr/bin/env python3
"""Import a bounded all-sky Gaia DR3 bright-star snapshot from the official ESA TAP.

Python standard library only. No credentials, positional matching, or distance
inversion. See DATA_GAIA_DR3.md for selection, provenance and collision policy.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ENDPOINT = "https://gea.esac.esa.int/tap-server/tap/sync"
SOURCE_TABLE = "gaiadr3.gaia_source"
CROSSMATCH_TABLE = "gaiadr3.hipparcos2_best_neighbour"
MAX_BYTES = 32 * 1024 * 1024
# ESA column, application field, unit. Identifiers and booleans are handled separately.
FIELDS = [
    ("source_id", "sourceId", None), ("designation", "designation", None),
    ("ref_epoch", "refEpoch", "Julian year TCB"),
    ("ra", "raDeg", "deg"), ("dec", "decDeg", "deg"),
    ("ra_error", "raErrorMas", "mas"), ("dec_error", "decErrorMas", "mas"),
    ("parallax", "parallaxMas", "mas"), ("parallax_error", "parallaxErrorMas", "mas"),
    ("parallax_over_error", "parallaxOverError", None),
    ("pmra", "pmRaMasYr", "mas/yr"), ("pmra_error", "pmRaErrorMasYr", "mas/yr"),
    ("pmdec", "pmDecMasYr", "mas/yr"), ("pmdec_error", "pmDecErrorMasYr", "mas/yr"),
    ("radial_velocity", "radialVelocityKmS", "km/s"),
    ("radial_velocity_error", "radialVelocityErrorKmS", "km/s"),
    ("phot_g_mean_mag", "gMag", "mag (Gaia G)"),
    ("phot_bp_mean_mag", "bpMag", "mag (Gaia BP)"),
    ("phot_rp_mean_mag", "rpMag", "mag (Gaia RP)"), ("bp_rp", "bpRp", "mag"),
    ("ruwe", "ruwe", None), ("duplicated_source", "duplicatedSource", None),
    ("astrometric_params_solved", "astrometricParamsSolved", None),
    ("in_qso_candidates", "inQsoCandidates", None), ("in_galaxy_candidates", "inGalaxyCandidates", None),
]
MATCH_FIELDS = [
    ("original_ext_source_id", "hip", None),
    ("angular_distance", "angularDistanceArcsec", "arcsec"),
    ("number_of_neighbours", "numberOfNeighbours", None), ("xm_flag", "xmFlag", None),
]


def queries(max_g):
    selection = f"g.phot_g_mean_mag <= {max_g:g}"
    columns = [f"g.{field}" for field, _, _ in FIELDS]
    columns += [f"h.{field} AS hip_{field}" for field, _, _ in MATCH_FIELDS]
    query = ("SELECT " + ", ".join(columns) + f" FROM {SOURCE_TABLE} AS g "
             f"LEFT OUTER JOIN {CROSSMATCH_TABLE} AS h ON g.source_id = h.source_id "
             f"WHERE {selection} ORDER BY g.source_id, h.original_ext_source_id")
    count = f"SELECT COUNT(*) AS source_count FROM {SOURCE_TABLE} AS g WHERE {selection}"
    return query, count


def fetch(query, maxrec, timeout):
    params = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL",
                                   "FORMAT": "votable_plain", "QUERY": query, "MAXREC": maxrec})
    request = urllib.request.Request(ENDPOINT + "?" + params,
                                    headers={"User-Agent": "AetherGaiaImporter/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("ESA response exceeds the 32 MiB safety bound")
    return data


def parse_votable(raw, expected_query=None):
    """Require a complete successful TABLEDATA response, including trailing INFOs."""
    if len(raw) > MAX_BYTES:
        raise ValueError("VOTable exceeds 32 MiB")
    root = ET.fromstring(raw)
    # Namespace-independent reading also permits archived VOTable versions.
    for element in root.iter():
        element.tag = element.tag.rsplit("}", 1)[-1]
    statuses = [e.get("value", "").upper() for e in root.iter("INFO")
                if e.get("name", "").upper() == "QUERY_STATUS"]
    if not statuses or any(status != "OK" for status in statuses):
        raise ValueError(f"Incomplete or failed TAP query: {statuses}")
    reported = [e.get("value", "") for e in root.iter("INFO") if e.get("name") == "QUERY"]
    if expected_query and (not reported or reported[0].split() != expected_query.split()):
        raise ValueError("Archived response query does not match the requested selection")
    table = root.find(".//TABLE")
    if table is None or table.find("./DATA/TABLEDATA") is None:
        raise ValueError("Expected one plain VOTable TABLEDATA table")
    fields = table.findall("FIELD")
    names = [field.get("name", "").lower() for field in fields]
    if not all(names) or len(set(names)) != len(names):
        raise ValueError("Invalid or repeated VOTable field names")
    nulls = [field.find("VALUES").get("null") if field.find("VALUES") is not None else None
             for field in fields]
    rows = []
    for tr in table.findall("./DATA/TABLEDATA/TR"):
        values = [(td.text or "").strip() for td in tr.findall("TD")]
        if len(values) != len(names):
            raise ValueError("VOTable row width differs from field count")
        rows.append(dict(zip(names, [None if value == "" or value == null else value
                                    for value, null in zip(values, nulls)])))
    return rows, [{key: field.get(key) for key in ("name", "datatype", "unit", "ucd")}
                  for field in fields]


def numeric(value, integer=False):
    if value is None:
        return None
    if integer:
        if not re.fullmatch(r"-?[0-9]+", str(value)):
            raise ValueError(f"Invalid integer {value!r}")
        return int(value)
    result = float(value)
    return result if math.isfinite(result) else None


def boolean(value):
    if value is None or value == "?":
        return None
    if value.lower() in ("t", "true", "1"):
        return True
    if value.lower() in ("f", "false", "0"):
        return False
    raise ValueError(f"Invalid boolean {value!r}")


def transform(rows, expected_count, max_g):
    sources = {}
    required = {field for field, _, _ in FIELDS} | {"hip_" + field for field, _, _ in MATCH_FIELDS}
    for row in rows:
        if not required.issubset(row):
            raise ValueError("Gaia response is missing requested columns")
        source_id = row["source_id"]
        if not isinstance(source_id, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", source_id):
            raise ValueError("Gaia source_id must remain a positive decimal string")
        if int(source_id) > 2**63 - 1:
            raise ValueError("Gaia source_id exceeds signed 64-bit range")
        star = {}
        for column, name, _ in FIELDS:
            value = row[column]
            if column in ("source_id", "designation"):
                star[name] = value
            elif column in ("duplicated_source", "in_qso_candidates", "in_galaxy_candidates"):
                star[name] = boolean(value)
            else:
                star[name] = numeric(value, column == "astrometric_params_solved")
        if star["designation"] != "Gaia DR3 " + source_id:
            raise ValueError("Unexpected Gaia release or designation")
        if star["refEpoch"] != 2016.0:
            raise ValueError("Expected Gaia DR3 native epoch J2016.0")
        if star["raDeg"] is None or not 0 <= star["raDeg"] < 360:
            raise ValueError("Invalid Gaia right ascension")
        if star["decDeg"] is None or not -90 <= star["decDeg"] <= 90:
            raise ValueError("Invalid Gaia declination")
        if star["gMag"] is None or star["gMag"] > max_g:
            raise ValueError("Gaia row is outside the requested G-band selection")
        star["hipMatches"] = []
        if source_id in sources:
            previous = dict(sources[source_id], hipMatches=[])
            if previous != star:
                raise ValueError("Conflicting measurements for the same Gaia source_id")
        else:
            sources[source_id] = star
        hip = numeric(row["hip_original_ext_source_id"], integer=True)
        if hip is not None:
            match = {name: numeric(row["hip_" + field], field != "angular_distance")
                     for field, name, _ in MATCH_FIELDS}
            if hip <= 0 or match["numberOfNeighbours"] is None or match["numberOfNeighbours"] < 1:
                raise ValueError("Invalid official Hipparcos association")
            if match["xmFlag"] is None or match["xmFlag"] < 0:
                raise ValueError("Missing official cross-match quality flag")
            if match in sources[source_id]["hipMatches"]:
                raise ValueError("Duplicate official cross-match row")
            sources[source_id]["hipMatches"].append(match)
    if len(sources) != expected_count:
        raise ValueError(f"Source count mismatch: expected {expected_count}, received {len(sources)}")
    return sorted(sources.values(), key=lambda source: int(source["sourceId"]))


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-g", type=float, default=6.0, help="All-sky Gaia G magnitude upper bound (default 6)")
    parser.add_argument("--max-sources", type=int, default=20000, help="Abort if COUNT exceeds this bound; never silently truncate")
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--output", type=Path, default=Path("public/catalog/gaia-dr3.json"))
    parser.add_argument("--archive-dir", type=Path, help="Save the exact source and count VOTables for offline reproduction")
    parser.add_argument("--input", type=Path, help="Use archived sources.vot instead of network")
    parser.add_argument("--count-input", type=Path, help="Use the corresponding archived count.vot")
    args = parser.parse_args()
    if not math.isfinite(args.max_g) or not -5 <= args.max_g <= 21 or not 1 <= args.max_sources <= 100000:
        parser.error("Use a finite G limit in [-5, 21] and --max-sources in [1, 100000]")
    if bool(args.input) != bool(args.count_input):
        parser.error("Offline reproduction requires both --input and --count-input")
    query, count_query = queries(args.max_g)
    count_raw = args.count_input.read_bytes() if args.count_input else fetch(count_query, 2, args.timeout)
    count_rows, _ = parse_votable(count_raw, count_query)
    if len(count_rows) != 1 or "source_count" not in count_rows[0]:
        raise ValueError("Invalid ESA COUNT response")
    count = numeric(count_rows[0]["source_count"], integer=True)
    if count is None or not 1 <= count <= args.max_sources:
        raise ValueError(f"Selection contains {count} sources, outside the bound 1..{args.max_sources}; narrow --max-g")
    raw = args.input.read_bytes() if args.input else fetch(query, args.max_sources * 4, args.timeout)
    rows, source_columns = parse_votable(raw, query)
    stars = transform(rows, count, args.max_g)
    payload_hash = hashlib.sha256(json.dumps(stars, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    metadata = {
        "schemaVersion": 1, "catalogue": "Gaia DR3", "provider": "ESA/Gaia/DPAC",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "endpoint": ENDPOINT, "sourceTable": SOURCE_TABLE, "crossmatchTable": CROSSMATCH_TABLE,
        "selection": {"maxGMag": args.max_g, "skyCoverage": "all-sky", "sourceLimit": args.max_sources,
                      "completeForSelection": True, "completeGaiaCatalogue": False},
        "sourceCount": len(stars), "joinedRowCount": len(rows), "officialCount": count,
        "hipMatchedSourceCount": sum(bool(star["hipMatches"]) for star in stars),
        "hipAssociationCount": sum(len(star["hipMatches"]) for star in stars),
        "unmatchedSourceCount": sum(not star["hipMatches"] for star in stars),
        "coordinateFrame": "ICRS", "referenceEpoch": 2016.0, "timeScale": "TCB",
        "query": query, "countQuery": count_query,
        "verification": "Successful VOTable QUERY_STATUS and distinct-source count equal to independent ESA COUNT",
        "inputMode": "archived-votable" if args.input else "official-esa-tap",
        "sourceResponseSha256": hashlib.sha256(raw).hexdigest(),
        "countResponseSha256": hashlib.sha256(count_raw).hexdigest(), "starsSha256": payload_hash,
        "sourceColumns": source_columns,
        "units": {name: unit for _, name, unit in FIELDS if unit},
        "crossmatchUnits": {name: unit for _, name, unit in MATCH_FIELDS if unit},
        "limitations": ["Magnitude-limited browser subset, not the full Gaia DR3 catalogue or a complete inventory of bright stars.",
                        "Native Gaia measurements do not overwrite NASA/Hipparcos or Johnson V measurements.",
                        "No distance inversion or parallax zero-point correction is applied by this importer.",
                        "An official best neighbour is evidence of association, not proof of physical identity; ambiguity flags are retained."],
        "credit": "This work has made use of data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement.",
        "sourceUrl": "https://www.cosmos.esa.int/web/gaia/dr3",
        "documentationUrl": "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html",
        "crossmatchDocumentationUrl": "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_cross-matches/ssec_dm_hipparcos2_best_neighbour.html",
        "creditsUrl": "https://www.cosmos.esa.int/web/gaia-users/credits",
        "termsUrl": "https://www.cosmos.esa.int/web/esdc/terms-and-conditions"
    }
    if args.archive_dir:
        atomic_write(args.archive_dir / "sources.vot", raw)
        atomic_write(args.archive_dir / "count.vot", count_raw)
    # One source per line keeps the real data reviewable without duplicating key metadata.
    encoded = ('{"metadata":' + json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + ',"stars":[\n' +
               ',\n'.join(json.dumps(star, separators=(",", ":"), allow_nan=False) for star in stars) + '\n]}\n')
    atomic_write(args.output, encoded.encode("utf-8"))
    print(json.dumps({"output": str(args.output), "sources": len(stars), "hipMatched": metadata["hipMatchedSourceCount"],
                      "unmatched": metadata["unmatchedSourceCount"], "bytes": len(encoded.encode("utf-8")),
                      "starsSha256": payload_hash}))


if __name__ == "__main__":
    main()
