/**
 * Builds narrow road ribbons that follow the sampled terrain at every
 * vertex (both along and across the street).
 *
 * Returns arrays [leftStart,leftEnd,rightEnd,rightStart] for triangulation.
 * Units are local OSM metres; no Three.js/browser dependency.
 */
export function terrainBandQuads(a, b, halfWidth, offset, sampleHeight, step = 7) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < .01 || halfWidth <= 0) return [];
  const nx = -dz * halfWidth / length;
  const nz = dx * halfWidth / length;
  const subdivisions = Math.ceil(length / Math.max(1, step));
  const crossSection = t => {
    const x = a[0] + dx * t, z = a[1] + dz * t;
    const leftX = x + nx, leftZ = z + nz;
    const rightX = x - nx, rightZ = z - nz;
    return [
      [leftX, sampleHeight(leftX, leftZ) + offset, leftZ],
      [rightX, sampleHeight(rightX, rightZ) + offset, rightZ],
    ];
  };
  const quads = [];
  let [leftStart, rightStart] = crossSection(0);
  for (let i = 1; i <= subdivisions; i++) {
    const [leftEnd, rightEnd] = crossSection(i / subdivisions);
    quads.push([leftStart, leftEnd, rightEnd, rightStart]);
    leftStart = leftEnd;
    rightStart = rightEnd;
  }
  return quads;
}
