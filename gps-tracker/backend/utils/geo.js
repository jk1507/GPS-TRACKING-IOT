/** Great-circle maths shared by stats endpoints and route summaries. */

const EARTH_RADIUS_M = 6371008.8;

export function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/** Distance between two coordinates in metres. */
export function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total travelled distance of an ordered list of points, in metres. */
export function pathDistanceMeters(points = []) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
