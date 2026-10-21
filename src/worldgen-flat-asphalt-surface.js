/**
 * WorldGen 7.0: All ground-level OSM streets are painted on the SAME
 * logical flat surface as the terrain. No per-road pavement meshes,
 * no polygon seams and no rasterized connectors invented across gaps.
 *
 * A texture is a rendering/cache chunk ONLY. Every brush stroke uses
 * immutable world metre coordinates and the same global OSM graph.
 * This module is pure JS (does not require DOM or Three.js).
 */
import {physicalLayer} from "./asphalt-union.js";

export const FLAT_ASPHALT_TILE_METRES=420;
export const FLAT_ASPHALT_TEXTURE_PIXELS=768;
export const FLAT_ASPHALT_GUTTER_PIXELS=2;
export const FLAT_ASPHALT_COLOR="#3f484e";
export const FLAT_TERRAIN_COLOR="#a5b89d";

const key=(gx,gz)=>gx+":"+gz;
const roadWidth=road=>{
  const width=Number(road.widthMeters);
  return Number.isFinite(width)&&width>0?width:7;
};
const asphaltWay=road=>physicalLayer(road)===0&&
  !road.bridge&&!road.tunnel;
export function createFlatAsphaltPlan(roads,{
  tileMetres=FLAT_ASPHALT_TILE_METRES
}={}){
  if(!Array.isArray(roads)||tileMetres<=0)
    throw new Error("Flat asphalt requires OSM roads and a valid tile size");
  const index=new Map(),ways=new Map();
  let eligible=0;
  for(const road of roads){
    if(!asphaltWay(road)||!Array.isArray(road.p)||road.p.length<2)
      continue;
    const id=String(road.id);
    ways.set(id,road);
    eligible++;
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(const point of road.p){
      minX=Math.min(minX,point[0]);
      minZ=Math.min(minZ,point[1]);
      maxX=Math.max(maxX,point[0]);
      maxZ=Math.max(maxZ,point[1]);
    }
    const radius=roadWidth(road)/2+1;
    for(let gx=Math.floor((minX-radius)/tileMetres);
      gx<=Math.floor((maxX+radius)/tileMetres);gx++)
      for(let gz=Math.floor((minZ-radius)/tileMetres);
        gz<=Math.floor((maxZ+radius)/tileMetres);gz++){
        const idTile=key(gx,gz);
        if(!index.has(idTile))index.set(idTile,new Set());
        index.get(idTile).add(id);
      }
  }
  function waysForTile(gx,gz){
    return [...(index.get(key(gx,gz))||[])].map(id=>ways.get(id));
  }
  /**
   * Paint every OSM centreline with its true metric width. A round stroke
   * at shared nodes automatically makes a continuous junction footprint
   * without duplicating triangles or constructing false OSM connections.
   */
  function drawTile(ctx,gx,gz,{
    resolution=FLAT_ASPHALT_TEXTURE_PIXELS,
    gutter=FLAT_ASPHALT_GUTTER_PIXELS,
    asphaltColor=FLAT_ASPHALT_COLOR,
    terrainColor=FLAT_TERRAIN_COLOR
  }={}){
    const dimension=resolution+gutter*2;
    const scale=resolution/tileMetres;
    ctx.fillStyle=terrainColor;
    ctx.fillRect(0,0,dimension,dimension);
    ctx.lineJoin="round";
    ctx.lineCap="round";
    ctx.strokeStyle=asphaltColor;
    const ox=gx*tileMetres,oz=gz*tileMetres;
    let painted=0;
    for(const road of waysForTile(gx,gz)){
      const points=road.p;
      ctx.beginPath();
      for(let i=0;i<points.length;i++){
        const x=(points[i][0]-ox)*scale+gutter;
        const z=(points[i][1]-oz)*scale+gutter;
        if(i===0)ctx.moveTo(x,z);else ctx.lineTo(x,z);
      }
      ctx.lineWidth=roadWidth(road)*scale;
      ctx.stroke();
      painted++;
    }
    return {painted,dimension,resolution,gutter};
  }
  return {drawTile,waysForTile,
    stats:{sourceWays:roads.length,flatGroundWays:eligible,
      indexedTiles:index.size,tileMetres}};
}

/**
 * PlaneGeometry's UV (0,1) is north-west in world coordinates once rotated
 * onto X/Z. Include a small texture gutter to avoid dark mip-map seams.
 */
export function flatAsphaltUv(u,v,{
  resolution=FLAT_ASPHALT_TEXTURE_PIXELS,
  gutter=FLAT_ASPHALT_GUTTER_PIXELS
}={}){
  const size=resolution+2*gutter;
  return [
    (gutter+u*resolution)/size,
    (gutter+v*resolution)/size
  ];
}
