/**
 * Buzun geography helpers. All map points are local meters [x, z]:
 * +x east, +z south. Data and game coordinates use the same basis.
 */
export function latLonToLocal(lat, lon, origin) {
  const k = Math.PI / 180;
  return [
    (lon - origin.lon) * 111320 * Math.cos(origin.lat * k),
    (origin.lat - lat) * 111132,
  ];
}
export function segmentProjection(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq)) : 0;
  const px = a[0] + t * dx, pz = a[1] + t * dz;
  return { x: px, z: pz, distance: Math.hypot(x - px, z - pz), angle: Math.atan2(dx, -dz), t };
}
export function closestSegment(x, z, segments) {
  let best = null;
  for (const segment of segments) {
    const projected = segmentProjection(x, z, segment.a, segment.b);
    if (!best || projected.distance < best.distance) best = { ...projected, segment };
  }
  return best;
}
export function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > z) !== (b[1] > z) &&
        x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function roadWidth(kind) {
  return ({
    primary: 14, secondary: 12, tertiary: 10, residential: 7.5,
    unclassified: 7.5, service: 5.2, living_street: 5.5,
    primary_link: 10, secondary_link: 8, tertiary_link: 7,
  })[kind] || 7;
}
export function clippedLine(a, b, limit = 545) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const bounds = [[-dx, a[0] + limit], [dx, limit - a[0]], [-dz, a[1] + limit], [dz, limit - a[1]]];
  for (const [p, q] of bounds) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [[a[0] + dx * t0, a[1] + dz * t0], [a[0] + dx * t1, a[1] + dz * t1]];
}
export function seeded(n) {
  let x = (Number(n) || 1) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (x >>> 0) / 4294967295;
}
