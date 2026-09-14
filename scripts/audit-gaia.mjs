import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildCelestialCatalogue } from '../src/celestial-catalog.js';
import { mergeGaiaCatalog } from '../src/gaia-catalog.js';

const root = new URL('../', import.meta.url);
const inputFiles = ['public/catalog/nasa-hipparcos.json', 'public/catalog/nasa-stars.json', 'public/catalog/nasa-nebulae.json', 'public/catalog/gaia-dr3.json'];
const implementationFiles = ['src/gaia-catalog.js', 'src/celestial-catalog.js', 'scripts/audit-gaia.mjs'];
const sha256 = content => createHash('sha256').update(content).digest('hex');
const inputs = await Promise.all(inputFiles.map(async file => {
  const content = await readFile(new URL(file, root));
  return { file, bytes: content.byteLength, sha256: sha256(content), snapshot: JSON.parse(content.toString('utf8')) };
}));
const implementation = await Promise.all(implementationFiles.map(async file => ({ file, sha256: sha256(await readFile(new URL(file, root))) })));
const [hip, bsc, nebula, gaia] = inputs.map(input => input.snapshot);
const original = buildCelestialCatalogue(hip, bsc, nebula);
const combined = mergeGaiaCatalog(original, gaia);
const matching = combined.metadata.gaiaDr3.matching;
const report = {
  schemaVersion: 1,
  reproduction: 'node scripts/audit-gaia.mjs',
  inputSnapshotDate: gaia.metadata.generatedAt,
  inputs: inputs.map(({ snapshot, ...provenance }) => provenance),
  implementation,
  selection: gaia.metadata.selection,
  sourceTable: gaia.metadata.sourceTable,
  crossmatchTable: gaia.metadata.crossmatchTable,
  policy: {
    officialIdentity: 'A single official HIP association, globally unique HIP within the imported snapshot, numberOfNeighbours=1, no xmFlag multiplicity bits (1,2,4), no duplicatedSource flag.',
    sourceClassification: 'Entries explicitly flagged as Gaia QSO or galaxy candidates are quarantined rather than classified as stars. Candidate flags do not establish a final physical classification.',
    existingMeasurements: 'NASA identities, positions, epochs, names, V/HR photometry and all existing measurements remain unchanged; native Gaia fields are additional evidence.',
    positionalAudit: 'Unmatched Gaia directions are compared with all NASA stars within 5 arcsec using a spherical spatial index. Close candidates are quarantined as unresolved identity evidence, never position-merged.',
    epochs: 'Gaia native ICRS J2016 positions are linearly propagated in the tangent basis to J2000 using mu_alpha*cos(delta) and mu_delta. Missing proper motion retains its labelled native epoch. Perspective acceleration and covariance are not modelled.',
    ambiguity: 'Quarantined sources are excluded from rendered counts. A flag or a close candidate does not prove two catalogue entries represent the same physical star.',
    scope: 'This checks the included magnitude-limited Gaia snapshot against the included NASA-hosted catalogues. It is not a full Gaia DR3 cross-identification or an astrophysical uniqueness guarantee.',
  },
  counts: { nasaStarCount: original.stars.length, renderedStarCount: combined.stars.length, ...matching },
  matched: combined.stars.filter(star => star.gaiaMatchStatus === 'official-hipparcos-match').map(star => ({ sourceId: star.gaiaSourceId, nasaId: star.id, hip: star.hip, hipMatches: star.gaiaData.hipMatches })),
  addedSourceIds: combined.stars.filter(star => star.gaiaMatchStatus === 'gaia-only').map(star => star.gaiaSourceId),
  quarantined: combined.gaiaAmbiguousRecords.map(record => ({ sourceId: record.sourceId, reasons: record.reasons,
    candidateNasaIds: record.candidateNasaIds, proximityCandidates: record.proximityCandidates,
    hipMatches: record.gaiaData.hipMatches, duplicatedSource: record.gaiaData.duplicatedSource,
    inQsoCandidates: record.gaiaData.inQsoCandidates ?? null, inGalaxyCandidates: record.gaiaData.inGalaxyCandidates ?? null,
    ...(record.conflictingRecords ? { conflictingRecords: record.conflictingRecords.map(row => ({ sourceId: row.sourceId, hipMatches: row.hipMatches })) } : {}),
  })),
};
const output = 'public/catalog/gaia-match-audit.json';
await writeFile(new URL(output, root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, counts: report.counts }, null, 2));
