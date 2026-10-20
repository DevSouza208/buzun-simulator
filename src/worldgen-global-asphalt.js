/**
 * WorldGen 6.3 — ONE canonical planar asphalt atlas for the entire OSM city.
 *
 * Atlas cells only partition the GLOBAL union for bounded memory and lazy
 * loading. No region recomposes its own version of a road junction.
 * Connected carriageways share one polygonal footprint; legitimate OSM
 * islands and bridge/tunnel levels remain separate connected components.
 *
 * This module deliberately has no Three.js dependency.
 */
import {asphaltPriority,unionAsphaltPatches} from "./asphalt-union.js";
import {bboxForRoad,clip3DTriangle} from "./worldgen-region-stream.js";
import {buildJunctionFillets} from "./junction-fillets.js";

export const ASPHALT_ATLAS_CELL_METRES=220;
export const ASPHALT_ATLAS_HALO_METRES=32;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cellKey=(x,z)=>x+":"+z;
const bounds=(gx,gz,size)=>({minX:gx*size,maxX:(gx+1)*size,
  minZ:gz*size,maxZ:(gz+1)*size});
const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&
  a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
function patchBounds(p) {
  const vertices=p.quad?.map(v=>[v[0],v[2]])||
    p.polygons?.flat()||[];
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const [x,z] of vertices){
    minX=Math.min(minX,x);minZ=Math.min(minZ,z);
    maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);
  }
  return {minX,minZ,maxX,maxZ};
}
function normalAt(points,i) {
  const prev=points[Math.max(0,i-1)],p=points[i],
    next=points[Math.min(points.length-1,i+1)];
  const dx=p[0]-prev[0],dz=p[1]-prev[1],
    ex=next[0]-p[0],ez=next[1]-p[1],
    dl=Math.hypot(dx,dz),el=Math.hypot(ex,ez);
  const tx=dl>.02?dx/dl:ex/(el||1),
    tz=dl>.02?dz/dl:ez/(el||1);
  const ux=el>.02?ex/el:tx,uz=el>.02?ez/el:tz;
  const nx=-tz,nz=tx,mx=-(tz+uz),mz=tx+ux,
    ml=Math.hypot(mx,mz);
  if(ml<.25)return [nx,nz];
  const dot=Math.max(.96,(mx/ml)*nx+(mz/ml)*nz);
  return [mx/ml/dot,mz/ml/dot];
}
function roadPatches(road,worldSheet) {
  const rows=worldSheet.sectionsFor(road);
  if(!rows||rows.length<2)return [];
  const points=rows.map(r=>r.p);
  const normal=points.map((_,i)=>normalAt(points,i));
  const half=(Number(road.widthMeters)||7)/2;
  const patch=[];
  const side=(i,sign)=>[
    points[i][0]+normal[i][0]*half*sign,
    rows[i].base+.072,
    points[i][1]+normal[i][1]*half*sign
  ];
  for(let i=1;i<rows.length;i++){
    if(Math.hypot(points[i][0]-points[i-1][0],
      points[i][1]-points[i-1][1])<.02)continue;
    patch.push({
      id:road.id,t:road.t,widthMeters:half*2,
      layer:road.layer||0,bridge:road.bridge,tunnel:road.tunnel,
      a:points[i-1],b:points[i],
      h0:rows[i-1].base,h1:rows[i].base,
      quad:[side(i-1,-1),side(i,-1),side(i,1),side(i-1,1)]
    });
  }
  return patch;
}
/**
 * All source ways are indexed ONCE across the WHOLE map; each canonical
 * 220m cell gets every road polygon overlapping its 32m safety neighborhood.
 * A cell union is computed only once and cached, and its triangles are clipped
 * to the same global cell boundary before being sliced into render regions.
 */
export function createGlobalAsphaltAtlas(roads,worldSheet,{
  junctions=[],gradeModels=null,naturalHeight=()=>0,
  cellMetres=ASPHALT_ATLAS_CELL_METRES,
  halo=ASPHALT_ATLAS_HALO_METRES,
  maxCachedCells=32,maxCachedRoads=90
}={}){
  if(!Array.isArray(roads)||!worldSheet?.sectionsFor)
    throw Error("Global asphalt atlas requires all OSM ways and one WorldSheet");
  const index=new Map(),sourceRoads=new Map(),patchCache=new Map(),
    cellCache=new Map();
  function indexOne(target,bbox,pad=halo){
    const gx0=Math.floor((bbox.minX-pad)/cellMetres),
      gx1=Math.floor((bbox.maxX+pad)/cellMetres),
      gz0=Math.floor((bbox.minZ-pad)/cellMetres),
      gz1=Math.floor((bbox.maxZ+pad)/cellMetres);
    for(let gx=gx0;gx<=gx1;gx++)
      for(let gz=gz0;gz<=gz1;gz++){
        const id=cellKey(gx,gz);
        if(!index.has(id))index.set(id,[]);
        index.get(id).push(target);
      }
  }
  for(const road of roads){
    const id=String(road.id);
    if(!Array.isArray(road.p)||road.p.length<2)continue;
    sourceRoads.set(id,road);
    indexOne({kind:"road",id},bboxForRoad(road),
      halo+(Number(road.widthMeters)||7));
  }
  // Fillets are derived from the complete city graph, not a selection of
  // regional OSM ways. Identical junctions cannot create different corners.
  const fillets=buildJunctionFillets(roads,junctions,naturalHeight,
    {gradeModels:gradeModels?.models||[]}).patches;
  fillets.forEach((patch,i)=>indexOne({kind:"fillet",i},
    patchBounds(patch)));
  let built=0,cacheHits=0;
  function patchesFor(id) {
    if(patchCache.has(id)){
      const saved=patchCache.get(id);
      patchCache.delete(id);patchCache.set(id,saved);
      return saved;
    }
    const prepared=roadPatches(sourceRoads.get(id),worldSheet);
    patchCache.set(id,prepared);
    if(patchCache.size>maxCachedRoads)
      patchCache.delete(patchCache.keys().next().value);
    return prepared;
  }
  function composeCell(gx,gz) {
    const id=cellKey(gx,gz);
    if(cellCache.has(id)){
      const cached=cellCache.get(id);
      cellCache.delete(id);cellCache.set(id,cached);
      cacheHits++;
      return cached;
    }
    const current=bounds(gx,gz,cellMetres);
    const padded={
      minX:current.minX-halo,maxX:current.maxX+halo,
      minZ:current.minZ-halo,maxZ:current.maxZ+halo
    };
    const candidates=index.get(id)||[];
    const chosen=new Set(),input=[];
    for(const candidate of candidates){
      if(candidate.kind==="fillet"){
        const patch=fillets[candidate.i];
        if(overlaps(patchBounds(patch),padded))input.push(patch);
        continue;
      }
      if(chosen.has(candidate.id))continue;
      chosen.add(candidate.id);
      for(const patch of patchesFor(candidate.id))
        if(overlaps(patchBounds(patch),padded))input.push(patch);
    }
    const positions=[];
    const stats=unionAsphaltPatches(input,tri=>{
      for(const clipped of clip3DTriangle(tri,current))
        for(const vertex of clipped)positions.push(...vertex);
    });
    const result={positions,stats};
    cellCache.set(id,result);built++;
    if(cellCache.size>maxCachedCells)
      cellCache.delete(cellCache.keys().next().value);
    return result;
  }
  // Cooperative region assembly: yield AFTER each complete global cell,
  // rather than performing an independent polygon union for a road subset.
  function* composeRegionSteps(region,emit){
    let tiles=0,triangles=0,unionClipped=0;
    const gx0=Math.floor(region.minX/cellMetres),
      gx1=Math.floor((region.maxX-1e-7)/cellMetres),
      gz0=Math.floor(region.minZ/cellMetres),
      gz1=Math.floor((region.maxZ-1e-7)/cellMetres);
    for(let gx=gx0;gx<=gx1;gx++)
      for(let gz=gz0;gz<=gz1;gz++){
        const item=composeCell(gx,gz);
        for(let i=0;i<item.positions.length;i+=9){
          const tri=[
            item.positions.slice(i,i+3),
            item.positions.slice(i+3,i+6),
            item.positions.slice(i+6,i+9)
          ];
          for(const clipped of clip3DTriangle(tri,region)){
            emit(clipped);
            triangles++;
          }
        }
        unionClipped+=item.stats.clipped||0;
        yield {stage:"atlas_global",done:++tiles,
          total:(gx1-gx0+1)*(gz1-gz0+1)};
      }
    return {inputTriangles:triangles,outputTriangles:triangles,
      clipped:unionClipped,atlasTiles:tiles,globalAtlas:true};
  }
  return {composeCell,composeRegionSteps,
    get stats(){return {sourceWays:sourceRoads.size,
      globalFillets:fillets.length,canonicalTilesBuilt:built,
      canonicalTilesCached:cellCache.size,cacheHits};}};
}
