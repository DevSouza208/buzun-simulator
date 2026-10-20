/**
 * Paint planning in local OSM metres. Only uses observed road geometry and
 * oneway tags. The lane count and paint layout are visual approximations.
 * A whole OSM polyline is processed so a short split vertex cannot reset
 * the white dash phase (the previous renderer restarted every few metres).
 */
const pointAt = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function offsetSegment(a,b,offset) {
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  if(len<.01) return null;
  const nx=-dz/len*offset,nz=dx/len*offset;
  return [[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz]];
}
export function avenueMarkings(road,width) {
  if(road.t!=="primary" || !/Belmira Marin/i.test(road.n||""))return [];
  const points=road.p||[];
  const markings=[];
  const oneWay=["yes","1","true","-1"].includes(String(road.o||"").toLowerCase());
  let total=0;
  const add = (a,b,offset,halfWidth,color) => {
    const shifted=offsetSegment(a,b,offset);
    if(shifted)markings.push({a:shifted[0],b:shifted[1],halfWidth,color});
  };
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(len<.05)continue;
    if(oneWay){
      // Parallel one-way carriageways use dashed WHITE lane guides.
      add(a,b,0,.085,"white");
    } else {
      // Continuous double amber central divider, two thin parallel stripes.
      add(a,b,-.21,.075,"yellow");
      add(a,b,.21,.075,"yellow");
    }
    // Longitudinal curb-edge guides, inset so they do not sit on the sidewalk.
    for(const side of [-1,1])add(a,b,side*(width/2-.58),.065,"white");
    // Dash phase is distance-based across ALL vertices in this OSM way.
    const offsets=oneWay?[0]:[-width*.255,width*.255];
    const cycle=12,paint=4.2;
    for(let d=0;d<len;){
      const phase=(total+d)%cycle;
      const remains=phase<paint?paint-phase:cycle-phase;
      const step=Math.min(len-d,Math.max(.0001,remains));
      if(phase<paint-.0001){
        for(const lateral of offsets){
          // Oneway segments already have their own center marking; don't
          // draw duplicate opaque stripes on top of it.
          if(oneWay&&lateral===0)continue;
          add(pointAt(a,b,d/len),pointAt(a,b,(d+step)/len),lateral,.085,"white");
        }
      }
      d+=step;
    }
    total+=len;
  }
  return markings;
}
