/** Road terrain masks must never cut a wider hole than the rendered
 * pavement. Allow terrain to extend UNDER the last sidewalk pixels so
 * raster quantization cannot reveal the sky between meshes.
 * This changes only the cutout, not the original OSM street footprint.
 */
export const TERRAIN_OVERLAP_METRES=.6;
export function maskedCorridorHalfWidth(segment,{
  overlap=TERRAIN_OVERLAP_METRES
}={}){
  const half=Number(segment?.halfWidth);
  const walk=Number(segment?.walk);
  if(!Number.isFinite(half)||!Number.isFinite(walk)||
     half<=0||walk<0)return 0;
  return Math.max(.5,half+walk-overlap);
}
