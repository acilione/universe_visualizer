#!/usr/bin/env python3
"""Import the complete NASA HEASARC NGC2000 nebula subset (standard library only)."""
import base64
import collections
import datetime
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync"
SOURCE_URL = "https://heasarc.gsfc.nasa.gov/W3Browse/all/ngc2000.html"
QUERY = "SELECT name,source_type,ra,dec,constellation,limit_ang_diameter,ang_diameter,app_mag,app_mag_flag FROM ngc2000 WHERE source_type IN ('Nb','Pl','C+N','Kt') ORDER BY name"
COLUMNS = ["id", "name", "aliases", "raDeg", "decDeg", "type", "constellation", "mag", "magnitudeBand", "angularSizeArcmin", "angularSizeIsUpperLimit", "distanceLy", "detailEn", "detailIt", "infoUrl", "sourceCode", "commonNameEn", "commonNameIt"]
TYPES = {"Nb": "nebula", "Pl": "planetary", "C+N": "cluster-nebula", "Kt": "extragalactic-nebula"}
SUPPLEMENTS = {
    "NGC 1976": {
        "commonNameEn": "Orion Nebula",
        "commonNameIt": "Nebulosa di Orione",
        "aliases": [
            "M42",
            "Messier 42",
            "Orion Nebula",
            "Nebulosa di Orione"
        ],
        "distanceLy": 1300,
        "detailEn": "An active star-forming region in Orion. Hubble observations resolve young stars, brown dwarfs and circumstellar discs within its gas and dust.",
        "detailIt": "Regione di formazione stellare in Orione. Le osservazioni di Hubble distinguono stelle giovani, nane brune e dischi circumstellari nel gas e nella polvere.",
        "infoUrl": "https://science.nasa.gov/asset/hubble/orion-nebula-3/"
    },
    "NGC 1952": {
        "commonNameEn": "Crab Nebula",
        "commonNameIt": "Nebulosa del Granchio",
        "aliases": [
            "M1",
            "Messier 1",
            "Crab Nebula",
            "Nebulosa del Granchio"
        ],
        "distanceLy": 6500,
        "type": "supernova-remnant",
        "detailEn": "The expanding remnant of the supernova observed in 1054. A rapidly rotating neutron star, the Crab pulsar, powers emission inside the ejecta.",
        "detailIt": "Resto in espansione della supernova osservata nel 1054. Una stella di neutroni in rapida rotazione, la pulsar del Granchio, alimenta l'emissione nel materiale espulso.",
        "infoUrl": "https://science.nasa.gov/asset/hubble/multiwavelength-crab-nebula/"
    },
    "NGC 6523": {
        "commonNameEn": "Lagoon Nebula",
        "commonNameIt": "Nebulosa Laguna",
        "aliases": [
            "M8",
            "Messier 8",
            "Lagoon Nebula",
            "Nebulosa Laguna"
        ],
        "distanceLy": 5200,
        "detailEn": "A star-forming emission nebula in Sagittarius. Ultraviolet radiation from young, massive stars ionizes the surrounding gas.",
        "detailIt": "Nebulosa a emissione con formazione stellare nel Sagittario. La radiazione ultravioletta di stelle giovani e massicce ionizza il gas circostante.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-8/",
        "aliasSourceUrl": "https://science.nasa.gov/photojournal/wise-catches-the-lagoon-nebula-in-center-of-action/"
    },
    "NGC 6611": {
        "commonNameEn": "Eagle Nebula and cluster",
        "commonNameIt": "Nebulosa Aquila e ammasso",
        "aliases": [
            "M16",
            "Messier 16",
            "Eagle Nebula",
            "Nebulosa Aquila",
            "IC 4703"
        ],
        "distanceLy": 7000,
        "detailEn": "M16 includes the open cluster NGC 6611 and the associated emission nebula IC 4703. Dense gas and dust in the Pillars of Creation contain forming stars.",
        "detailIt": "M16 comprende l'ammasso aperto NGC 6611 e la nebulosa a emissione IC 4703. Il gas e la polvere densi dei Pilastri della Creazione ospitano stelle in formazione.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-16/"
    },
    "NGC 6618": {
        "commonNameEn": "Omega Nebula",
        "commonNameIt": "Nebulosa Omega",
        "aliases": [
            "M17",
            "Messier 17",
            "Omega Nebula",
            "Swan Nebula",
            "Nebulosa Omega",
            "Nebulosa Cigno"
        ],
        "distanceLy": 5500,
        "detailEn": "A large star-forming region in Sagittarius with an embedded young cluster. Radiation from its massive stars erodes nearby clouds of gas.",
        "detailIt": "Vasta regione di formazione stellare nel Sagittario con un giovane ammasso al suo interno. La radiazione delle stelle massicce erode le nubi di gas vicine.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-17/",
        "aliasSourceUrl": "https://science.nasa.gov/wp-content/uploads/2023/09/Astrophotography_Guide.pdf"
    },
    "NGC 6514": {
        "commonNameEn": "Trifid Nebula",
        "commonNameIt": "Nebulosa Trifida",
        "aliases": [
            "M20",
            "Messier 20",
            "Trifid Nebula",
            "Nebulosa Trifida"
        ],
        "distanceLy": 5000,
        "detailEn": "A star-forming nebula in Sagittarius crossed by three prominent dust lanes. Radiation from its young stars reshapes the surrounding clouds.",
        "detailIt": "Nebulosa con formazione stellare nel Sagittario, attraversata da tre evidenti bande di polvere. La radiazione delle stelle giovani modifica le nubi circostanti.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-20/",
        "aliasSourceUrl": "https://science.nasa.gov/asset/hubble/the-heart-of-the-trifid-nebula-messier-20ngc-6514/"
    },
    "NGC 6720": {
        "commonNameEn": "Ring Nebula",
        "commonNameIt": "Nebulosa Anello",
        "aliases": [
            "M57",
            "Messier 57",
            "Ring Nebula",
            "Nebulosa Anello"
        ],
        "distanceLy": 2500,
        "detailEn": "A planetary nebula in Lyra formed from the outer layers expelled by an evolving star. Webb observations resolve molecular-hydrogen globules and concentric outer structures.",
        "detailIt": "Nebulosa planetaria nella Lira, formata dagli strati esterni espulsi da una stella evoluta. Le osservazioni di Webb distinguono globuli di idrogeno molecolare e strutture esterne concentriche.",
        "infoUrl": "https://science.nasa.gov/asset/webb/ring-nebula-miri-image/"
    },
    "NGC 6853": {
        "commonNameEn": "Dumbbell Nebula",
        "commonNameIt": "Nebulosa Manubrio",
        "aliases": [
            "M27",
            "Messier 27",
            "Dumbbell Nebula",
            "Nebulosa Manubrio"
        ],
        "distanceLy": 1200,
        "detailEn": "A planetary nebula in Vulpecula formed when an aging star expelled its outer layers. Dense knots of gas and dust persist inside the expanding nebula.",
        "detailIt": "Nebulosa planetaria nella Volpetta, formata dall'espulsione degli strati esterni di una stella evoluta. Densi nodi di gas e polvere persistono nella nebulosa in espansione.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-27/",
        "aliasSourceUrl": "https://science.nasa.gov/asset/hubble/close-up-of-m27-the-dumbbell-nebula/"
    },
    "NGC 7293": {
        "commonNameEn": "Helix Nebula",
        "commonNameIt": "Nebulosa Elica",
        "aliases": [
            "C63",
            "Caldwell 63",
            "Helix Nebula",
            "Nebulosa Elica"
        ],
        "distanceLy": 650,
        "detailEn": "A nearby planetary nebula in Aquarius surrounding a white dwarf. The bright ring spans nearly three light-years and contains dense, comet-shaped knots.",
        "detailIt": "Nebulosa planetaria vicina, nell'Acquario, attorno a una nana bianca. L'anello luminoso si estende per quasi tre anni luce e contiene nodi densi dalla forma cometaria.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-63/"
    },
    "NGC 6543": {
        "commonNameEn": "Cat's Eye Nebula",
        "commonNameIt": "Nebulosa Occhio di Gatto",
        "aliases": [
            "C6",
            "Caldwell 6",
            "Cat's Eye Nebula",
            "Cats Eye Nebula",
            "Nebulosa Occhio di Gatto"
        ],
        "distanceLy": 3000,
        "detailEn": "A planetary nebula in Draco with multiple shells, jets and dense gas knots. Its structures record successive episodes of mass loss from the central star.",
        "detailIt": "Nebulosa planetaria nel Dragone con gusci multipli, getti e densi nodi di gas. Le strutture registrano successivi episodi di perdita di massa della stella centrale.",
        "infoUrl": "https://science.nasa.gov/asset/hubble/cats-eye-nebula/",
        "aliasSourceUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-6/"
    },
    "NGC 3372": {
        "commonNameEn": "Carina Nebula",
        "commonNameIt": "Nebulosa della Carena",
        "aliases": [
            "C92",
            "Caldwell 92",
            "Carina Nebula",
            "Nebulosa della Carena"
        ],
        "distanceLy": 7500,
        "detailEn": "A massive star-forming complex in Carina. Winds and ultraviolet radiation from its hot stars reshape the surrounding gas and dust.",
        "detailIt": "Massiccio complesso di formazione stellare nella Carena. I venti e la radiazione ultravioletta delle stelle calde modificano il gas e la polvere circostanti.",
        "infoUrl": "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-92/"
    }
}


def parse_votable(payload):
    """Decode NASA TAP TABLEDATA or BINARY, rejecting errors and overflow."""
    root = ET.fromstring(payload)
    for info in root.findall(".//{*}INFO"):
        if info.get("name") == "QUERY_STATUS" and info.get("value") not in ("OK", None):
            raise ValueError(f"NASA query failed: {info.get('value')} {info.text}")
    fields = root.findall(".//{*}TABLE/{*}FIELD")
    if not fields:
        raise ValueError("NASA response contains no fields")
    def convert(value, field):
        if field.get("datatype") in ("char", "unicodeChar"):
            return value.strip() if value else None
        if value is None or value == "":
            return None
        value = float(value)
        null = field.find("{*}VALUES")
        if not math.isfinite(value) or (null is not None and value == float(null.get("null", "nan"))):
            return None
        return value
    tabledata = root.find(".//{*}TABLEDATA")
    if tabledata is not None:
        return [{field.get("name"): convert(cell.text, field) for field, cell in zip(fields, row)} for row in tabledata]
    stream = root.find(".//{*}BINARY/{*}STREAM")
    if stream is None or stream.get("encoding") != "base64":
        raise ValueError("NASA response uses an unsupported VOTable encoding")
    data = base64.b64decode(stream.text or "")
    offset = 0
    records = []
    while offset < len(data):
        row = {}
        for field in fields:
            kind = field.get("datatype")
            if kind == "char":
                if field.get("arraysize") == "*":
                    length = struct.unpack_from(">i", data, offset)[0]
                    offset += 4
                else:
                    length = int(field.get("arraysize", "1"))
                if length < 0 or offset + length > len(data):
                    raise ValueError("Invalid VOTable string length")
                value = data[offset:offset+length].decode("utf-8").rstrip("\0")
                offset += length
            else:
                formats = {"double": ">d", "float": ">f", "short": ">h", "int": ">i", "long": ">q"}
                if kind not in formats or field.get("arraysize") not in (None, "1"):
                    raise ValueError(f"Unsupported VOTable field: {field.attrib}")
                fmt = formats[kind]
                value = struct.unpack_from(fmt, data, offset)[0]
                offset += struct.calcsize(fmt)
            row[field.get("name")] = convert(value, field)
        records.append(row)
    return records


def build_snapshot(records, payload):
    objects = []
    for record in records:
        name = record["name"]
        source_code = record["source_type"]
        ra = record["ra"]
        dec = record["dec"]
        if source_code not in TYPES or ra is None or dec is None or not 0 <= ra < 360 or not -90 <= dec <= 90:
            raise ValueError(f"Invalid NASA record: {record}")
        supplement = SUPPLEMENTS.get(name, {})
        mag = record["app_mag"]
        angular_size = record["ang_diameter"]
        objects.append([
            name.lower().replace(" ", "-"), name, supplement.get("aliases", []),
            round(ra, 6), round(dec, 6), supplement.get("type", TYPES[source_code]), record["constellation"],
            round(mag, 2) if mag is not None else None,
            ("photographic-blue" if record["app_mag_flag"] == "p" else "visual") if mag is not None else None,
            round(angular_size, 3) if angular_size is not None else None, record["limit_ang_diameter"] == "<",
            supplement.get("distanceLy"), supplement.get("detailEn"), supplement.get("detailIt"),
            supplement.get("infoUrl", SOURCE_URL), source_code, supplement.get("commonNameEn"), supplement.get("commonNameIt")
        ])
    ids = [row[0] for row in objects]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate NASA catalogue identifiers")
    return {
        "metadata": {
            "catalogue": "NASA HEASARC NGC2000.0: nebulae and nebular regions",
            "provider": "NASA/GSFC HEASARC",
            "sourceUrl": SOURCE_URL,
            "endpoint": ENDPOINT,
            "query": QUERY,
            "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "sourceUpdated": "2022-09",
            "coordinateFrame": "Equatorial J2000",
            "coordinateEquinox": "J2000.0",
            "positionPrecision": {"raTimeMinutes": 0.1, "decArcmin": 1},
            "count": len(objects),
            "sourceTypeCounts": dict(sorted(collections.Counter(row[15] for row in objects).items())),
            "typeCounts": dict(sorted(collections.Counter(row[5] for row in objects).items())),
            "units": {"raDeg": "degree", "decDeg": "degree", "mag": "magnitude", "angularSizeArcmin": "arcminute", "distanceLy": "light-year"},
            "distanceMethod": "No distances in NGC2000. Approximate published NASA object-page distances supplement selected objects; all remaining distances are null.",
            "sourceResponseSha256": hashlib.sha256(payload).hexdigest(),
            "supplementSources": {name: {"infoUrl": item["infoUrl"], "aliasSourceUrl": item.get("aliasSourceUrl", item["infoUrl"])} for name, item in SUPPLEMENTS.items()},
            "attribution": "NGC 2000.0, R. W. Sinnott (ed.), 1988, Sky Publishing Corporation and Cambridge University Press. NASA HEASARC distribution based on CDS VII/118.",
            "dataUseNotice": "The original catalogue is copyrighted by Sky Publishing Corporation and is archived for scientific research. Commercial use requires permission from Sky Publishing Corporation; see the NASA catalogue documentation.",
            "notes": "Includes every record classified Nb, Pl, C+N or Kt. These are catalogue entries, including subregions and historical classifications, not a claim to list all known nebulae. No telescope images are included."
        },
        "columns": COLUMNS,
        "objects": objects
    }


def main():
    params = {"REQUEST": "doQuery", "LANG": "ADQL", "QUERY": QUERY, "FORMAT": "votable", "MAXREC": 20000}
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "AetherCosmicAtlas/1.0 (scientific catalogue import)"})
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = response.read()
    snapshot = build_snapshot(parse_votable(payload), payload)
    if snapshot["metadata"]["count"] < 200:
        raise ValueError("NASA nebula subset unexpectedly small; preserving existing snapshot")
    path = ROOT / "public/catalog/nasa-nebulae.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)
    print(json.dumps(snapshot["metadata"], indent=2))


if __name__ == "__main__":
    main()
