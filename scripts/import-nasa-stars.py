#!/usr/bin/env python3
"""Import complete BSC5P and Hipparcos snapshots directly from NASA HEASARC.

Python 3 standard library only. Run from any directory. Network access occurs
only in this maintenance script; the application reads the bundled JSON.
"""

import argparse
import base64
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync'
DOCUMENTATION = 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html'
# NASA explicitly identifies these HR entries as nonstellar in its table notes.
NONSTELLAR_HR = {92, 95, 182, 1057, 1841, 2472, 2496, 3515, 3671, 6309, 6515, 7189, 7539, 8296}
FIELDS = [
    ('hr', 'hr'), ('hd', 'hd'), ('sao', 'sao'), ('alt_name', 'designation'),
    ('ra', 'raDeg'), ('dec', 'decDeg'), ('vmag', 'vmag'),
    ('spect_type', 'spectralType'), ('bv_color', 'bv'),
    ('parallax', 'parallaxArcsec'), ('par_code', 'parallaxKind'),
    ('pmra', 'pmRaArcsecYr'), ('pmdec', 'pmDecArcsecYr'),
    ('var_id', 'variableId'), ('multiple', 'multiplicityFlag'),
    ('m_cnt', 'componentCount'), ('radvel', 'radialVelocityKmS'),
    ('radvel_comm', 'radialVelocityNote'), ('vmag_code', 'vmagCode'),
    ('vmag_uncert', 'vmagUncertainty'), ('bv_uncert', 'bvUncertainty'),
]
QUERY = 'SELECT ' + ', '.join(name for name, _ in FIELDS) + ' FROM bsc5p ORDER BY hr'
HIP_FIELDS = [
    ('hip_number', 'hip'), ('hd_id', 'hd'), ('ra_deg', 'raDeg'), ('dec_deg', 'decDeg'),
    ('vmag', 'vmag'), ('spect_type', 'spectralType'), ('bv_color', 'bv'),
    ('parallax', 'parallaxMas'), ('parallax_error', 'parallaxErrorMas'),
    ('pm_ra', 'pmRaMasYr'), ('pm_dec', 'pmDecMasYr'),
    ('pm_ra_error', 'pmRaErrorMasYr'), ('pm_dec_error', 'pmDecErrorMasYr'),
    ('var_flag', 'variabilityFlag'), ('hip_var_type', 'variabilityType'),
    ('var_period', 'variabilityPeriodDays'), ('dbl_mult_annex', 'multiplicityFlag'),
    ('ccdm_n_comp', 'componentCount'),
]
HIP_QUERY = 'SELECT ' + ', '.join(name for name, _ in HIP_FIELDS) + ' FROM hipparcos ORDER BY hip_number'
HIP_PAGE_QUERIES = [HIP_QUERY.replace(' ORDER BY hip_number', f' WHERE {condition} ORDER BY hip_number') for condition in (
    'hip_number <= 40000', 'hip_number > 40000 AND hip_number <= 80000', 'hip_number > 80000')]


NS = {'v': 'http://www.ivoa.net/xml/VOTable/v1.3'}


def decode_votable(payload):
    """Decode NASA's VOTable BINARY or TABLEDATA representation.

    Null sentinels and NaN values become JSON null, never zero. Refuse query
    errors and truncation before writing a snapshot.
    """
    root = ET.fromstring(payload)
    statuses = root.findall('.//v:INFO[@name="QUERY_STATUS"]', NS)
    if not statuses or any(info.get('value') != 'OK' for info in statuses):
        raise ValueError('NASA query did not finish successfully: ' + '; '.join(
            f'{info.get("value")}: {info.text}' for info in statuses))
    table = root.find('.//v:TABLE', NS)
    if table is None:
        raise ValueError('NASA response has no data table')
    fields = table.findall('v:FIELD', NS)
    metadata = []
    for field in fields:
        value = field.find('v:VALUES', NS)
        description = field.find('v:DESCRIPTION', NS)
        metadata.append({
            'name': field.get('name'), 'datatype': field.get('datatype'),
            'arraysize': field.get('arraysize'), 'unit': field.get('unit'),
            'precision': field.get('precision'),
            'null': value.get('null') if value is not None else None,
            'description': description.text.strip() if description is not None and description.text else '',
        })

    def normalize(value, field):
        if value is None or value == '' or str(value) == field['null']:
            return None
        if isinstance(value, float):
            if not math.isfinite(value):
                return None
            precision = field['precision']
            if precision and precision.startswith('F'):
                value = round(value, int(precision[1:]))
        return value.strip() or None if isinstance(value, str) else value

    tabledata = table.find('v:DATA/v:TABLEDATA', NS)
    if tabledata is not None:
        rows = []
        for tr in tabledata.findall('v:TR', NS):
            cells = tr.findall('v:TD', NS)
            if len(cells) != len(fields):
                raise ValueError('Unexpected VOTable row width')
            row = {}
            for cell, field in zip(cells, metadata):
                raw = (cell.text or '').strip()
                if raw and field['datatype'] in ('short', 'int', 'long'):
                    raw = int(raw)
                elif raw and field['datatype'] in ('float', 'double'):
                    raw = float(raw)
                row[field['name']] = normalize(raw, field)
            rows.append(row)
        return rows, metadata

    stream = table.find('v:DATA/v:BINARY/v:STREAM', NS)
    if stream is None or stream.get('encoding') != 'base64':
        raise ValueError('Expected inline base64 VOTable BINARY or TABLEDATA')
    data = base64.b64decode(''.join((stream.text or '').split()), validate=True)
    offset = 0
    rows = []
    formats = {'short': '>h', 'int': '>i', 'long': '>q', 'float': '>f', 'double': '>d', 'unsignedByte': '>B'}
    while offset < len(data):
        row = {}
        for field in metadata:
            if field['datatype'] == 'char':
                if field['arraysize'] == '*':
                    length = struct.unpack_from('>i', data, offset)[0]
                    offset += 4
                else:
                    length = int(field['arraysize'] or 1)
                if length < 0 or offset + length > len(data):
                    raise ValueError('Invalid VOTable string length')
                value = data[offset:offset + length].decode('ascii')
                offset += length
            else:
                if field['arraysize'] not in (None, '1') or field['datatype'] not in formats:
                    raise ValueError(f'Unsupported VOTable field {field}')
                fmt = formats[field['datatype']]
                value = struct.unpack_from(fmt, data, offset)[0]
                offset += struct.calcsize(fmt)
            row[field['name']] = normalize(value, field)
        rows.append(row)
    if offset != len(data):
        raise ValueError('Truncated NASA binary table')
    return rows, metadata


def make_bsc_snapshot(payload):
    records, nasa_fields = decode_votable(payload)
    if len(records) != 9110:
        raise ValueError(f'Expected the complete 9110-entry BSC5P table, received {len(records)}')
    if {row['hr'] for row in records} != set(range(1, 9111)):
        raise ValueError('Missing, duplicate or unexpected HR identifiers')
    stars = []
    for row in records:
        if row['hr'] in NONSTELLAR_HR:
            continue
        if not isinstance(row['ra'], (int, float)) or not 0 <= row['ra'] < 360:
            raise ValueError(f'Invalid right ascension for HR {row["hr"]}')
        if not isinstance(row['dec'], (int, float)) or not -90 <= row['dec'] <= 90:
            raise ValueError(f'Invalid declination for HR {row["hr"]}')
        stars.append([row[name] for name, _ in FIELDS])
    stars.sort(key=lambda row: row[0])
    source_fields = {field['name']: field for field in nasa_fields}
    columns = [alias for _, alias in FIELDS]
    return {
        'version': 1,
        'metadata': {
            'archive': 'NASA HEASARC', 'table': 'bsc5p',
            'title': 'Bright Star Catalog, 5th Revised Edition (Preliminary Version)',
            'authors': 'D. Hoffleit and W. H. Warren Jr. (1991)',
            'provenance': 'Yale Bright Star Catalog hosted and maintained by NASA HEASARC; not a NASA observing mission.',
            'url': DOCUMENTATION, 'endpoint': ENDPOINT, 'query': QUERY,
            'queryUrl': ENDPOINT + '?' + urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'MAXREC': 20000, 'QUERY': QUERY}),
            'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'sha256': hashlib.sha256(payload).hexdigest(),
            'sourceCount': len(records), 'count': len(stars),
            'excludedNonstellarHr': sorted(NONSTELLAR_HR),
            'coordinateFrame': 'Equatorial FK5, equinox J2000.0',
            'scope': 'Complete stellar subset of BSC5P, predominantly stars brighter than apparent magnitude 6.5; not a catalogue of every known star.',
            'distancePolicy': 'Raw parallax is preserved. BSC5P provides no parallax uncertainty here; no distance is inferred in this snapshot. D denotes a dynamical parallax; blank denotes trigonometric when a parallax is present.',
            'photometryPolicy': 'vmag preserves the catalogue value and its code. R denotes reduced HR photometry; H denotes original HR photometry. Uncertainty flags are retained.',
            'missingValue': 'null; zero and negative parallax measurements are retained as recorded, not treated as valid distances',
        },
        'columns': columns,
        'units': {
            'raDeg': 'deg', 'decDeg': 'deg', 'vmag': 'mag', 'bv': 'mag',
            'parallaxArcsec': 'arcsec', 'pmRaArcsecYr': 'arcsec/yr',
            'pmDecArcsecYr': 'arcsec/yr', 'radialVelocityKmS': 'km/s',
        },
        'fieldDescriptions': {alias: source_fields[name]['description'] for name, alias in FIELDS},
        'stars': stars,
    }


def make_hip_snapshot(payload):
    # NASA applies a hard row limit even when MAXREC requests a larger number.
    # Three disjoint key ranges retrieve the complete catalogue without relying
    # on an unspecified server row order or accepting an OVERFLOW response.
    bundle = json.loads(payload)
    if bundle.get('format') != 'NASA-HEASARC-VOTable-bundle-1':
        raise ValueError('Expected an archived NASA Hipparcos VOTable bundle')
    records = []
    nasa_fields = None
    pages = []
    if [page['query'] for page in bundle['pages']] != HIP_PAGE_QUERIES:
        raise ValueError('Unexpected Hipparcos page queries')
    for page in bundle['pages']:
        raw = base64.b64decode(page['votable'], validate=True)
        page_records, fields = decode_votable(raw)
        if nasa_fields is not None and fields != nasa_fields:
            raise ValueError('NASA field schema changed between Hipparcos pages')
        nasa_fields = fields
        records.extend(page_records)
        pages.append({'query': page['query'], 'url': page['url'], 'count': len(page_records), 'sha256': hashlib.sha256(raw).hexdigest()})

    if len(records) != 118218:
        raise ValueError(f'Expected complete 118218-entry Hipparcos table, received {len(records)}')
    identifiers = [row['hip_number'] for row in records]
    if len(set(identifiers)) != len(records) or not all(isinstance(value, int) and value > 0 for value in identifiers):
        raise ValueError('Missing, duplicate or invalid HIP identifiers')
    fallback_page = bundle.get('coordinateFallback')
    fallback_positions = {}
    fallback_metadata = None
    if fallback_page:
        fallback_raw = base64.b64decode(fallback_page['votable'], validate=True)
        fallback_records, _ = decode_votable(fallback_raw)
        fallback_positions = {row['hip_number']: row for row in fallback_records}
        if len(fallback_positions) != len(fallback_records):
            raise ValueError('Duplicate coordinate fallback records')
        fallback_metadata = {'query': fallback_page['query'], 'url': fallback_page['url'], 'count': len(fallback_records), 'sha256': hashlib.sha256(fallback_raw).hexdigest()}
    stars = []
    missing_positions = []
    missing_precise_positions = []
    rounded_positions = []
    for row in records:
        for field in ('ra_deg', 'dec_deg'):
            if row[field] is not None:
                row[field] = float(row[field])
        if row['ra_deg'] is not None and not 0 <= row['ra_deg'] < 360:
            raise ValueError(f'Invalid RA for HIP {row["hip_number"]}')
        if row['dec_deg'] is not None and not -90 <= row['dec_deg'] <= 90:
            raise ValueError(f'Invalid Dec for HIP {row["hip_number"]}')
        precision = 'precise'
        if row['ra_deg'] is None or row['dec_deg'] is None:
            missing_precise_positions.append(row['hip_number'])
            fallback = fallback_positions.get(row['hip_number'])
            if fallback is not None and fallback['ra'] is not None and fallback['dec'] is not None:
                if not 0 <= fallback['ra'] < 360 or not -90 <= fallback['dec'] <= 90:
                    raise ValueError('Invalid rounded NASA coordinate')
                row['ra_deg'], row['dec_deg'] = fallback['ra'], fallback['dec']
                rounded_positions.append(row['hip_number'])
                precision = 'rounded'
            else:
                missing_positions.append(row['hip_number'])
                precision = None
        stars.append([row[name] for name, _ in HIP_FIELDS] + [precision])
    if set(fallback_positions) != set(missing_precise_positions):
        raise ValueError('NASA coordinate fallback response does not cover the exact missing-precision subset')
    stars.sort(key=lambda row: row[0])
    source_fields = {field['name']: field for field in nasa_fields}
    return {
        'version': 1,
        'metadata': {
            'archive': 'NASA HEASARC', 'table': 'hipparcos',
            'title': 'Hipparcos Main Catalog', 'authors': 'ESA (1997), SP-1200',
            'provenance': 'ESA Hipparcos mission catalogue hosted by NASA HEASARC; not a NASA observing mission.',
            'url': 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/hipparcos.html',
            'endpoint': ENDPOINT, 'query': HIP_QUERY,
            'queryUrl': ENDPOINT + '?' + urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'MAXREC': 200000, 'QUERY': HIP_QUERY}),
            'retrievedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'sha256': hashlib.sha256(payload).hexdigest(),
            'sourceCount': len(records), 'count': len(stars),
            'requests': pages, 'coordinateFallbackRequest': fallback_metadata,
            'coordinateFrame': 'ICRS (J2000 equator), epoch J1991.25', 'coordinateEpoch': 1991.25,
            'coordinatePolicy': 'Precise source ra_deg/dec_deg where available, otherwise the same NASA table rounded ra/dec columns (original precision 0.01 s of RA time and 0.1 arcsec of declination), marked positionPrecision=rounded. All positions remain at J1991.25; missing positions remain null.',
            'missingPrecisePositionHipIds': sorted(missing_precise_positions),
            'roundedPositionHipIds': sorted(rounded_positions),
            'missingPositionHipIds': sorted(missing_positions),
            'properMotionConvention': 'pmRaMasYr is mu_alpha*cos(delta); both components and their standard errors are in mas per Julian year.',
            'scope': 'Complete 118218-row Hipparcos Main Catalog; not a catalogue of every known star.',
            'distancePolicy': 'Raw trigonometric parallax and its standard error are retained, including insignificant, zero and negative measurements. No distance is inferred in this snapshot.',
            'photometryPolicy': 'vmag is Johnson V; bv is the Johnson B-V colour. Not every catalogue field is populated for every star.',
            'missingValue': 'null; measured zero and negative values remain numeric',
        },
        'columns': [alias for _, alias in HIP_FIELDS] + ['positionPrecision'],
        'units': {'raDeg': 'deg', 'decDeg': 'deg', 'vmag': 'mag', 'bv': 'mag',
                  'parallaxMas': 'mas', 'parallaxErrorMas': 'mas', 'pmRaMasYr': 'mas/yr',
                  'pmDecMasYr': 'mas/yr', 'pmRaErrorMasYr': 'mas/yr', 'pmDecErrorMasYr': 'mas/yr',
                  'variabilityPeriodDays': 'd'},
        'fieldDescriptions': {**{alias: source_fields[name]['description'] for name, alias in HIP_FIELDS}, 'positionPrecision': 'precise = NASA ra_deg/dec_deg; rounded = NASA ra/dec fallback; null = no position'},
        'stars': stars,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', choices=('bsc5p', 'hipparcos', 'all'), default='all')
    parser.add_argument('--input', type=Path, help='Read an archived NASA VOTable or Hipparcos VOTable bundle (requires one --catalog)')
    parser.add_argument('--raw-output', type=Path, help='Retain the downloaded VOTable or Hipparcos VOTable bundle (requires one --catalog)')
    parser.add_argument('--output', type=Path, help='Custom JSON destination (requires one --catalog)')
    args = parser.parse_args()
    if args.catalog == 'all' and (args.input or args.raw_output or args.output):
        parser.error('--input, --raw-output and --output require a single --catalog')
    catalogs = ('bsc5p', 'hipparcos') if args.catalog == 'all' else (args.catalog,)
    for catalog in catalogs:
        is_hip = catalog == 'hipparcos'
        query = HIP_QUERY if is_hip else QUERY
        if args.input:
            payload = args.input.read_bytes()
        else:
            pages = []
            missing_precise = []
            for page_query in HIP_PAGE_QUERIES if is_hip else (query,):
                url = ENDPOINT + '?' + urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'MAXREC': 50000 if is_hip else 20000, 'QUERY': page_query})
                request = urllib.request.Request(url, headers={'User-Agent': 'AetherCosmicAtlas-CatalogImporter/1.0'})
                with urllib.request.urlopen(request, timeout=120) as response:
                    raw = response.read()
                # Validate each response immediately, before requesting another.
                decoded, _ = decode_votable(raw)
                if is_hip:
                    missing_precise.extend(row['hip_number'] for row in decoded if row['ra_deg'] is None or row['dec_deg'] is None)
                print(f'{catalog}: downloaded {len(decoded)} rows', flush=True)
                pages.append({'query': page_query, 'url': url, 'votable': base64.b64encode(raw).decode('ascii')})
            if is_hip:
                bundle = {'format': 'NASA-HEASARC-VOTable-bundle-1', 'pages': pages}
                if missing_precise:
                    fallback_query = 'SELECT hip_number, ra, dec FROM hipparcos WHERE hip_number IN (' + ','.join(str(hip) for hip in sorted(missing_precise)) + ') ORDER BY hip_number'
                    url = ENDPOINT + '?' + urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'MAXREC': 1000, 'QUERY': fallback_query})
                    request = urllib.request.Request(url, headers={'User-Agent': 'AetherCosmicAtlas-CatalogImporter/1.0'})
                    with urllib.request.urlopen(request, timeout=120) as response:
                        fallback_raw = response.read()
                    decode_votable(fallback_raw)
                    bundle['coordinateFallback'] = {'query': fallback_query, 'url': url, 'votable': base64.b64encode(fallback_raw).decode('ascii')}
                payload = json.dumps(bundle, separators=(',', ':')).encode('utf-8')
            else:
                payload = raw
        snapshot = make_hip_snapshot(payload) if is_hip else make_bsc_snapshot(payload)
        output = args.output or ROOT / ('public/catalog/nasa-hipparcos.json' if is_hip else 'public/catalog/nasa-stars.json')
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(snapshot, ensure_ascii=True, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
        if args.raw_output:
            args.raw_output.write_bytes(payload)
        print(f'Imported {snapshot["metadata"]["count"]} entries from NASA HEASARC {catalog} -> {output}')
        print(f'SHA-256: {snapshot["metadata"]["sha256"]}')


if __name__ == '__main__':
    main()
