/**
 * Signed local road grade along the front of the car. Negative is downhill.
 * Uses the same ground sampler that draws the road, so motion and visuals
 * agree. Kept independent of Three.js to support Node unit tests.
 */
export function slopeAlongHeading(x, z, heading, sampleHeight, span = 4) {
  const distance = Math.max(.25, span);
  const dx = Math.sin(heading) * distance;
  const dz = -Math.cos(heading) * distance;
  return (sampleHeight(x + dx, z + dz) -
          sampleHeight(x - dx, z - dz)) / (2 * distance);
}

export function slopeAcceleration(grade) {
  // Gravity projected onto the longitudinal direction of the slope (m/s²).
  return -9.81 * grade / Math.hypot(1, grade);
}

export function gradeLabel(grade) {
  const percent = Math.round(Math.abs(grade) * 100);
  if (percent < 1) return "TERRENO PLANO";
  return (grade < 0 ? "DESCIDA " : "SUBIDA ") + percent + "%";
}
