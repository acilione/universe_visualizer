import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConstellationView } from '../src/constellation-visuals.js';
import { equatorialVector } from '../src/sky-math.js';

const raw = JSON.parse(readFileSync(new URL('../public/catalog/stars.json', import.meta.url), 'utf8'));
const figures = JSON.parse(readFileSync(new URL('../public/catalog/constellations.json', import.meta.url), 'utf8')).constellations;
const stars = raw.stars.map(row => Object.fromEntries(raw.columns.map((name, i) => [name, row[i]])));
const catalog = { stars, byHip: new Map(stars.filter(s => s.hip !== null).map(s => [s.hip, s])), metadata: raw.metadata };
const renderer = { getPixelRatio: () => 1, domElement: { clientWidth: 1280, clientHeight: 800 } };
const observer = { latitude: 41.9028, longitude: 12.4964, dateIso: '2026-09-11T00:00:00.000Z' };
const figure = id => figures.find(value => value.id === id);
const build = (id, mode = 'space', position = observer) => createConstellationView({ catalog, figure: figure(id), mode, observer: position, renderer });
const radial = position => Math.hypot(...position);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `expected ${expected}, received ${actual}`);
const closeVector = (actual, expected, tolerance = 1e-9) => actual.forEach((value, i) => close(value, expected[i], tolerance));
const coreLines = view => view.group.getObjectByName('constellation-lines').children.find(child => child.isLineSegments);
const cloud = view => view.group.getObjectByName('catalog-stars');
const dispose = view => {
  const geometries = new Set(), materials = new Set();
  view.group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
};

function lineHasVertex(view, expected) {
  const positions = coreLines(view)?.geometry.attributes.position;
  if (!positions) return false;
  for (let i = 0; i < positions.count; i++) {
    if (Math.hypot(positions.getX(i) - expected[0], positions.getY(i) - expected[1], positions.getZ(i) - expected[2]) < 0.0001) return true;
  }
  return false;
}

function assertVisibleLinesStayAboveGround(view) {
  const lines = view.group.getObjectByName('constellation-lines');
  for (const object of lines.children) {
    if (object.isLineSegments) {
      const attribute = object.geometry.attributes.position;
      for (let i = 0; i < attribute.count; i++) assert.ok(attribute.getY(i) >= -0.000001, `${view.figure.id}: core line below horizon`);
    }
    if (object.isLineSegments2) {
      for (const key of ['instanceStart', 'instanceEnd']) {
        const attribute = object.geometry.attributes[key];
        for (let i = 0; i < attribute.count; i++) assert.ok(attribute.getY(i) >= -0.000001, `${view.figure.id}: glow line below horizon`);
      }
    }
  }
}

test('3D constellations preserve measured radial distance ratios and J2000 directions from the Sun', () => {
  const view = build('Ori');
  try {
    const alnitak = view.objects.find(s => s.hip === 26727);
    const alnilam = view.objects.find(s => s.hip === 26311);
    const sourceA = catalog.byHip.get(26727), sourceB = catalog.byHip.get(26311);
    assert.ok(Math.abs(sourceA.distanceLy - sourceB.distanceLy) > 100, 'belt stars must remain at substantially different depths');
    close(radial(alnitak.position) / radial(alnilam.position), sourceA.distanceLy / sourceB.distanceLy);
    const factor = radial(alnitak.position) / sourceA.distanceLy;
    for (const star of view.objects) {
      close(radial(star.position) / star.distanceLy, factor);
      closeVector(star.position.map(value => value / radial(star.position)), equatorialVector(star.raDeg, star.decDeg));
      assert.ok(lineHasVertex(view, star.position), `${star.name} should connect at its actual 3D position`);
    }
    closeVector(view.group.getObjectByName('solar-origin').position.toArray(), [0, 0, 0]);
    assert.equal(view.context.unknownDistanceCount, 0);
    assert.equal(coreLines(view).geometry.attributes.position.count, figure('Ori').segments.length * 2);
  } finally { dispose(view); }
});

test('unknown Sagittarius distance creates an honest gap in 3D and retains the same star in Earth projection', () => {
  const unknownHip = 89341;
  assert.equal(catalog.byHip.get(unknownHip).distanceLy, null);
  const spatial = build('Sgr');
  // Align Sagittarius near the equatorial observer meridian, so its full figure is above the horizon.
  const terrestrial = build('Sgr', 'earth', { latitude: 0, longitude: -7.01973837, dateIso: '2000-01-01T12:00:00.000Z' });
  try {
    const expectedSegments = figure('Sgr').segments.filter(([a, b]) => catalog.byHip.get(a).distanceLy !== null && catalog.byHip.get(b).distanceLy !== null);
    assert.ok(figure('Sgr').segments.some(pair => pair.includes(unknownHip)));
    assert.ok(!spatial.objects.some(star => star.hip === unknownHip));
    assert.equal(spatial.context.unknownDistanceCount, 1);
    assert.equal(spatial.group.getObjectByName('constellation-lines').userData.segmentCount, expectedSegments.length);
    assert.equal(coreLines(spatial).geometry.attributes.position.count, expectedSegments.length * 2);
    assert.ok(spatial.objects.every(star => star.distanceLy !== null && radial(star.position) > 0));

    const polis = terrestrial.objects.find(star => star.hip === unknownHip);
    assert.ok(polis && polis.altitudeDeg > 0);
    assert.equal(polis.distanceLy, null);
    assert.match(polis.distance, /sconosciuta/);
    close(radial(polis.position), 60);
    assert.ok(lineHasVertex(terrestrial, polis.position));
    assert.equal(terrestrial.group.getObjectByName('constellation-lines').userData.segmentCount, figure('Sgr').segments.length);
    assert.equal(terrestrial.context.unknownDistanceCount, 1);
    assert.equal(terrestrial.context.starCount, spatial.context.starCount);
  } finally { dispose(spatial); dispose(terrestrial); }
});

test('Earth projection includes all 119625 catalogue stars, including stars without parallax', () => {
  const view = build('Sgr', 'earth');
  try {
    const points = cloud(view), positions = points.geometry.attributes.position;
    assert.equal(positions.count, 119625);
    assert.equal(view.context.renderedStarCount, 119625);
    assert.equal(view.context.catalogStarCount, 119625);
    assert.equal(points.userData.particles, false, 'real catalogue stars must survive the decorative particles toggle');
    assert.equal(points.material.uniforms.uHorizon.value, 1);
    assert.ok(positions.array.every(Number.isFinite));
    assert.ok(points.geometry.attributes.aSize.array.every(value => Number.isFinite(value) && value > 0));
    assert.ok(points.geometry.attributes.aAlpha.array.every(value => value > 0 && value <= 1));
    for (const hip of [5165, 22783, 31216, 33165, 54463, 89341, 92202]) {
      const index = stars.findIndex(star => star.hip === hip);
      assert.ok(index >= 0 && stars[index].distanceLy === null);
      close(Math.hypot(positions.getX(index), positions.getY(index), positions.getZ(index)), 60, 0.00001);
    }
    assertVisibleLinesStayAboveGround(view);
  } finally { dispose(view); }
});

test('changing the Earth observation time changes altitude while preserving catalogue direction and sky radius', () => {
  const evening = build('Ori', 'earth', { ...observer, dateIso: '2026-01-15T21:00:00.000Z' });
  const morning = build('Ori', 'earth', { ...observer, dateIso: '2026-01-16T03:00:00.000Z' });
  try {
    const first = evening.objects.find(star => star.hip === 27989);
    const second = morning.objects.find(star => star.hip === 27989);
    assert.ok(first && second);
    assert.ok(Math.abs(first.altitudeDeg - second.altitudeDeg) > 20, 'the observer sky must respond to Earth rotation');
    assert.equal(first.raDeg, second.raDeg);
    assert.equal(first.decDeg, second.decDeg);
    assert.equal(first.distanceLy, second.distanceLy);
    close(radial(first.position), 60);
    close(radial(second.position), 60);
    assertVisibleLinesStayAboveGround(evening);
    assertVisibleLinesStayAboveGround(morning);
  } finally { dispose(evening); dispose(morning); }
});

test('all 88 constellations produce finite nonempty 3D and Earth scenes with clipped horizon lines', () => {
  assert.equal(figures.length, 88);
  for (const item of figures) {
    for (const mode of ['space', 'earth']) {
      const view = build(item.id, mode);
      try {
        assert.ok(view.objects.length > 0, `${item.id} ${mode}: no member stars`);
        assert.ok(view.center.toArray().every(Number.isFinite));
        assert.ok(view.lookDirection.toArray().every(Number.isFinite));
        assert.ok(Number.isFinite(view.radius) && view.radius > 0);
        assert.ok(view.objects.every(star => star.position.every(Number.isFinite)), `${item.id} ${mode}: invalid member position`);
        const positions = cloud(view).geometry.attributes.position;
        assert.ok(positions.count > 0 && positions.array.every(Number.isFinite), `${item.id} ${mode}: invalid star cloud`);
        const members = new Set(item.segments.flat());
        assert.equal(view.context.starCount, members.size);
        assert.equal(view.context.unknownDistanceCount, [...members].filter(hip => catalog.byHip.get(hip).distanceLy === null).length);
        if (mode === 'earth') {
          assert.equal(positions.count, 119625);
          assert.equal(view.objects.length, members.size);
          assertVisibleLinesStayAboveGround(view);
        } else {
          assert.ok(coreLines(view)?.geometry.attributes.position.count > 0, `${item.id}: no measurable 3D connections`);
          assert.equal(view.objects.length + view.context.unknownDistanceCount, members.size);
        }
        for (const object of view.group.getObjectByName('constellation-lines').children) {
          if (!object.userData.animate) continue;
          object.userData.animate(23.75);
          assert.ok(object.geometry.attributes.position.array.every(Number.isFinite), `${item.id} ${mode}: invalid animated pulse`);
        }
      } finally { dispose(view); }
    }
  }
});
