import { closestSegment, seeded } from "./geo.js";

/**
 * Stable low-poly frontage recipes. Names/uses are never fabricated as OSM
 * facts. Unknown facades receive deterministic illustrative presets.
 */
export const MATERIALS=Object.freeze([
  {wall:"#d8b9a0",accent:"#5d737e",trim:"#f2dfc2"},
  {wall:"#c9d4ca",accent:"#547d87",trim:"#f3eddb"},
  {wall:"#d9c9ad",accent:"#975b50",trim:"#fff0ce"},
  {wall:"#b4c5ca",accent:"#527a80",trim:"#e9d6ba"},
  {wall:"#d4b9bc",accent:"#737591",trim:"#efdfd2"},
  {wall:"#cfc7a8",accent:"#756b5a",trim:"#ece1cd"},
  {wall:"#bacaba",accent:"#62806f",trim:"#eee4cb"},
  {wall:"#d3c5b7",accent:"#496b83",trim:"#f0e6d9"},
]);
function areaOf(poly){
  return poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1]},0);
}
export function chooseStreetFront(poly,segments,maxDistance=24){
  if(!Array.isArray(poly)||poly.length<3||!segments?.length)return null;
  const winding=areaOf(poly)>=0?1:-1;
  let best=null;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<4.3 || len>80)continue;
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const nearest=closestSegment(...mid,segments);
    if(!nearest||nearest.distance>maxDistance)continue;
    const road=nearest.segment;
    const rdx=road.b[0]-road.a[0],rdz=road.b[1]-road.a[1];
    const rlen=Math.hypot(rdx,rdz);
    if(rlen<.1)continue;
    const parallel=Math.abs(dx*rdx+dz*rdz)/(len*rlen);
    if(parallel<.53)continue;
    const nx=winding*dz/len,nz=-winding*dx/len;
    // Prefer edges parallel to a nearby street, rather than arbitrary
    // inward walls or rear yards. Do not claim this proves the entrance.
    const score=nearest.distance+(1-parallel)*12 + Math.abs(len-9)*.085;
    if(!best||score<best.score)best={edgeIndex:i,a,b,length:len,nx,nz,mid,roadDistance:nearest.distance,score};
  }
  return best;
}
export function facadeRecipe(building,front,renderedHeight=null){
  if(!front)return null;
  const seed=seeded(building.id);
  const explicitType=[building.use,building.t].filter(Boolean).join(" ").toLowerCase();
  const knownShop=/retail|commercial|supermarket|shop|store|mall|office/.test(explicitType);
  const measuredHeight=Number.parseFloat(building.height);
  const measuredFloors=Number.parseFloat(building.levels);
  const inferredHeight=Number.isFinite(measuredHeight)&&measuredHeight>=2.5
    ? measuredHeight : Number.isFinite(measuredFloors)&&measuredFloors>=1
      ? measuredFloors*3.05:5;
  const height=Number.isFinite(renderedHeight)?renderedHeight:inferredHeight;
  const kind=knownShop?"shop":height>=7.1?"sobrado":seed>.69?"shop":"house";
  const palette=MATERIALS[Math.floor(seeded(building.id*7+11)*MATERIALS.length)];
  const width=Math.min(.90,Math.max(.52,7/front.length));
  return {kind,height,palette,illustrative:!knownShop,frontWidth:width,
    gateSlats:kind==="house"?6:kind==="shop"?7:0,
    upperWindows:height>=6.6?2:height>=4.7?1:0};
}
