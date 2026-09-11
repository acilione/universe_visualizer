#!/usr/bin/env python3
"""Reproduce full HYG stars and 88 Stellarium figures (Python standard library)."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HYG_REVISION = 'c7f7f883fe678cc7680169a50ccd7dcc49b060ce'
HYG_PATH = 'hyg/CURRENT/hygdata_v41.csv'
HYG_URL = f'https://raw.githubusercontent.com/astronexus/HYG-Database/{HYG_REVISION}/{HYG_PATH}'
HYG_SOURCE = f'https://github.com/astronexus/HYG-Database/blob/{HYG_REVISION}/{HYG_PATH}'
HYG_SHA256 = 'd9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd'
STELLARIUM_REVISION = 'daace2add6a1bf886e8ee1934f51e9c69f818d18'
STELLARIUM_BASE = f'https://raw.githubusercontent.com/Stellarium/stellarium/{STELLARIUM_REVISION}/skycultures/modern'
STELLARIUM_SOURCE = f'https://github.com/Stellarium/stellarium/tree/{STELLARIUM_REVISION}/skycultures/modern'
FIGURES_SHA256 = '1f2f5ffd6c9e25a7d0dcfdbf1f756e2db03dd3b8ed4ec016a2839b09f6b0fe1e'
DESCRIPTION_SHA256 = '4b58344f63168d7c816fdfef405103b5770fda2e1f4a4bf5c8871041ce042586'
PARSEC_TO_LY = 3.261563777167433
LICENSE = {'id': 'CC-BY-SA-4.0', 'url': 'https://creativecommons.org/licenses/by-sa/4.0/'}
ITALIAN_NAMES = {
    'And': 'Andromeda', 'Ant': 'Macchina Pneumatica', 'Aps': 'Uccello del Paradiso',
    'Aqr': 'Acquario', 'Aql': 'Aquila', 'Ara': 'Altare', 'Ari': 'Ariete', 'Aur': 'Auriga',
    'Boo': 'Boote', 'Cae': 'Bulino', 'Cam': 'Giraffa', 'Cnc': 'Cancro', 'CVn': 'Cani da Caccia',
    'CMa': 'Cane Maggiore', 'CMi': 'Cane Minore', 'Cap': 'Capricorno', 'Car': 'Carena',
    'Cas': 'Cassiopea', 'Cen': 'Centauro', 'Cep': 'Cefeo', 'Cet': 'Balena', 'Cha': 'Camaleonte',
    'Cir': 'Compasso', 'Col': 'Colomba', 'Com': 'Chioma di Berenice', 'CrA': 'Corona Australe',
    'CrB': 'Corona Boreale', 'Crv': 'Corvo', 'Crt': 'Cratere', 'Cru': 'Croce del Sud', 'Cyg': 'Cigno',
    'Del': 'Delfino', 'Dor': 'Dorado', 'Dra': 'Drago', 'Equ': 'Cavallino', 'Eri': 'Eridano',
    'For': 'Fornace', 'Gem': 'Gemelli', 'Gru': 'Gru', 'Her': 'Ercole', 'Hor': 'Orologio',
    'Hya': 'Idra', 'Hyi': 'Idra Maschio', 'Ind': 'Indiano', 'Lac': 'Lucertola', 'Leo': 'Leone',
    'LMi': 'Leone Minore', 'Lep': 'Lepre', 'Lib': 'Bilancia', 'Lup': 'Lupo', 'Lyn': 'Lince',
    'Lyr': 'Lira', 'Men': 'Mensa', 'Mic': 'Microscopio', 'Mon': 'Unicorno', 'Mus': 'Mosca',
    'Nor': 'Regolo', 'Oct': 'Ottante', 'Oph': 'Ofiuco', 'Ori': 'Orione', 'Pav': 'Pavone',
    'Peg': 'Pegaso', 'Per': 'Perseo', 'Phe': 'Fenice', 'Pic': 'Pittore', 'Psc': 'Pesci',
    'PsA': 'Pesce Australe', 'Pup': 'Poppa', 'Pyx': 'Bussola', 'Ret': 'Reticolo',
    'Sge': 'Freccia', 'Sgr': 'Sagittario', 'Sco': 'Scorpione', 'Scl': 'Scultore',
    'Sct': 'Scudo', 'Ser': 'Serpente', 'Sex': 'Sestante', 'Tau': 'Toro', 'Tel': 'Telescopio',
    'Tri': 'Triangolo', 'TrA': 'Triangolo Australe', 'Tuc': 'Tucano', 'UMa': 'Orsa Maggiore',
    'UMi': 'Orsa Minore', 'Vel': 'Vele', 'Vir': 'Vergine', 'Vol': 'Pesce Volante', 'Vul': 'Volpetta',
}


def finite(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def download(url, expected_sha256, cache_dir, filename):
    cached = cache_dir / filename if cache_dir else None
    if cached and cached.exists():
        payload = cached.read_bytes()
    else:
        request = urllib.request.Request(url, headers={'User-Agent': 'Aether-Cosmic-Atlas-data-import/1.0'})
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = response.read()
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected_sha256:
        raise ValueError(f'Checksum mismatch for {url}: {actual}')
    if cached:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(payload)
    return payload


def write_json(filename, data):
    destination = ROOT / 'public' / 'catalog' / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    return destination.stat().st_size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, help='Optional directory for verified source downloads')
    args = parser.parse_args()
    payload = download(HYG_URL, HYG_SHA256, args.cache_dir, 'aether-hyg-v41.csv')
    figures_payload = download(f'{STELLARIUM_BASE}/index.json', FIGURES_SHA256, args.cache_dir, 'aether-modern-index.json')
    description = download(f'{STELLARIUM_BASE}/description.md', DESCRIPTION_SHA256, args.cache_dir, 'aether-modern-description.md').decode('utf-8')
    if 'Text and data: CC BY-SA 4.0' not in description:
        raise ValueError('Unexpected Stellarium data license')

    stars, excluded = [], []
    by_hip = {}
    source_count = 0
    for row in csv.DictReader(io.StringIO(payload.decode('utf-8-sig'))):
        source_count += 1
        if row['id'] == '0':
            excluded.append({'id': 'hyg-0', 'reason': 'Sun: origin, not a fixed background star'})
            continue
        ra, dec, magnitude, distance_pc, color = map(finite, (row['ra'], row['dec'], row['mag'], row['dist'], row['ci']))
        if ra is None or dec is None or magnitude is None or not 0 <= ra < 24 or not -90 <= dec <= 90:
            excluded.append({'id': f'hyg-{row["id"]}', 'reason': 'Invalid sky coordinates or visual magnitude'})
            continue
        hip = int(row['hip']) if row['hip'] else None
        name = row['proper'] or (f'HIP {hip}' if hip else '') or (f'HD {row["hd"]}' if row['hd'] else '') or row['gl'] or row['bf'].strip() or f'HYG {row["id"]}'
        # HYG explicitly defines >=100000 pc as missing or dubious parallax.
        # These entries retain their real sky direction but never an invented depth.
        distance_ly = round(distance_pc * PARSEC_TO_LY, 6) if distance_pc is not None and 0 < distance_pc < 100000 else None
        star = [f'hyg-{row["id"]}', hip, name, round(ra * 15, 6), round(dec, 6), distance_ly, magnitude, color, row['con'] or None]
        stars.append(star)
        if hip is not None:
            if hip in by_hip:
                raise ValueError(f'Duplicate HIP {hip}')
            by_hip[hip] = star
    stars.sort(key=lambda s: int(s[0][4:]))

    constellations, endpoint_hips = [], set()
    for figure in json.loads(figures_payload)['constellations']:
        abbr = figure['id'].split()[-1]
        segments, unique_segments = [], set()
        for polyline in figure['lines']:
            for first, second in zip(polyline, polyline[1:]):
                if not isinstance(first, int) or not isinstance(second, int) or first == second:
                    raise ValueError(f'Unexpected line reference in {abbr}: {first}, {second}')
                key = tuple(sorted((first, second)))
                if key not in unique_segments:
                    segments.append([first, second])
                    unique_segments.add(key)
                    endpoint_hips.update((first, second))
        constellations.append({
            'id': abbr, 'name': ITALIAN_NAMES[abbr], 'latinName': figure['common_name']['native'],
            'abbr': abbr, 'segments': segments,
        })
    constellations.sort(key=lambda c: c['id'])
    if len(constellations) != 88 or set(c['id'] for c in constellations) != set(ITALIAN_NAMES):
        raise ValueError('The complete set of 88 constellations is required')
    missing = sorted(endpoint_hips - by_hip.keys())
    if missing:
        raise ValueError(f'Constellation stars missing from HYG: {missing}')
    unknown_endpoint_distances = sorted(hip for hip in endpoint_hips if by_hip[hip][5] is None)
    unknown_distances = sum(star[5] is None for star in stars)
    star_metadata = {
        'catalog': 'HYG v4.1', 'source': HYG_SOURCE, 'revision': HYG_REVISION, 'sha256': HYG_SHA256,
        'license': LICENSE, 'attribution': 'David Nash / Astronexus, HYG Database v4.1',
        'epoch': 'J2000.0', 'equinox': 'J2000.0', 'distanceUnit': 'light-year',
        'sourceRowCount': source_count, 'count': len(stars), 'withDistanceCount': len(stars) - unknown_distances,
        'unknownDistanceCount': unknown_distances, 'excluded': excluded,
        'scope': 'All HYG v4.1 stars with valid sky coordinates and visual magnitude, excluding the Sun; not every known star in the Universe.',
        'distancePolicy': 'HYG dist >= 100000 pc, nonpositive, or nonfinite is null and only suitable for the sky view.',
        'adaptation': 'Selected columns, Italian-independent catalog identifiers, RA hours to degrees, parsecs to light-years, rounded coordinates and distances; unknown distance sentinel removed.',
    }
    figure_metadata = {
        'catalog': 'Stellarium modern skyculture', 'source': STELLARIUM_SOURCE,
        'revision': STELLARIUM_REVISION, 'sha256': FIGURES_SHA256,
        'license': LICENSE, 'attribution': "Stellarium's team; modern skyculture text and data",
        'licenseSource': f'{STELLARIUM_BASE}/description.md', 'licenseSourceSha256': DESCRIPTION_SHA256,
        'count': len(constellations), 'segmentCount': sum(len(c['segments']) for c in constellations),
        'endpointStarCount': len(endpoint_hips), 'missingHipIds': missing,
        'unknownDistanceHipIds': unknown_endpoint_distances,
        'reference': 'Hipparcos HIP identifiers matched exactly to HYG v4.1',
        'adaptation': 'Stellarium polylines expanded into unique segments; constellation names translated to Italian; no artwork or mythological descriptions copied.',
        'scope': 'Conventional stick figures for the 88 IAU constellations. The IAU defines sky regions, not an official set of connecting lines; these connections are not physical bonds.',
    }
    stars_bytes = write_json('stars.json', {
        'metadata': star_metadata,
        'columns': ['id', 'hip', 'name', 'raDeg', 'decDeg', 'distanceLy', 'mag', 'colorIndex', 'con'],
        'stars': stars,
    })
    figure_bytes = write_json('constellations.json', {'metadata': figure_metadata, 'constellations': constellations})
    print(json.dumps({'stars': len(stars), 'withDistance': len(stars) - unknown_distances,
                      'unknownDistance': unknown_distances, 'constellations': len(constellations),
                      'endpoints': len(endpoint_hips), 'missingHipIds': missing,
                      'unknownDistanceHipIds': unknown_endpoint_distances,
                      'segments': figure_metadata['segmentCount'],
                      'starsBytes': stars_bytes, 'constellationsBytes': figure_bytes}, indent=2))


if __name__ == '__main__':
    main()
