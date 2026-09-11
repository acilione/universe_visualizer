/**
 * Geometric sky coordinates for a visual planetarium, not an observing ephemeris.
 * Catalogue directions are J2000; precession uses the IAU 1976 polynomials in
 * IERS Conventions (2003), section 5.5.2, eq. 31. Sidereal rotation follows USNO.
 * UTC approximates UT1 and TT. Nutation, aberration, atmospheric refraction,
 * stellar proper motion, parallax, daylight and terrain are not included.
 * https://www.iers.org/SharedDocs/Publikationen/EN/IERS/Publications/tn/TechnNote32/tn32_033.pdf?__blob=publicationFile&v=2
 * https://aa.usno.navy.mil/faq/GAST
 * https://aa.usno.navy.mil/faq/alt_az
 */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const wrap = (degrees) => ((degrees % 360) + 360) % 360;

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${label}: valore numerico non valido.`);
  }
  return value;
}

function latitudeValue(value) {
  finite(value, 'Latitudine');
  if (value < -90 || value > 90) throw new RangeError('Latitudine fuori intervallo (-90 / 90).');
  return value;
}

function dateValue(value) {
  // A timezone is mandatory so an observation cannot silently depend on the browser locale.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new RangeError('Data non valida: usa una data ISO con fuso orario.');
  }
  const milliseconds = Date.parse(value);
  const date = new Date(milliseconds);
  const year = date.getUTCFullYear();
  // Date.parse normalizes February 30: validate the calendar component separately.
  const [inputYear, month, day] = value.slice(0, 10).split('-').map(Number);
  const monthLength = new Date(Date.UTC(inputYear, month, 0)).getUTCDate();
  if (!Number.isFinite(milliseconds) || month < 1 || month > 12 || day < 1 || day > monthLength || year < 1900 || year > 2100) {
    throw new RangeError('Data non valida: scegli una data fra il 1900 e il 2100.');
  }
  return { milliseconds, dateIso: date.toISOString() };
}

export function validateObserver(input = {}) {
  const latitude = latitudeValue(input.latitude);
  const longitude = finite(input.longitude, 'Longitudine');
  if (longitude < -180 || longitude > 180) throw new RangeError('Longitudine fuori intervallo (-180 / 180).');
  return { latitude, longitude, dateIso: dateValue(input.dateIso).dateIso };
}

function validateEquatorial(raDeg, decDeg) {
  finite(raDeg, 'Ascensione retta');
  finite(decDeg, 'Declinazione');
  if (decDeg < -90 || decDeg > 90) throw new RangeError('Declinazione fuori intervallo (-90 / 90).');
}

/** App frame: +Y celestial north, RA 0 along +X, RA 90 along -Z. */
export function equatorialVector(raDeg, decDeg, distance = 1) {
  validateEquatorial(raDeg, decDeg);
  finite(distance, 'Distanza');
  if (distance < 0) throw new RangeError('La distanza non puo essere negativa.');
  const ra = wrap(raDeg) * RAD;
  const dec = decDeg * RAD;
  const horizontal = Math.cos(dec) * distance;
  return [horizontal * Math.cos(ra), Math.sin(dec) * distance, -horizontal * Math.sin(ra)];
}

function siderealFromMilliseconds(milliseconds) {
  const midnight = Math.floor(milliseconds / DAY_MS) * DAY_MS;
  const daysSinceJ2000Midnight = (midnight - J2000_MS) / DAY_MS;
  const hours = (milliseconds - midnight) / 3600000;
  const centuries = (milliseconds - J2000_MS) / DAY_MS / 36525;
  // USNO's mean sidereal time expression, using UTC for both UT1 and TT.
  return wrap(15 * (6.697375 + 0.065709824279 * daysSinceJ2000Midnight +
    1.0027379 * hours + 0.0000258 * centuries * centuries));
}

/** Greenwich mean sidereal angle, degrees in [0, 360). */
export function greenwichMeanSiderealTime(dateIso) {
  return siderealFromMilliseconds(dateValue(dateIso).milliseconds);
}

function precessionMatrix(milliseconds) {
  const t = (milliseconds - J2000_MS) / DAY_MS / 36525;
  const arcsec = RAD / 3600;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsec;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsec;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsec;
  const czeta = Math.cos(zeta), szeta = Math.sin(zeta);
  const cz = Math.cos(z), sz = Math.sin(z), ct = Math.cos(theta), st = Math.sin(theta);
  // Active rotations of a standard Cartesian equatorial vector: Z(zeta), Y(-theta), Z(z).
  return [
    cz * ct * czeta - sz * szeta, -cz * ct * szeta - sz * czeta, -cz * st,
    sz * ct * czeta + cz * szeta, -sz * ct * szeta + cz * czeta, -sz * st,
    st * czeta, -st * szeta, ct,
  ];
}

function matrixVector(matrix, raDeg, decDeg, distance = 1) {
  const ra = wrap(raDeg) * RAD, dec = decDeg * RAD;
  const radius = Math.cos(dec) * distance;
  const x = radius * Math.cos(ra), y = radius * Math.sin(ra), z = Math.sin(dec) * distance;
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z,
    matrix[3] * x + matrix[4] * y + matrix[5] * z,
    matrix[6] * x + matrix[7] * y + matrix[8] * z,
  ];
}

/** Mean equatorial coordinates of date, starting from the catalogue's J2000 direction. */
export function precessJ2000(raDeg, decDeg, dateIso) {
  validateEquatorial(raDeg, decDeg);
  const [x, y, z] = matrixVector(precessionMatrix(dateValue(dateIso).milliseconds), raDeg, decDeg);
  return { raDeg: wrap(Math.atan2(y, x) * DEG), decDeg: Math.atan2(z, Math.hypot(x, y)) * DEG };
}

function horizonMatrix(latitude, siderealDeg) {
  const lat = latitude * RAD, sidereal = wrap(siderealDeg) * RAD;
  const sl = Math.sin(lat), cl = Math.cos(lat), ss = Math.sin(sidereal), cs = Math.cos(sidereal);
  // Horizontal frame: East, Up, South. Azimuth is clockwise from true north.
  return [-ss, cs, 0, cl * cs, cl * ss, sl, sl * cs, sl * ss, -cl];
}

function horizontalResult(vector) {
  const [east, up, south] = vector;
  const groundLength = Math.hypot(east, south);
  return {
    altitudeDeg: Math.atan2(up, groundLength) * DEG,
    // Azimuth is undefined exactly at zenith/nadir; zero is a deterministic convention.
    azimuthDeg: groundLength < 1e-12 ? 0 : wrap(Math.atan2(east, -south) * DEG),
    vector,
  };
}

/** Low-level conversion for coordinates already precessed to the same epoch as siderealDeg. */
export function equatorialToHorizontalAtSiderealTime(raDeg, decDeg, { latitude, siderealDeg }) {
  validateEquatorial(raDeg, decDeg);
  latitudeValue(latitude);
  finite(siderealDeg, 'Tempo siderale');
  return horizontalResult(matrixVector(horizonMatrix(latitude, siderealDeg), raDeg, decDeg));
}

/** Precompute the complete rotation once, then efficiently transform a large star catalogue. */
export function createSkyTransform(input) {
  const observer = validateObserver(input);
  const milliseconds = Date.parse(observer.dateIso);
  const siderealDeg = wrap(siderealFromMilliseconds(milliseconds) + observer.longitude);
  const precession = precessionMatrix(milliseconds);
  const horizon = horizonMatrix(observer.latitude, siderealDeg);
  const combined = new Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      combined[row * 3 + col] = horizon[row * 3] * precession[col] +
        horizon[row * 3 + 1] * precession[3 + col] + horizon[row * 3 + 2] * precession[6 + col];
    }
  }
  const vector = (raDeg, decDeg, distance = 1) => {
    validateEquatorial(raDeg, decDeg);
    finite(distance, 'Distanza');
    if (distance < 0) throw new RangeError('La distanza non puo essere negativa.');
    return matrixVector(combined, raDeg, decDeg, distance);
  };
  return { observer, siderealDeg, vector, horizontal: (raDeg, decDeg) => horizontalResult(vector(raDeg, decDeg)) };
}

/** J2000 RA/Dec to a geometric Earth-surface direction at the supplied location and UTC instant. */
export function equatorialToHorizontal(raDeg, decDeg, observer) {
  return createSkyTransform(observer).horizontal(raDeg, decDeg);
}
