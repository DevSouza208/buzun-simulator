import { segmentProjection } from "./geo.js";

const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Pick a safe road-centre spawn in front of each pilot building.
 * The car follows the road; the starting camera is aimed at the model.
 * All positions refer to actual OSM road geometry, not invented asphalt.
 */
export function facadeRoadSpawns(facades, segments, collides) {
  const list = [];
  for (const building of facades) {
    const face = building.frontMid;
    if (!face || !Array.isArray(face) || face.length < 2) continue;
    const candidates = [];
    for (const road of segments) {
      const p = segmentProjection(face[0],face[1],road.a,road.b);
      if (p.distance > 65 || p.distance < 3) continue;
      const length = Math.hypot(road.b[0]-road.a[0],road.b[1]-road.a[1]);
      if (length < 4) continue;
      for (const shift of [0, 4, -4, 8, -8]) {
        const t = Math.min(.97, Math.max(.03,p.t + shift/length));
        const x = road.a[0] + (road.b[0]-road.a[0])*t;
        const z = road.a[1] + (road.b[1]-road.a[1])*t;
        if (collides(x,z)) continue;
        const distance = Math.hypot(face[0]-x,face[1]-z);
        if (distance < 3.8 || distance > 60) continue;
        // Avoid roads 40m away if a perfectly good 10m street is present.
        const score = distance + Math.abs(shift)*.2 + (road.type==="service" ? 3 : 0);
        candidates.push({x,z,road,score,distance});
      }
    }
    candidates.sort((a,b)=>a.score-b.score);
    if (!candidates.length) continue;
    const chosen = candidates[0], road = chosen.road;
    const roadHeading = Math.atan2(road.b[0]-road.a[0],-(road.b[1]-road.a[1]));
    const towardFacade = Math.atan2(face[0]-chosen.x,-(face[1]-chosen.z));
    const reversed = wrapAngle(towardFacade-roadHeading);
    const angle = Math.abs(reversed)>Math.PI/2 ? wrapAngle(roadHeading+Math.PI) : roadHeading;
    const cameraOrbit = Math.max(-1.5,Math.min(1.5,wrapAngle(towardFacade-angle)));
    list.push({
      id:building.osmId,label:building.label,preset:building.preset,
      x:chosen.x,z:chosen.z,angle,cameraOrbit,
      street:road.name||"Ruas do Grajaú",distanceToFacade:Math.round(chosen.distance*10)/10
    });
  }
  return list;
}
