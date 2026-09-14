import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function python(body) {
  const result = spawnSync('python3', ['-'], {
    cwd: root, encoding: 'utf8',
    input: `import importlib.util, json\nspec = importlib.util.spec_from_file_location('gaia_import', 'scripts/import-gaia-dr3.py')\nm = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\n${body}`,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const fixture = `
def row(source_id='6341181494973204096'):
    r = {column: None for column, _, _ in m.FIELDS}
    r.update({'source_id': source_id, 'designation': 'Gaia DR3 ' + source_id,
              'ref_epoch': '2016.0', 'ra': '359.9', 'dec': '-80', 'phot_g_mean_mag': '5.9',
              'parallax': '-0.3', 'parallax_error': '0.2', 'duplicated_source': 'F'})
    r.update({'hip_' + column: None for column, _, _ in m.MATCH_FIELDS})
    return r
`;

test('Gaia importer preserves 64-bit IDs, nulls, negative parallax and native units', () => {
  const star = JSON.parse(python(fixture + `
r = row()
print(json.dumps(m.transform([r], 1, 6)[0]))
`));
  assert.equal(star.sourceId, '6341181494973204096');
  assert.equal(star.refEpoch, 2016);
  assert.equal(star.parallaxMas, -0.3);
  assert.equal(star.parallaxErrorMas, 0.2);
  assert.equal(star.pmRaMasYr, null);
  assert.equal(star.duplicatedSource, false);
  assert.deepEqual(star.hipMatches, []);
});

test('Gaia importer retains every official HIP association, including ambiguities', () => {
  const star = JSON.parse(python(fixture + `
a = row()
a.update({'hip_original_ext_source_id': '104382', 'hip_angular_distance': '0.0017122066',
          'hip_number_of_neighbours': '2', 'hip_xm_flag': '13'})
b = dict(a, hip_original_ext_source_id='104383')
print(json.dumps(m.transform([a, b], 1, 6)[0]))
`));
  assert.equal(star.hipMatches.length, 2);
  assert.equal(star.hipMatches[0].numberOfNeighbours, 2);
  assert.equal(star.hipMatches[0].xmFlag, 13);
  assert.equal(star.hipMatches[0].angularDistanceArcsec, 0.0017122066);
});

test('Gaia importer rejects numeric IDs, conflicting rows and incomplete source counts', () => {
  python(fixture + `
cases = [([dict(row(), source_id=6341181494973204096)], 1),
         ([row(), dict(row(), ra='20')], 1), ([row()], 2)]
for rows, expected in cases:
    try:
        m.transform(rows, expected, 6)
        raise AssertionError('invalid data accepted')
    except ValueError:
        pass
`);
});

test('Gaia VOTable parser rejects trailing OVERFLOW, errors and wrong archived queries', () => {
  python(`
def xml(extra='', query='SELECT test'):
    return ('<VOTABLE><RESOURCE><INFO name="QUERY_STATUS" value="OK"/>'
            '<INFO name="QUERY" value="' + query + '"/>'
            '<TABLE><FIELD name="n" datatype="int"/><DATA><TABLEDATA>'
            '<TR><TD>1</TD></TR></TABLEDATA></DATA></TABLE>' + extra + '</RESOURCE></VOTABLE>').encode()
assert m.parse_votable(xml(), 'SELECT test')[0] == [{'n': '1'}]
for raw in [xml('<INFO name="QUERY_STATUS" value="OVERFLOW"/>'),
            xml('<INFO name="QUERY_STATUS" value="ERROR"/>'), xml(query='SELECT wrong')]:
    try:
        m.parse_votable(raw, 'SELECT test')
        raise AssertionError('incomplete or incorrect response accepted')
    except ValueError:
        pass
`);
});

test('Failed Gaia import leaves the existing snapshot untouched', () => {
  python(`
import tempfile, subprocess, sys
from pathlib import Path
with tempfile.TemporaryDirectory() as folder:
    folder = Path(folder)
    output = folder / 'snapshot.json'
    output.write_text('existing snapshot')
    bad = folder / 'bad.vot'
    bad.write_text('<VOTABLE><INFO name="QUERY_STATUS" value="ERROR"/></VOTABLE>')
    result = subprocess.run([sys.executable, 'scripts/import-gaia-dr3.py', '--input', str(bad),
                             '--count-input', str(bad), '--output', str(output)], capture_output=True)
    assert result.returncode != 0
    assert output.read_text() == 'existing snapshot'
`);
});

test('Bundled Gaia DR3 subset has explicit selection, verified counts and string identifiers', () => {
  const { metadata, stars } = JSON.parse(readFileSync(new URL('../public/catalog/gaia-dr3.json', import.meta.url)));
  assert.equal(metadata.sourceTable, 'gaiadr3.gaia_source');
  assert.equal(metadata.crossmatchTable, 'gaiadr3.hipparcos2_best_neighbour');
  assert.equal(metadata.selection.completeGaiaCatalogue, false);
  assert.equal(metadata.selection.completeForSelection, true);
  assert.equal(metadata.selection.maxGMag, 6);
  assert.equal(metadata.sourceCount, stars.length);
  assert.equal(metadata.officialCount, stars.length);
  assert.equal(new Set(stars.map(star => star.sourceId)).size, stars.length);
  assert.ok(stars.length > 6000 && stars.length < 10000);
  assert.match(metadata.sourceResponseSha256, /^[a-f0-9]{64}$/);
  for (const star of stars) {
    assert.equal(typeof star.sourceId, 'string');
    assert.match(star.sourceId, /^[0-9]+$/);
    assert.equal(star.designation, `Gaia DR3 ${star.sourceId}`);
    assert.equal(star.refEpoch, 2016);
    assert.ok(star.gMag <= 6);
    assert.ok(Array.isArray(star.hipMatches));
  }
});
