import {regionAt,regionBounds,regionKey,REGION_METRES}
  from "./worldgen-region-stream.js";

/**
 * 5.18: authoritative height queries across streaming region borders.
 *
 * Every regional road index contains complete OSM ways from a 52 m halo,
 * even though the visible triangles are clipped to its 880 m rectangle.
 * Reuse that already-computed height when the cell owner isn't ready.
 * Blend ONLY matching, same-layer asphalt/sidewalk IDs across a tiny seam
 * to avoid a collision jolt from small independent DEM smoothing errors.
 */
export const BOUNDARY_HEIGHT_MARGIN=9;
export const BOUNDARY_PREFETCH_METRES=130;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function adjacentRoadRegions(x,z,{
  size=REGION_METRES,margin=BOUNDARY_HEIGHT_MARGIN
}={}){
  const owner=regionAt(x,z,size),b=regionBounds(owner.x,owner.z,size);
  const xs=[0],zs=[0];
  if(x-b.minX<=margin)xs.push(-1);
  if(b.maxX-x<=margin)xs.push(1);
  if(z-b.minZ<=margin)zs.push(-1);
  if(b.maxZ-z<=margin)zs.push(1);
  const neighbors=[];
  for(const dx of xs)for(const dz of zs)
    neighbors.push({x:owner.x+dx,z:owner.z+dz,
      key:regionKey(owner.x+dx,owner.z+dz),dx,dz});
  // Owner first, then axial neighbors, then a diagonal if near a corner.
  return neighbors.sort((a,b)=>
    (Math.abs(a.dx)+Math.abs(a.dz))-
    (Math.abs(b.dx)+Math.abs(b.dz)));
}
export function sampleSceneryRoadHeight(scenery,x,z){
  if(!scenery?.surface?.sample)return null;
  const road=scenery.surface.sample(x,z);
  const insideRoad=road&&road.distance<=road.halfWidth+.08;
  if(insideRoad)return {height:road.height+.072,kind:"asphalt",
    roadId:road.roadId,layer:road.layer??0};
  const corner=scenery.filletSurface?.sample(x,z,0);
  if(corner!==null&&corner!==undefined&&Number.isFinite(corner))
    return {height:corner,kind:"corner",roadId:null,layer:null};
  const ramp=scenery.rampSurface?.heightAt(x,z,scenery.surface);
  if(ramp!==null&&ramp!==undefined&&Number.isFinite(ramp))
    return {height:ramp,kind:"ramp",roadId:null,layer:null};
  if(road&&road.distance<=road.halfWidth+road.walk)
    return {height:road.height+(road.curbTop??.18),
      kind:"sidewalk",roadId:road.roadId,layer:road.layer??0};
  return null;
}
function seamlessHeight(x,z,a,b,size,margin){
  if(a.hit.kind!==b.hit.kind||
     !["asphalt","sidewalk"].includes(a.hit.kind)||
     String(a.hit.roadId)!==String(b.hit.roadId)||
     a.hit.layer!==b.hit.layer||
     Math.abs(a.hit.height-b.hit.height)>.45)return null;
  const dx=b.cell.x-a.cell.x,dz=b.cell.z-a.cell.z;
  if(Math.abs(dx)+Math.abs(dz)!==1)return null;
  if(dx){
    const right=dx>0?b:a,left=dx>0?a:b,
      border=right.cell.x*size;
    const weight=clamp((x-border+margin)/(2*margin),0,1);
    return left.hit.height*(1-weight)+right.hit.height*weight;
  }
  const north=dz>0?b:a,south=dz>0?a:b,
    border=north.cell.z*size;
  const weight=clamp((z-border+margin)/(2*margin),0,1);
  return south.hit.height*(1-weight)+north.hit.height*weight;
}
export function resolveRegionalHeight(x,z,getScenery,{
  size=REGION_METRES,margin=BOUNDARY_HEIGHT_MARGIN,
  onBlend=null
}={}){
  const candidates=adjacentRoadRegions(x,z,{size,margin});
  const available=[];
  for(const cell of candidates){
    const scenery=getScenery(cell.x,cell.z);
    if(!scenery)continue;
    const hit=sampleSceneryRoadHeight(scenery,x,z);
    if(hit)available.push({cell,hit});
  }
  if(!available.length)return null;
  const chosen=available[0];
  if(chosen.cell.dx!==0||chosen.cell.dz!==0)
    return {...chosen.hit,fromNeighbor:true,blended:false};
  const neighbor=available.find(({cell,hit})=>
    Math.abs(cell.dx)+Math.abs(cell.dz)===1&&
    hit.kind===chosen.hit.kind&&
    String(hit.roadId)===String(chosen.hit.roadId));
  if(neighbor){
    const blended=seamlessHeight(x,z,chosen,neighbor,size,margin);
    if(blended!==null){
      if(Math.abs(blended-chosen.hit.height)>1e-6)onBlend?.();
      return {...chosen.hit,height:blended,
        fromNeighbor:false,blended:true};
    }
  }
  return {...chosen.hit,fromNeighbor:false,blended:false};
}
/** The terrain cutter can reuse an adjacent ready road surface if the
 * region owner is still being generated. Never use distant/off-road hits.
 */
export function resolveRegionalSurface(x,z,getScenery,{
  size=REGION_METRES,margin=BOUNDARY_HEIGHT_MARGIN
}={}){
  for(const cell of adjacentRoadRegions(x,z,{size,margin})){
    const hit=getScenery(cell.x,cell.z)?.surface?.sample(x,z);
    if(hit&&hit.distance<=hit.halfWidth+hit.walk+6)
      return hit;
  }
  return null;
}
/** Predict the next cell along the actual bus movement vector.
 * The positive epsilon crosses the boundary even with negative coords.
 */
export function roadRegionAhead(x,z,heading,{
  size=REGION_METRES,lookAhead=BOUNDARY_PREFETCH_METRES
}={}){
  const norm=Math.hypot(heading?.[0]||0,heading?.[1]||0);
  if(norm<.01)return null;
  const vx=heading[0]/norm,vz=heading[1]/norm;
  const cell=regionAt(x,z,size),b=regionBounds(cell.x,cell.z,size);
  const tx=vx>1e-9?(b.maxX-x)/vx:
    vx< -1e-9?(b.minX-x)/vx:Infinity;
  const tz=vz>1e-9?(b.maxZ-z)/vz:
    vz< -1e-9?(b.minZ-z)/vz:Infinity;
  const distance=Math.max(0,Math.min(tx,tz));
  if(!Number.isFinite(distance)||distance>lookAhead)return null;
  const next=regionAt(x+vx*(distance+.002),
    z+vz*(distance+.002),size);
  if(next.x===cell.x&&next.z===cell.z)return null;
  return {x:next.x,z:next.z,key:regionKey(next.x,next.z),
    distance};
}
