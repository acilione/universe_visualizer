// NASA/JPL NAIF pck00011.tpc (2022-12-27), active BODY*_RADII and BODY*_PM.
// Semiaxes are [equatorial x, equatorial y, polar z], kilometres.
// These reference ellipsoids are measured shape approximations, NOT resolved terrain.
// The corresponding render axes are [x, polar y, equatorial z]. Display size is
// normalized to the largest semiaxis; catalogue radii/distances stay unchanged.
// Planet obliquities are from NASA NSSDCA fact sheets. Pole longitude, spin phase,
// and moon orbital planes remain schematic; this is not a SPICE ephemeris model.
// Rotation period uses the linear IAU prime-meridian rate only (no libration).
// Positive periods are deliberate: obliquity >90 degrees already reverses spin.
export const BODY_SHAPE_SOURCE = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc';
export const BODY_TILT_SOURCE = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
export const BODY_SHAPES = {
  sun: { naifId: 10, radiiKm: [695700.0, 695700.0, 695700.0], tiltDeg: 7.25, rotationPeriodHours: 609.1198781760244, tidallyLocked: false },
  mercury: { naifId: 199, radiiKm: [2440.53, 2440.53, 2438.26], tiltDeg: 0.034, rotationPeriodHours: 1407.5075016565909, tidallyLocked: false },
  venus: { naifId: 299, radiiKm: [6051.8, 6051.8, 6051.8], tiltDeg: 177.36, rotationPeriodHours: 5832.443615661407, tidallyLocked: false },
  earth: { naifId: 399, radiiKm: [6378.1366, 6378.1366, 6356.7519], tiltDeg: 23.44, rotationPeriodHours: 23.93447117430703, tidallyLocked: false },
  mars: { naifId: 499, radiiKm: [3396.19, 3396.19, 3376.2], tiltDeg: 25.19, rotationPeriodHours: 24.622962143046955, tidallyLocked: false },
  jupiter: { naifId: 599, radiiKm: [71492.0, 71492.0, 66854.0], tiltDeg: 3.13, rotationPeriodHours: 9.924919819513496, tidallyLocked: false },
  saturn: { naifId: 699, radiiKm: [60268.0, 60268.0, 54364.0], tiltDeg: 26.73, rotationPeriodHours: 10.656222221732387, tidallyLocked: false },
  uranus: { naifId: 799, radiiKm: [25559.0, 25559.0, 24973.0], tiltDeg: 97.77, rotationPeriodHours: 17.240000000255407, tidallyLocked: false },
  neptune: { naifId: 899, radiiKm: [24764.0, 24764.0, 24341.0], tiltDeg: 28.32, rotationPeriodHours: 15.966299998597572, tidallyLocked: false },
  moon: { naifId: 301, radiiKm: [1737.4, 1737.4, 1737.4], tiltDeg: 0, rotationPeriodHours: 655.7198811418161, tidallyLocked: true },
  phobos: { naifId: 401, radiiKm: [13.0, 11.4, 9.1], tiltDeg: 0, rotationPeriodHours: 7.653842504890368, tidallyLocked: true },
  deimos: { naifId: 402, radiiKm: [7.8, 6.0, 5.1], tiltDeg: 0, rotationPeriodHours: 30.29857892512062, tidallyLocked: true },
  amalthea: { naifId: 505, radiiKm: [125.0, 73.0, 64.0], tiltDeg: 0, rotationPeriodHours: 11.956302107059122, tidallyLocked: true },
  io: { naifId: 501, radiiKm: [1829.4, 1819.4, 1815.7], tiltDeg: 0, rotationPeriodHours: 42.45930719409891, tidallyLocked: true },
  europa: { naifId: 502, radiiKm: [1562.6, 1560.3, 1559.5], tiltDeg: 0, rotationPeriodHours: 85.228345900248, tidallyLocked: true },
  ganymede: { naifId: 503, radiiKm: [2631.2, 2631.2, 2631.2], tiltDeg: 0, rotationPeriodHours: 171.70927486912876, tidallyLocked: true },
  callisto: { naifId: 504, radiiKm: [2410.3, 2410.3, 2410.3], tiltDeg: 0, rotationPeriodHours: 400.53643139609454, tidallyLocked: true },
  epimetheus: { naifId: 611, radiiKm: [64.9, 57.3, 53.0], tiltDeg: 0, rotationPeriodHours: 16.66375038498543, tidallyLocked: true },
  janus: { naifId: 610, radiiKm: [101.7, 93.0, 76.3], tiltDeg: 0, rotationPeriodHours: 16.671941367894302, tidallyLocked: true },
  mimas: { naifId: 601, radiiKm: [207.8, 196.7, 190.6], tiltDeg: 0, rotationPeriodHours: 22.61812344419412, tidallyLocked: true },
  enceladus: { naifId: 602, radiiKm: [256.6, 251.4, 248.3], tiltDeg: 0, rotationPeriodHours: 32.885234009094795, tidallyLocked: true },
  tethys: { naifId: 603, radiiKm: [538.4, 528.3, 526.3], tiltDeg: 0, rotationPeriodHours: 45.30726145850729, tidallyLocked: true },
  dione: { naifId: 604, radiiKm: [563.4, 561.3, 559.6], tiltDeg: 0, rotationPeriodHours: 65.6859732612656, tidallyLocked: true },
  rhea: { naifId: 605, radiiKm: [765.0, 763.1, 762.4], tiltDeg: 0, rotationPeriodHours: 108.42006296299398, tidallyLocked: true },
  titan: { naifId: 606, radiiKm: [2575.15, 2574.78, 2574.47], tiltDeg: 0, rotationPeriodHours: 382.69074183572707, tidallyLocked: true },
  hyperion: { naifId: 607, radiiKm: [180.1, 133.0, 102.7], tiltDeg: 0, rotationPeriodHours: null, tidallyLocked: false },
  iapetus: { naifId: 608, radiiKm: [745.7, 745.7, 712.1], tiltDeg: 0, rotationPeriodHours: 1903.9403897418865, tidallyLocked: true },
  phoebe: { naifId: 609, radiiKm: [109.4, 108.5, 101.8], tiltDeg: 0, rotationPeriodHours: 9.27397844014688, tidallyLocked: false },
  miranda: { naifId: 705, radiiKm: [240.4, 234.2, 232.9], tiltDeg: 0, rotationPeriodHours: 33.92350158986495, tidallyLocked: true },
  ariel: { naifId: 701, radiiKm: [581.1, 577.9, 577.7], tiltDeg: 0, rotationPeriodHours: 60.48909292006175, tidallyLocked: true },
  umbriel: { naifId: 702, radiiKm: [584.7, 584.7, 584.7], tiltDeg: 0, rotationPeriodHours: 99.46022990787003, tidallyLocked: true },
  titania: { naifId: 703, radiiKm: [788.9, 788.9, 788.9], tiltDeg: 0, rotationPeriodHours: 208.94077098892993, tidallyLocked: true },
  oberon: { naifId: 704, radiiKm: [761.4, 761.4, 761.4], tiltDeg: 0, rotationPeriodHours: 323.11756753863983, tidallyLocked: true },
  larissa: { naifId: 807, radiiKm: [96.0, 96.0, 96.0], tiltDeg: 0, rotationPeriodHours: 13.311692650174, tidallyLocked: true },
  proteus: { naifId: 808, radiiKm: [218.0, 208.0, 201.0], tiltDeg: 0, rotationPeriodHours: 26.935571560613983, tidallyLocked: true },
  triton: { naifId: 801, radiiKm: [1352.6, 1352.6, 1352.6], tiltDeg: 0, rotationPeriodHours: 141.0444978788695, tidallyLocked: true },
  nereid: { naifId: 802, radiiKm: [170.0, 170.0, 170.0], tiltDeg: 0, rotationPeriodHours: null, tidallyLocked: false },
};

export function bodyShapeScale(id) {
  const radii = BODY_SHAPES[id]?.radiiKm;
  if (!radii) return [1, 1, 1];
  const largest = Math.max(...radii);
  return [radii[0] / largest, radii[2] / largest, radii[1] / largest];
}

// NASA NSSDCA radii from planet centre in km. Inner and outer boundaries are
// real; ring opacity is a display approximation, not a calibrated optical model.
export const SATURN_RING_SOURCE = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html';
export const SATURN_RINGS = [
  { name: 'C', innerKm: 74658, outerKm: 91975, opacity: .22, color: '#8e8778' },
  { name: 'B', innerKm: 91975, outerKm: 117507, opacity: .92, color: '#c7baa0' },
  { name: 'Cassini division', innerKm: 117507, outerKm: 122340, opacity: .035, color: '#6d6558' },
  { name: 'A', innerKm: 122340, outerKm: 136780, opacity: .68, color: '#b4a78f' },
];
export const URANUS_RING_SOURCE = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranringfact.html';
// Widths for variable-width rings use the midpoint of NASA's published range.
// No screen-space widening: subpixel rings may be faint in the overview.
export const URANUS_RINGS = [
  { name: '6', radiusKm: 41837, widthKm: 1.5 },
  { name: '5', radiusKm: 42234, widthKm: 2 },
  { name: '4', radiusKm: 42571, widthKm: 2 },
  { name: 'Alpha', radiusKm: 44718, widthKm: 7 },
  { name: 'Beta', radiusKm: 45661, widthKm: 8 },
  { name: 'Eta', radiusKm: 47176, widthKm: 1.6 },
  { name: 'Gamma', radiusKm: 47627, widthKm: 2.5 },
  { name: 'Delta', radiusKm: 48300, widthKm: 5 },
  { name: 'Lambda', radiusKm: 50024, widthKm: 2 },
  { name: 'Epsilon', radiusKm: 51149, widthKm: 58 },
];
