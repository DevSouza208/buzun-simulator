/**
 * Terrain interface shared by ground, road mesh and driving.
 * Uses an interpolated SRTM sample grid where available; otherwise
 * a deterministic artificial preview. Heights are local relative metres.
 * The exported grade is sampled every 70 m and is not a street survey.
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
let activeDEM = null;
let cityDEM = null;
let cityOrigin = null;
export function configureCityTerrain(source,origin) {
  cityDEM=source?.pointSample ? source : null;
  cityOrigin=cityDEM ? origin : null;
}
export function configureTerrain(source) {
  if (source === null) { activeDEM = null; return; }
  if (source?.dataset !== "srtm30m" || !source.grid ||
      !Array.isArray(source.heights) ||
      source.heights.length !== source.grid.nx * source.grid.nz ||
      !source.heights.every(Number.isFinite)) throw Error("Invalid elevation dataset");
  const {x0,z0,step,nx,nz} = source.grid;
  if (![x0,z0,step,nx,nz].every(Number.isFinite) || step <= 0 || nx < 2 || nz < 2)
    throw Error("Invalid DEM geometry");
  activeDEM = source;
}
export function getTerrainBounds() {
  if(cityDEM&&cityOrigin) {
    const b=cityDEM.bbox,kx=111320*Math.cos(cityOrigin.lat*Math.PI/180);
    return {minX:(b.west-cityOrigin.lon)*kx,maxX:(b.east-cityOrigin.lon)*kx,
      minZ:(cityOrigin.lat-b.north)*111132,maxZ:(cityOrigin.lat-b.south)*111132};
  }
  if (!activeDEM) return {minX:-630,maxX:630,minZ:-630,maxZ:630};
  const {x0,z0,step,nx,nz} = activeDEM.grid;
  return {minX:x0,maxX:x0+step*(nx-1),minZ:z0,maxZ:z0+step*(nz-1)};
}
export function getTerrainMode() { return cityDEM ? "terrarium" : activeDEM ? "srtm30m" : "preview"; }
function bilinearHeight(x,z) {
  const {grid,heights,baseElevationMeters}=activeDEM;
  const u=(x-grid.x0)/grid.step,v=(z-grid.z0)/grid.step;
  const i=Math.min(grid.nx-2,Math.max(0,Math.floor(u)));
  const j=Math.min(grid.nz-2,Math.max(0,Math.floor(v)));
  const tx=clamp01(u-i),tz=clamp01(v-j);
  const a=heights[j*grid.nx+i],b=heights[j*grid.nx+i+1];
  const c=heights[(j+1)*grid.nx+i],d=heights[(j+1)*grid.nx+i+1];
  const meters=(a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz;
  const maxX=grid.x0+grid.step*(grid.nx-1),maxZ=grid.z0+grid.step*(grid.nz-1);
  const edge=Math.min(x-grid.x0,maxX-x,z-grid.z0,maxZ-z);
  const blend=smoothstep(edge/125);
  return (meters-baseElevationMeters)*blend;
}

/** Local X and Z in metres. Returns a *relative* height in metres. */
export function sampleHeight(x, z, mode = cityDEM ? "terrarium" : activeDEM ? "srtm30m" : TERRAIN_MODE) {
  if(mode==="terrarium"&&cityDEM) {
    const height=cityDEM.pointSample(x,z,cityOrigin,780);
    if(height!=null&&Number.isFinite(height))return height;
  }
  if (activeDEM) {
    const b = getTerrainBounds();
    if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ) return 0;
    return bilinearHeight(x,z);
  }
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
