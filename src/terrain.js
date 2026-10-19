/**
 * Buzun elevation interface.
 *
 * "preview" is explicitly FAKE terrain: deterministic, gentle slopes.
 * Not DEM/GPS elevation. Swap sampleHeight with an interpolated DEM raster
 * when licensed measured altitudes are introduced.
 *
 * Only the original 1.2km Grajaú pilot gets terrain relief in this pass.
 * It smoothly fades to zero before the flat long-road corridors.
 */
export const TERRAIN_MODE = "preview";
export const TERRAIN_EXTENT = 610;
const PI = Math.PI;
const clamp01 = x => Math.min(1, Math.max(0, x));
const smoothstep = t => {const x = clamp01(t); return x * x * (3 - 2 * x);};
const wave = (x,z) => (
  3.4 * Math.sin(x / 215 + .54) * Math.cos(z / 260 - .3) +
  1.25 * Math.sin((x + z) / 185 + .6) +
  1.1 * Math.cos((x - z) / 120 + .2)
);
const zero = wave(0,0);
/** Local X and Z in metres. Returns a *relative* height in metres. */
export function sampleHeight(x, z, mode = TERRAIN_MODE) {
  if (mode !== "preview") return 0;
  // Fade toward the untouched outer network; the base plane is level at zero.
  const radius = Math.hypot(x, z);
  if (radius >= TERRAIN_EXTENT) return 0;
  const fade = 1 - smoothstep((radius - 390) / 220);
  return (wave(x,z) - zero) * fade;
}
export function heightGradient(x,z,step=2) {
  const h = Math.max(.2,step);
  return {
    dx:(sampleHeight(x+h,z)-sampleHeight(x-h,z))/(2*h),
    dz:(sampleHeight(x,z+h)-sampleHeight(x,z-h))/(2*h)
  };
}
export function heightAlongHeading(x,z,yaw,span=3) {
  const dx=Math.sin(yaw)*span, dz=-Math.cos(yaw)*span;
  return Math.atan((sampleHeight(x+dx,z+dz)-sampleHeight(x-dx,z-dz))/(2*span));
}
