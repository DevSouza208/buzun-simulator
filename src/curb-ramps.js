/**
 * WorldGen 5.8 — curb cuts and sculpted sidewalk ramps.
 *
 * These patches exist only for crosswalks whose paint passed real
 * road-surface ownership validation. They do not assert that an actual
 * accessible ramp exists on location, or certify accessibility standards.
 *
 * 2D asphalt stays sovereign. Ramps split accepted sidewalk polygons and
 * replace their existing top rather than layering ramps over a flat slab.
 * All heights use the draped profile of the original sidewalk owner.
 */
const EPS=1e-8;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const offset=(a,v,t)=>add(a,[v[0]*t,v[1]*t]);
const diff=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const ease=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const area=poly=>poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];
  return sum+p[0]*q[1]-p[1]*q[0];
},0)/2;
const bounds=poly=>({
  minX:Math.min(...poly.map(x=>x[0])),maxX:Math.max(...poly.map(x=>x[0])),
  minZ:Math.min(...poly.map(x=>x[1])),maxZ:Math.max(...poly.map(x=>x[1]))
});
const boundsIntersect=(a,b)=>a.minX<b.maxX-EPS&&b.minX<a.maxX-EPS&&
  a.minZ<b.maxZ-EPS&&b.minZ<a.maxZ-EPS;
function clip(poly,a,b,orientation){
  const signed=p=>orientation*((b[0]-a[0])*(p[1]-a[1])-
    (b[1]-a[1])*(p[0]-a[0]));
  const out=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],
      fp=signed(p),fq=signed(q);
    if(fp>=-EPS)out.push(p);
    if((fp>EPS&&fq< -EPS)||(fp< -EPS&&fq>EPS)){
      const t=fp/(fp-fq);
      out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
    }
  }
  if(out.length>1&&Math.hypot(...diff(out[0],out.at(-1)))<EPS)out.pop();
  return out;
}
/** Exact convex polygon intersection, independent of winding. */
export function intersectConvex(subject,cutter){
  let output=subject,side=Math.sign(area(cutter));
  if(!side||!output?.length)return [];
  for(let i=0;i<cutter.length;i++){
    output=clip(output,cutter[i],cutter[(i+1)%cutter.length],side);
    if(output.length<3)return [];
  }
  return Math.abs(area(output))>1e-5?output:[];
}
const makeQuad=(site,side,t0,t1,d0,d1)=>{
  const origin=offset(site.point,site.normal,
    side*site.widthMeters/2);
  const xy=(t,d)=>offset(offset(origin,site.axis,t),site.normal,side*d);
  return [xy(t0,d0),xy(t1,d0),xy(t1,d1),xy(t0,d1)];
};
/** Caller passes only verified crossings — never merely potential sites. */
export function buildCurbRampZones(sites,{
  outerHalf=2.85,flatHalf=2.12,maxDepth=1.45,lip=.084
}={}){
  const zones=[],stats={crossings:sites.length,rampSides:0,skippedNarrow:0};
  for(const site of sites){
    if(!site||!Array.isArray(site.point)||!Array.isArray(site.axis)||
       !Array.isArray(site.normal)||!(site.widthMeters>=5.2))continue;
    const foot=site.sidewalkMeters??1.65;
    const depth=Math.min(maxDepth,foot*.88);
    if(depth<.48){stats.skippedNarrow++;continue;}
    const dims=[-outerHalf,-flatHalf,0,flatHalf,outerHalf];
    for(const side of [-1,1]){
      const zone={siteId:site.id,roadId:String(site.roadId),
        point:site.point,axis:site.axis,normal:site.normal,
        widthMeters:site.widthMeters,side,depth,
        outerHalf,flatHalf,lip};
      zone.polygon=makeQuad(zone,side,-outerHalf,outerHalf,0,depth);
      zone.box=bounds(zone.polygon);
      zone.cells=[];
      for(let i=0;i<dims.length-1;i++)
        for(const [d0,d1] of [[0,depth*.5],[depth*.5,depth]]){
          const poly=makeQuad(zone,side,dims[i],dims[i+1],d0,d1);
          zone.cells.push({polygon:poly,box:bounds(poly)});
        }
      zones.push(zone);
      stats.rampSides++;
    }
  }
  return {zones,stats};
}
export function rampCoordinates(zone,p){
  const v=diff(p,zone.point);
  return {
    along:dot(v,zone.axis),
    into:dot(v,zone.normal)*zone.side-zone.widthMeters/2
  };
}
/** Base-relative sidewalk top; equals old top along all outer edges. */
export function rampTopOffset(zone,p,oldTop){
  const {along,into}=rampCoordinates(zone,p);
  const distance=clamp(into/zone.depth,0,1);
  const flare=ease((Math.abs(along)-zone.flatHalf)/
    (zone.outerHalf-zone.flatHalf));
  return oldTop-(oldTop-zone.lip)*(1-ease(distance))*(1-flare);
}
export function createRampIndex(zones,{cellSize=28}={}){
  const cells=new Map();
  const addZone=zone=>{
    const b=zone.box;
    for(let x=Math.floor(b.minX/cellSize);x<=Math.floor(b.maxX/cellSize);x++)
      for(let z=Math.floor(b.minZ/cellSize);z<=Math.floor(b.maxZ/cellSize);z++){
        const key=zone.roadId+":"+x+":"+z;
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(zone);
      }
  };
  for(const z of zones)addZone(z);
  return {
    query(poly,roadId){
      const b=bounds(poly),seen=new Set(),result=[];
      for(let x=Math.floor(b.minX/cellSize);x<=Math.floor(b.maxX/cellSize);x++)
        for(let z=Math.floor(b.minZ/cellSize);z<=Math.floor(b.maxZ/cellSize);z++)
          for(const zone of cells.get(String(roadId)+":"+x+":"+z)||[])
            if(!seen.has(zone)&&boundsIntersect(b,zone.box)){
              seen.add(zone);result.push(zone);
            }
      return result;
    }
  };
}
/** Split a curb edge exactly where the longitudinal ramp core / flare
 * starts and stops. Each segment can have its own variable curb height.
 */
export function splitCurbEdge(a,b,zone){
  const pa=rampCoordinates(zone,a),pb=rampCoordinates(zone,b);
  if(Math.min(Math.abs(pa.into),Math.abs(pb.into))>.3 &&
    Math.max(Math.abs(pa.into),Math.abs(pb.into))>.3)
    return [[a,b]];
  const delta=pb.along-pa.along,ts=[0,1];
  if(Math.abs(delta)>EPS)for(const boundary of [
    -zone.outerHalf,-zone.flatHalf,zone.flatHalf,zone.outerHalf]){
    const t=(boundary-pa.along)/delta;
    if(t>EPS&&t<1-EPS)ts.push(t);
  }
  ts.sort((x,y)=>x-y);
  const uniq=ts.filter((v,i)=>i===0||v-ts[i-1]>EPS);
  return uniq.slice(1).map((end,i)=>{
    const start=uniq[i];
    return [offset(a,diff(b,a),start),offset(a,diff(b,a),end)];
  }).filter(([p,q])=>Math.hypot(...diff(p,q))>.08);
}
export function curbHeightAt(p,oldTop,zones){
  for(const zone of zones){
    const {along,into}=rampCoordinates(zone,p);
    if(Math.abs(along)<=zone.outerHalf+.001&&
      into>=-.22&&into<=.28)
      return rampTopOffset(zone,p,oldTop);
  }
  return oldTop;
}
