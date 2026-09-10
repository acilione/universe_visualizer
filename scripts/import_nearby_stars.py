#!/usr/bin/env python3
"""Reproduce nearby-stars.json from a pinned public HYG 4.1 CSV (Python stdlib only)."""
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request

REVISION = 'c7f7f883fe678cc7680169a50ccd7dcc49b060ce'
REPOSITORY = 'https://github.com/astronexus/HYG-Database'
CATALOG_PATH = 'hyg/CURRENT/hygdata_v41.csv'
DOWNLOAD_URL = f'https://raw.githubusercontent.com/astronexus/HYG-Database/{REVISION}/{CATALOG_PATH}'
SOURCE_URL = f'{REPOSITORY}/blob/{REVISION}/{CATALOG_PATH}'
EXPECTED_SHA256 = 'd9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd'
PARSEC_TO_LY = 3.261563777167433
MAX_DISTANCE_LY = 25
# These stars/systems already have curated entries in src/data.js.
CURATED_HIP = {'70890', '71683', '71681', '87937', '32349', '16537', '37279', '8102', '91262'}
CURATED_GL = {'Gl551', 'Gl559', 'Gl699', 'Gl244', 'Gl144', 'Gl280', 'Gl71', 'Gl721'}
CURATED_NAMES = {'sol', 'sun', 'proxima centauri', "barnard's star", 'sirius', 'procyon', 'vega', 'rigil kentaurus', 'toliman', 'ran'}
ROOT = Path(__file__).resolve().parents[1]


def finite(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def system_id(gl):
    # Remove spaces and component suffix, retaining decimal catalog numbers.
    return gl.replace(' ', '').rstrip('ABCDEFGHIJKLMNOPQRSTUVWXYZ')


def main():
    request = urllib.request.Request(DOWNLOAD_URL, headers={'User-Agent': 'Aether-Cosmic-Atlas-data-import/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = response.read()
    if hashlib.sha256(payload).hexdigest() != EXPECTED_SHA256:
        raise ValueError('Pinned HYG source checksum does not match')
    rows = csv.DictReader(io.StringIO(payload.decode('utf-8-sig')))
    stars, excluded = [], []
    ids = set()
    for row in rows:
        distance_pc, ra, dec, magnitude = map(finite, (row['dist'], row['ra'], row['dec'], row['mag']))
        if distance_pc is None or not 0 < distance_pc * PARSEC_TO_LY <= MAX_DISTANCE_LY:
            continue
        if ra is None or dec is None or magnitude is None or not 0 <= ra < 24 or not -90 <= dec <= 90:
            raise ValueError(f'Invalid astrometry for HYG {row["id"]}')
        if row['hip'] in CURATED_HIP or system_id(row['gl']) in CURATED_GL or row['proper'].casefold() in CURATED_NAMES:
            excluded.append({'hygId': row['id'], 'hip': row['hip'], 'gl': row['gl'], 'name': row['proper']})
            continue
        identifier = f'hyg-{row["id"]}'
        if identifier in ids:
            raise ValueError(f'Duplicate source id {identifier}')
        ids.add(identifier)
        name = row['proper'] or row['gl'] or (f'HIP {row["hip"]}' if row['hip'] else '') or row['bf'].strip() or identifier.upper()
        stars.append({
            'id': identifier,
            'name': name,
            'raDeg': round(ra * 15, 9),
            'decDeg': dec,
            'distanceLy': round(distance_pc * PARSEC_TO_LY, 9),
            'mag': magnitude,
            'hip': row['hip'] or None,
            'gl': row['gl'] or None,
            'spectralType': row['spect'] or None,
            'sourceDistancePc': distance_pc,
            'sourceId': f'HYG v4.1 #{row["id"]}',
            'source': SOURCE_URL,
        })
    stars.sort(key=lambda star: (star['distanceLy'], star['id']))
    if len(stars) < 30:
        raise ValueError(f'Unexpectedly small subset: {len(stars)}')
    destination = ROOT / 'src' / 'nearby-stars.json'
    destination.write_text(json.dumps(stars, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'count': len(stars), 'sha256': hashlib.sha256(payload).hexdigest(), 'source': DOWNLOAD_URL, 'excluded': excluded}, indent=2))


if __name__ == '__main__':
    main()

