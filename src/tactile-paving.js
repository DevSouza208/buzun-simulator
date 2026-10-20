/**
 * Low-poly, illustrative tactile warning pads at verified curb ramps.
 * The real sidewalk composer CLIPS these pavers to accepted sidewalk
 * polygons. Nothing is generated directly on asphalt, another road,
 * a missing ramp, or a disconnected piece of ground.
 *
 * Decorative only: not surveyed tactile paving, NBR accessibility
 * compliance, or evidence of pedestrian safety.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const bounds=poly=>({
  minX:Math.min(...poly.map(p=>p[0])),maxX:Math.max(...poly.map(p=>p[0])),
  minZ:Math.min(...poly.map(p=>p[1])),maxZ:Math.max(...poly.map(p=>p[1]))
});
export function boundsOverlap(a,b){
  return a.minX<b.maxX-1e-8&&b.minX<a.maxX-1e-8&&
    a.minZ<b.maxZ-1e-8&&b.minZ<a.maxZ-1e-8;
}
function quad(zone,along0,along1,depth0,depth1){
  const sample=(along,depth)=>[
    zone.point[0]+zone.axis[0]*along+
      zone.normal[0]*zone.side*(zone.widthMeters/2+depth),
    zone.point[1]+zone.axis[1]*along+
      zone.normal[1]*zone.side*(zone.widthMeters/2+depth)
  ];
  return [sample(along0,depth0),sample(along1,depth0),
    sample(along1,depth1),sample(along0,depth1)];
}
/** Repeated small squares mark the warning zone without external assets.
 * Tiles are sized in real metres and sit inside the LOWERED ramp footprint.
 */
export function tactilePaversForZone(zone,{
  countAcross=7,rows=2,gap=.17,size=.13,
  elevation=.014
}={}){
  if(!zone||zone.depth<.48||countAcross<1||rows<1)return [];
  const pavers=[],span=(countAcross-1)*gap,
    first=-span/2,low=zone.depth*.32,high=zone.depth*.69;
  const available=Math.max(.05,(high-low)/(rows||1));
  const patchSize=Math.min(size,available*.9,zone.depth*.17);
  const depthStep=rows>1?(high-low)/(rows-1):0;
  for(let row=0;row<rows;row++){
    const d=rows===1?(low+high)/2:low+row*depthStep;
    for(let col=0;col<countAcross;col++){
      const along=first+col*gap;
      if(Math.abs(along)+patchSize/2>zone.flatHalf-.09)continue;
      const polygon=quad(zone,along-patchSize/2,along+patchSize/2,
        d-patchSize/2,d+patchSize/2);
      pavers.push({polygon,box:bounds(polygon),elevation});
    }
  }
  return pavers;
}
