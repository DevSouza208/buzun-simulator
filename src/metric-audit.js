import { roadWidth } from "./geo.js";

/** All game coordinates are local metres: 1 world unit = 1 metre.
 * The saved OSM crop has rounded vertices (0.1 m) and approximated
 * projection, not survey-grade coordinates.
 */
export function polylineLengthMeters(points) {
  if (!Array.isArray(points)) return 0;
  let sum=0;
  for(let i=1;i<points.length;i++)
    sum+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
  return sum;
}
export function roadDimensions(road) {
  // Retain actual known OSM road widths where supplied by later extracts.
  // Current Belmira data contains NO recorded widths: defaults are estimates.
  const measured=Number(road.widthMeters ?? road.width);
  if(Number.isFinite(measured)&&measured>=2&&measured<=45)
    return {widthMeters:measured,source:"measured"};
  return {widthMeters:roadWidth(road.t),source:"estimated"};
}
export function auditMetricCorridor(map) {
  const total=polylineLengthMeters(map.route);
  const roads=map.roads.map(road=>({id:road.id,...roadDimensions(road)}));
  const measured=roads.filter(r=>r.source==="measured").length;
  return {
    units:"metres",worldUnitsPerMetre:1,routeLengthMeters:total,
    routeVertices:map.route?.length||0,
    roads:roads.length,knownWidths:measured,estimatedWidths:roads.length-measured
  };
}
