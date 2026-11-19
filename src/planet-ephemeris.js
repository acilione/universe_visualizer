// JPL Solar System Dynamics, "Approximate Positions of the Planets", Table 1.
// a, e, I, L, longitude of perihelion, longitude of node, then rates per century.
// Positions represent planetary system barycentres. Valid over 1800–2050.
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
const elements = {
  mercury: [.38709927,.20563593,7.00497902,252.25032350,77.45779628,48.33076593,.00000037,.00001906,-.00594749,149472.67411175,.16047689,-.12534081],
  venus: [.72333566,.00677672,3.39467605,181.97909950,131.60246718,76.67984255,.00000390,-.00004107,-.00078890,58517.81538729,.00268329,-.27769418],
  earth: [1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0,.00000562,-.00004392,-.01294668,35999.37244981,.32327364,0],
  mars: [1.52371034,.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891,.00001847,.00007882,-.00813131,19140.30268499,.44441088,-.29257343],
  jupiter: [5.20288700,.04838624,1.30439695,34.39644051,14.72847983,100.47390909,-.00011607,-.00013253,-.00183714,3034.74612775,.21252668,.20469106],
  saturn: [9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448,-.00125060,-.00050991,.00193609,1222.49362201,-.41897216,-.28867794],
  uranus: [19.18916464,.04725744,.77263783,313.23810451,170.95427630,74.01692503,-.00196176,-.00004397,-.00242939,428.48202785,.40805281,.04240589],
  neptune: [30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574,.00026291,.00005105,.00035372,218.45945325,-.32241464,-.00508664],
};
const rad = Math.PI / 180;
const j2000 = Date.UTC(2000, 0, 1, 12);
const tilt = 23.43928 * rad;
function sceneAxes(x,y,z) {
  return [x, y*Math.sin(tilt)+z*Math.cos(tilt), z*Math.sin(tilt)-y*Math.cos(tilt)];
}
export function planetOrbit(id, utcMs) {
  const centuries = (utcMs - j2000) / (86400000 * 36525);
  const row = elements[id];
  const [a, e, inclination, longitude, perihelion, node] = row.slice(0,6)
    .map((value,k) => (value + centuries*row[k+6]) * (k<2 ? 1 : rad));
  const meanAnomaly = (longitude - perihelion) % (2*Math.PI);
  let E = meanAnomaly;
  for (let k=0; k<8; k++) {
    const correction = (E - e*Math.sin(E) - meanAnomaly) / (1 - e*Math.cos(E));
    E -= correction;
    if (Math.abs(correction) < 1e-12) break;
  }
  const periapseArgument = perihelion - node;
  const cw = Math.cos(periapseArgument), sw = Math.sin(periapseArgument);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inclination), si = Math.sin(inclination);
  return {
    a, e, E, utcMs,
    major: sceneAxes(cw*cn - sw*ci*sn, cw*sn + sw*ci*cn, sw*si),
    minor: sceneAxes(-sw*cn - cw*ci*sn, -sw*sn + cw*ci*cn, cw*si),
  };
}

export function orbitPoint(orbit, radius=orbit.a, anomaly=orbit.E) {
  const x = radius * (Math.cos(anomaly) - orbit.e);
  const y = radius * Math.sqrt(1 - orbit.e**2) * Math.sin(anomaly);
  return orbit.major.map((axis,k) => axis*x + orbit.minor[k]*y);
}

// Linear IAU north-pole and prime-meridian terms from NAIF pck00011.tpc.
// Pole rates are degrees/century, W rates degrees/day. UTC approximates TDB.
const rotation = {
  mercury:[281.0103,-.0328,61.4155,-.0049,329.5988,6.1385108],
  venus:[272.76,0,67.16,0,160.20,-1.4813688],
  earth:[0,-.641,90,-.557,190.147,360.9856235],
  mars:[317.269202,-.10927547,54.432516,-.05827105,176.049863,350.891982443297],
  jupiter:[268.056595,-.006499,64.495303,.002413,284.95,870.536],
  saturn:[40.589,-.036,83.537,-.004,38.90,810.7939024],
  uranus:[257.311,0,-15.175,0,203.81,-501.1600928],
  neptune:[299.36,0,43.46,0,249.978,541.1397757],
};
export function planetOrientation(id, utcMs) {
  const [ra,raRate,dec,decRate,w,rate]=rotation[id];
  const days=(utcMs-j2000)/86400000;
  return {ra:(ra+raRate*days/36525)*rad, dec:(dec+decRate*days/36525)*rad, angle:((w+days*rate)%360)*rad};
}
