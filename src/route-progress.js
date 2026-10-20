import { segmentProjection } from "./geo.js";
/** Progress along a real OSM path, not straight-line distance to destination. */
export function progressAlongRoute(route,x,z){
  if(!Array.isArray(route)||route.length<2)return null;
  let total=0,travelled=0,best=Infinity,cumulative=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<.001)continue;
    const p=segmentProjection(x,z,a,b);
    if(p.distance<best){best=p.distance;travelled=cumulative+p.t*length;}
    cumulative+=length;total=cumulative;
  }
  return {total,travelled,remaining:Math.max(0,total-travelled),offRoute:best};
}
