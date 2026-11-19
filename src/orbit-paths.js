import {orbitPoint} from './planet-ephemeris.js';

// Schematic circular orbits: positions and guide lines share one convention.
// The XZ plane is the reference plane; inclination rotates +Z toward +Y.
export function circularOrbitPosition(radius,phase,inclination=0){
  return [radius*Math.cos(phase),radius*Math.sin(phase)*Math.sin(inclination),radius*Math.sin(phase)*Math.cos(inclination)];
}

export function circularOrbitPath(body,center=[0,0,0],segments=240){
  const radius=body.bodyKind==='moon'?body.orbitRadius:body.orbit;
  if(!Number.isFinite(radius)||radius<=0)return [];
  const inclination=body.orbitInclinationRad||0;
  const relative=body.position.map((value,index)=>value-center[index]);
  // Start at the body's phase, ensuring a vertex lies at its displayed centre
  // rather than letting the body fall outside an approximating polygon edge.
  const phase=body.orbitPhaseRad??Math.atan2(relative[1]*Math.sin(inclination)+relative[2]*Math.cos(inclination),relative[0]);
  return Array.from({length:segments+1},(_,index)=>circularOrbitPosition(radius,phase+index/segments*Math.PI*2,inclination).map((value,axis)=>value+center[axis]));
}

export function orbitPath(body, center, segments=240) {
  if (!body.ephemeris) return circularOrbitPath(body,center,segments);
  const orbit=body.ephemeris;
  return Array.from({length:segments+1},(_,i)=>orbitPoint(orbit,body.orbit,orbit.E+i*2*Math.PI/segments));
}
