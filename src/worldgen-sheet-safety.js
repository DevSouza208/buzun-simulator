/**
 * Conservative support for a rasterized low-poly ground sheet.
 *
 * Sampling road heights ONLY at each grid vertex is insufficient:
 * a triangle spanning a narrow street may cross the road between
 * vertices even though its corners are all outside the asphalt.
 * Extend the below-pavement support by one full triangle diagonal,
 * then gently blend back to the ordinary continuous ground.
 *
 * Keep this separate from the heightfield used for road gradients:
 * road meshes are the authority, not the underlying terrain triangle.
 */
export function conservativeGroundSupport(original,hits,{
  step=4,clearance=.28,releaseMetres=5.5
}={}){
  if(!Number.isFinite(original))return original;
  const diagonal=Math.SQRT2*step;
  const guard=diagonal+.35;
  let result=original;
  for(const hit of hits){
    if(!Number.isFinite(hit.base)||!Number.isFinite(hit.distance)||
      !Number.isFinite(hit.halfWidth))continue;
    const beyond=Math.max(0,hit.distance-hit.halfWidth);
    if(beyond>guard+releaseMetres)continue;
    // The "stay under" cap is applied to all ground-level asphalt
    // candidates, not only the selected closest one. This also protects
    // unconnected same-level roads drawn as overlapping OSM sheets.
    const t=Math.max(0,Math.min(1,
      (beyond-guard)/Math.max(.01,releaseMetres)));
    const eased=t*t*(3-2*t);
    const floor=hit.base-clearance;
    const cap=floor*(1-eased)+original*eased;
    result=Math.min(result,cap);
  }
  return result;
}
