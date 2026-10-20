import {subtractConvex,physicalLayer,asphaltPriority} from "./asphalt-union.js";

/**
 * Polygonal sidewalk compositor.
 * Unlike the old road-by-road quads, the complete union of asphalt is
 * subtracted FIRST. Sidewalk patches are then unioned in priority order.
 * Curb faces are emitted ONLY along the final sidewalk/asphalt interface,
 * including the outside contour of T/X-junctions.
 *
 * Each polygon belongs to a road sheet with a shared longitudinal grade.
 * All horizontal lengths are the original projected OSM metres.
 */
const EPS=1e-6;
const area=poly=>poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];
  return sum+p[0]*q[1]-q[0]*p[1];
},0)/2;
const absArea=poly=>Math.abs(area(poly));
const bounds=poly=>{
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [x,z] of poly){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  return {minX,maxX,minZ,maxZ};
};
const intersects=(a,b)=>a.minX<b.maxX-EPS&&a.maxX>b.minX+EPS&&
  a.minZ<b.maxZ-EPS&&a.maxZ>b.minZ+EPS;
const triangles=patch=>{
  if(patch.polygons)return patch.polygons.filter(p=>absArea(p)>EPS);
  const p=patch.quad.map(v=>[v[0],v.length===3?v[2]:v[1]]);
  return [[p[0],p[1],p[2]],[p[0],p[2],p[3]]]
    .filter(x=>absArea(x)>EPS);
};
const pointInTriangle=(p,a,b,c)=>{
  const s=(q,r)=> (r[0]-q[0])*(p[1]-q[1])-(r[1]-q[1])*(p[0]-q[0]);
  const a1=s(a,b),a2=s(b,c),a3=s(c,a);
  return !(a1>EPS||a2>EPS||a3>EPS)||
    !(a1< -EPS||a2< -EPS||a3< -EPS);
};
class PlanarIndex {
  constructor(cellSize=28){this.cellSize=cellSize;this.cells=new Map();}
  key(x,z,layer){return layer+":"+x+":"+z;}
  add(poly,meta){
    if(poly.length<3||absArea(poly)<EPS)return;
    const item={poly,box:bounds(poly),...meta};
    const b=item.box,c=this.cellSize;
    for(let x=Math.floor(b.minX/c);x<=Math.floor(b.maxX/c);x++)
      for(let z=Math.floor(b.minZ/c);z<=Math.floor(b.maxZ/c);z++){
        const key=this.key(x,z,item.layer);
        if(!this.cells.has(key))this.cells.set(key,[]);
        this.cells.get(key).push(item);
      }
  }
  query(box,layer){
    const c=this.cellSize,found=new Set();
    for(let x=Math.floor(box.minX/c);x<=Math.floor(box.maxX/c);x++)
      for(let z=Math.floor(box.minZ/c);z<=Math.floor(box.maxZ/c);z++)
        for(const v of this.cells.get(this.key(x,z,layer))||[])
          if(intersects(box,v.box))found.add(v);
    return [...found];
  }
  contains(p,layer){
    const c=this.cellSize;
    for(const item of this.cells.get(this.key(Math.floor(p[0]/c),
      Math.floor(p[1]/c),layer))||[]) {
      if(p[0]<item.box.minX-EPS||p[0]>item.box.maxX+EPS||
        p[1]<item.box.minZ-EPS||p[1]>item.box.maxZ+EPS)continue;
      // The asphalt layer has been triangulated; accepted sidewalk pieces
      // are convex but the containment helper is also valid for their fans.
      for(let i=1;i<item.poly.length-1;i++)
        if(pointInTriangle(p,item.poly[0],item.poly[i],
          item.poly[i+1]))return true;
    }
    return false;
  }
}
const heightAt=(patch,p)=>{
  const dx=patch.b[0]-patch.a[0],dz=patch.b[1]-patch.a[1];
  const length=dx*dx+dz*dz;
  const t=length>EPS?Math.max(0,Math.min(1,
    ((p[0]-patch.a[0])*dx+(p[1]-patch.a[1])*dz)/length)):0;
  return patch.h0+(patch.h1-patch.h0)*t;
};
const lift=(patch,p,up)=>[p[0],heightAt(patch,p)+up,p[1]];
/** Keep the editor's optional corner-recess control: it removes only the
 * segment of an already-correct curb edge next to a real shared OSM node.
 * No artificial circular ASPHALT or sidewalk polygons are introduced.
 */
export function retreatCurbAtJunctions(a,b,junctions,retreat=0){
  if(!(retreat>0)||!junctions?.length)return [[a,b]];
  const dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
  if(len<1e-8)return [];
  const removed=[];
  for(const j of junctions){
    const center=j.point,r=Math.max(2.8,(j.maxWidth||6)/2+.43)+retreat;
    const sx=a[0]-center[0],sz=a[1]-center[1],A=len,
      B=2*(sx*dx+sz*dz),C=sx*sx+sz*sz-r*r,
      discriminant=B*B-4*A*C;
    if(discriminant<=0)continue;
    const t0=Math.max(0,(-B-Math.sqrt(discriminant))/(2*A));
    const t1=Math.min(1,(-B+Math.sqrt(discriminant))/(2*A));
    if(t1>t0)removed.push([t0,t1]);
  }
  removed.sort((a,b)=>a[0]-b[0]);
  const kept=[];let cursor=0;
  for(const [start,end] of removed){
    if(start>cursor+.001)kept.push([cursor,start]);
    cursor=Math.max(cursor,end);
  }
  if(cursor<1-.001)kept.push([cursor,1]);
  const interpolate=t=>[a[0]+dx*t,a[1]+dz*t];
  return kept.filter(([start,end])=>(end-start)*Math.sqrt(len)>.1)
    .map(([start,end])=>[interpolate(start),interpolate(end)]);
}
/**
 * Warning: sidewalk meshes and curbs must use the same real asphalt
 * footprint; caller should pass the exact road ribbon patches consumed
 * by unionAsphaltPatches, not raw unsampled OSM ways.
 */
export function composeRoadsideMeshes(asphaltPatches,walkPatches,
  onSidewalk,onCurb,{cellSize=28,junctions=[],bevelCurbs=false}={}){
  const asphalt=new PlanarIndex(cellSize),sidewalks=new PlanarIndex(cellSize);
  for(const patch of asphaltPatches){
    const layer=physicalLayer(patch);
    for(const poly of triangles(patch))
      asphalt.add(poly,{layer});
  }
  // Priority ensures broad avenue sidewalk wins where pedestrian corridors
  // overlap; secondary strips are removed instead of fighting for Z.
  const sorted=[...walkPatches].sort((a,b)=>
    asphaltPriority(b)-asphaltPriority(a)||
    String(a.id).localeCompare(String(b.id)));
  const junctionsByWay=new Map();
  for(const j of junctions)for(const id of j.ways||[]){
    const key=String(id);
    if(!junctionsByWay.has(key))junctionsByWay.set(key,[]);
    junctionsByWay.get(key).push(j);
  }
  let groundPieces=0,clipOperations=0,curbSegments=0,discarded=0;
  for(const patch of sorted){
    const layer=physicalLayer(patch);
    for(const subject of triangles(patch)){
      let pieces=[subject];
      const mask=asphalt.query(bounds(subject),layer);
      for(const blocker of mask){
        pieces=pieces.flatMap(part=>{
          if(!intersects(bounds(part),blocker.box))return [part];
          clipOperations++;
          return subtractConvex(part,blocker.poly);
        });
        if(!pieces.length)break;
      }
      if(!pieces.length){discarded++;continue;}
      // Rebuild a single, non-overlapping sidewalk union, not independent
      // ribbons stacked at corners. Split against already accepted fragments.
      const seen=new Set();
      for(const blocker of pieces.flatMap(p=>sidewalks.query(bounds(p),layer)))
        seen.add(blocker);
      for(const blocker of seen){
        pieces=pieces.flatMap(part=>{
          if(!intersects(bounds(part),blocker.box))return [part];
          clipOperations++;
          return subtractConvex(part,blocker.poly);
        });
        if(!pieces.length)break;
      }
      for(const poly of pieces){
        if(poly.length<3||absArea(poly)<1e-4)continue;
        sidewalks.add(poly,{layer,source:patch});
        const top=patch.curbTop??.18;
        for(let i=1;i<poly.length-1;i++)
          onSidewalk([lift(patch,poly[0],top),
            lift(patch,poly[i],top),lift(patch,poly[i+1],top)],patch);
        groundPieces++;
      }
    }
  }
  // After all polygon subtraction, only the edges bordering asphalt are
  // curb candidates. A small bevel gives the raised edge a rounded profile
  // without shifting the actual asphalt perimeter or creating a curb across
  // a junction. It extends INTO the sidewalk, never into the road.
  const visited=new Set();let curbFaces=0;
  for(const rows of sidewalks.cells.values())for(const item of rows){
    if(visited.has(item))continue;
    visited.add(item);
    const poly=item.poly,layer=item.layer,patch=item.source;
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],
        dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      if(len<.1)continue;
      const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      const nx=-dz/len,nz=dx/len,probe=.065;
      const before=asphalt.contains([midpoint[0]+nx*probe,
        midpoint[1]+nz*probe],layer);
      const after=asphalt.contains([midpoint[0]-nx*probe,
        midpoint[1]-nz*probe],layer);
      if(before===after)continue;
      const h=patch.curbTop??.18;
      if(h<=.042)continue;
      // Detailed finish is only needed in intersections. On long straight
      // streets a simple single wall avoids tripling GPU triangles for
      // kilometres of sidewalk.
      const localJunctions=junctionsByWay.get(String(patch.id))||[];
      const nearJunction=localJunctions.some(j=>
        Math.hypot(midpoint[0]-j.point[0],
          midpoint[1]-j.point[1])<
          Math.max(13,(j.maxWidth||6)/2+8));
      const softened=bevelCurbs&&nearJunction;
      const sidewalkDir=before?-1:1;
      const inset=(p,m)=>[p[0]+nx*sidewalkDir*m,p[1]+nz*sidewalkDir*m];
      for(const [start,end] of retreatCurbAtJunctions(a,b,
        junctionsByWay.get(String(patch.id)),
        patch.cornerClearanceMeters||0)){
        if(!softened || h<=.08){
          onCurb([lift(patch,start,.04),lift(patch,end,.04),
            lift(patch,end,h),lift(patch,start,h)],patch);
          curbFaces++;
        }else{
          // Concave rounded bevel approx. 3 continuous longitudinal strips.
          // At m=0 the curb meets the real asphalt boundary exactly; at
          // m=.08 it fades into the existing sidewalk top. This creates no
          // additional asphalt, calçada, or independent corner caps.
          const shoulder=Math.min(.045,(h-.04)*.33);
          const profile=[
            {m:0,y:.04},
            {m:0,y:h-shoulder},
            {m:.035,y:h-.011},
            {m:.08,y:h+.002}
          ];
          for(let k=1;k<profile.length;k++){
            const first=profile[k-1],last=profile[k];
            onCurb([
              lift(patch,inset(start,first.m),first.y),
              lift(patch,inset(end,first.m),first.y),
              lift(patch,inset(end,last.m),last.y),
              lift(patch,inset(start,last.m),last.y)
            ],patch);
            curbFaces++;
          }
        }
        curbSegments++;
      }
    }
  }
  return {sidewalkPolygons:groundPieces,curbSegments,curbFaces,
    droppedAgainstAsphalt:discarded,clipOperations};
}
