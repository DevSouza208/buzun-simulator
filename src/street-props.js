import { closestSegment, roadWidth } from "./geo.js";

/** Walk an OSM route in local metres, with its actual bends. */
export function routePointAt(route,travel) {
  if (!Array.isArray(route) || route.length < 2 || travel < 0) return null;
  let covered = 0;
  for (let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const distance=Math.hypot(dx,dz);
    if (distance < .01) continue;
    if (covered+distance>=travel) {
      const t=(travel-covered)/distance;
      return {x:a[0]+dx*t,z:a[1]+dz*t,dx:dx/distance,dz:dz/distance};
    }
    covered+=distance;
  }
  return null;
}

/** Stylized utility props: locations are generated, NOT real surveyed poles. */
export function utilityPolePlan(route,segments,collides=()=>false,spacing=54) {
  if (!Array.isArray(route) || route.length < 2 || !segments?.length) return [];
  const length=route.slice(1).reduce((sum,p,i)=>
    sum+Math.hypot(p[0]-route[i][0],p[1]-route[i][1]),0);
  const poles=[];
  for(let d=24;d<length-20;d+=spacing) {
    const loc=routePointAt(route,d);
    if(!loc)continue;
    const nearest=closestSegment(loc.x,loc.z,segments);
    if(!nearest||nearest.distance>12)continue;
    const s=nearest.segment,dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1];
    const len=Math.hypot(dx,dz);
    if(len<.1)continue;
    const normal=[-dz/len,dx/len];
    const setback=roadWidth(s.type)/2+3.0;
    for(const side of [1,-1]) {
      const x=nearest.x+normal[0]*side*setback;
      const z=nearest.z+normal[1]*side*setback;
      if(!collides(x,z)) {
        poles.push({x,z,side,along:d,heading:Math.atan2(dx,-dz)});
        break;
      }
    }
  }
  return poles;
}
