import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Quaternion, Vector3 } from 'three';
import { computeSpatialPlacement, spatialWorldToLocal } from '../src/spatial-map.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('room placement preserves relative coordinates and encloses the viewer', () => {
  const eye = new Vector3(3, 1.65, -2);
  const placement = computeSpatialPlacement({ boundsRadius: 24, viewerPosition: eye, viewerQuaternion: new Quaternion() });
  near(placement.scale, 0.25);
  assert.deepEqual(placement.position.toArray(), [3, 1.25, -2]);
  assert.deepEqual(eye.toArray(), [3, 1.65, -2]);
  const a = new Vector3(8, 2, 6), b = new Vector3(-8, 1, -6);
  const mapPoint = p => p.clone().multiplyScalar(placement.scale).applyQuaternion(placement.quaternion).add(placement.position);
  near(mapPoint(a).distanceTo(mapPoint(b)), a.distanceTo(b) * placement.scale);
});

test('tabletop follows initial yaw only and stays finite when looking straight up', () => {
  const eye = new Vector3(0, 1.65, 0);
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const result = computeSpatialPlacement({ boundsRadius: 30, viewerPosition: eye, viewerQuaternion: yaw, layout: 'tabletop' });
  near(result.position.x, -1.65);
  near(result.position.z, 0);
  near(result.scale * 60, 2.1);
  const upward = computeSpatialPlacement({ boundsRadius: NaN, viewerPosition: eye, viewerQuaternion: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2), layout: 'tabletop' });
  assert.ok(upward.position.toArray().every(Number.isFinite));
  near(upward.position.z, -1.65);
  assert.ok(upward.scale > 0);
});

test('planetarium keeps its unscaled dome centred at the initial eye position', () => {
  const eye = new Vector3(1, 1.8, 2);
  const value = computeSpatialPlacement({ boundsRadius: 60, viewerPosition: eye, viewerQuaternion: new Quaternion(), planetarium: true });
  assert.deepEqual(value.position.toArray(), eye.toArray());
  assert.equal(value.scale, 1);
  assert.deepEqual(value.quaternion.toArray(), [0, 0, 0, 1]);
});

test('world placement survives a translated, rotated and scaled parent', () => {
  const parent = new Group(), child = new Group();
  parent.position.set(5, 2, -3);
  parent.rotation.y = 0.8;
  parent.scale.setScalar(2);
  parent.add(child);
  const world = { position: new Vector3(1, 1.25, -2), quaternion: new Quaternion(), scale: 0.2 };
  const local = spatialWorldToLocal(world, parent);
  child.position.copy(local.position);
  child.quaternion.copy(local.quaternion);
  child.scale.setScalar(local.scale);
  near(child.getWorldPosition(new Vector3()).distanceTo(world.position), 0);
  near(child.getWorldScale(new Vector3()).x, world.scale);
  near(child.getWorldQuaternion(new Quaternion()).angleTo(world.quaternion), 0);
});
