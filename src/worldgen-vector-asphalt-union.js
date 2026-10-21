/**
 * WorldGen 7.5: vector boolean union of same-level carriageway triangles.
 * Every asphalt triangle is clipped against already claimed asphalt in
 * metres BEFORE it reaches WebGL. Unlike overlaid ribbon meshes, the
 * resulting 2D footprints cannot overlap at a T / X / Y intersection.
 *
 * Input triangles use LOCAL chunk coordinates [x,y,z]; caller owns the
 * canonical height field. All emitted intersections are re-sampled using
 * that same height field so they don't inherit different per-way slopes.
 */
import {subtractConvex} from "./asphalt-union.js";

const EPS=1e-6;
const area=poly=>poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];
  return sum+p[0]*q[1]-q[0]*p[1];
},0)*.5;
const bbox=p=>{
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const a of p){minX=Math.min(minX,a[0]);maxX=Math.max(maxX,a[0]);
    minZ=Math.min(minZ,a[1]);maxZ=Math.max(maxZ,a[1]);}
  return {minX,maxX,minZ,maxZ};
};
const intersects=(a,b)=>a.minX<b.maxX-EPS&&b.minX<a.maxX-EPS&&
  a.minZ<b.maxZ-EPS&&b.minZ<a.maxZ-EPS;
const same=(a,b)=>Math.abs(a-b)<EPS;
function projectHeight(a,b,c,x,z){
  const denom=(b[2]-c[2])*(a[0]-c[0])+
    (c[0]-b[0])*(a[2]-c[2]);
  if(Math.abs(denom)<EPS)return a[1];
  const u=((b[2]-c[2])*(x-c[0])+
    (c[0]-b[0])*(z-c[2]))/denom;
  const v=((c[2]-a[2])*(x-c[0])+
    (a[0]-c[0])*(z-c[2]))/denom;
  return u*a[1]+v*b[1]+(1-u-v)*c[1];
}
/**
 * Priority is supplied by asphaltPriority(OSM road), but no other road
 * data is changed. Works per chunk with a spatial broadphase, so loading
 * nearby geometry never needs to iterate the 4,777 OSM ways globally.
 */
export function unionVectorAsphaltTriangles(patches,{
  cellSize=22,heightAt=null
}={}){
  if(!(cellSize>0))throw Error("cellSize must be positive");
  const indexed=new Map(),flat=[],stats={
    inputTriangles:patches.length,outputTriangles:0,
    overlaps:0,removed:0,fragments:0
  };
  const sorted=patches.map((patch,i)=>{
    const poly=patch.vertices.map(v=>[v[0],v[2]]);
    return {...patch,poly,bounds:bbox(poly),index:i};
  }).filter(p=>Math.abs(area(p.poly))>EPS).sort((a,b)=>
    (b.priority||0)-(a.priority||0)||
    String(a.roadId).localeCompare(String(b.roadId))||
    a.index-b.index);
  const key=(x,z)=>x+":"+z;
  const cells=box=>{
    const ids=[];
    for(let x=Math.floor(box.minX/cellSize);x<=Math.floor(box.maxX/cellSize);x++)
      for(let z=Math.floor(box.minZ/cellSize);z<=Math.floor(box.maxZ/cellSize);z++)
        ids.push(key(x,z));
    return ids;
  };
  for(const patch of sorted){
    const ids=cells(patch.bounds),seen=new Set();
    let pieces=[patch.poly];
    for(const id of ids){
      for(const previous of indexed.get(id)||[]){
        if(seen.has(previous))continue;
        seen.add(previous);
        if(!intersects(patch.bounds,previous.bounds))continue;
        const beforeArea=pieces.reduce(
          (sum,p)=>sum+Math.abs(area(p)),0);
        const next=[];
        for(const piece of pieces){
          if(!intersects(bbox(piece),previous.bounds))next.push(piece);
          else next.push(...subtractConvex(piece,previous.poly));
        }
        const afterArea=next.reduce(
          (sum,p)=>sum+Math.abs(area(p)),0);
        if(beforeArea-afterArea>EPS)stats.overlaps++;
        pieces=next;
        if(!pieces.length)break;
      }
      if(!pieces.length)break;
    }
    if(!pieces.length)stats.removed++;
    for(const poly of pieces){
      for(let i=1;i<poly.length-1;i++){
        const tri=[poly[0],poly[i],poly[i+1]];
        if(Math.abs(area(tri))<=EPS)continue;
        for(const [x,z] of tri){
          const y=heightAt?heightAt(x,z):
            projectHeight(...patch.vertices,x,z);
          flat.push(x,y,z);
        }
        stats.outputTriangles++;
      }
      stats.fragments++;
    }
    // Keep each original projected triangle as a single convex cutter.
    // It includes regions covered by previously emitted geometry.
    for(const id of ids){
      if(!indexed.has(id))indexed.set(id,[]);
      indexed.get(id).push(patch);
    }
  }
  return {positions:flat,stats};
}
