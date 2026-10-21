/**
 * WorldGen 7.2 — real vector road geometry, not a rasterized Canvas texture.
 *
 * All 4,777 source OSM ways remain exact metre-based X/Z paths. Each way
 * generates coloured segment strips and rounded joints for the three flat
 * ground layers: sidewalk, thin curb and asphalt. The city has one logical
 * vector atlas; 420m chunks receive only clipped triangles from that atlas.
 *
 * The output is deliberately Three.js-free, testable with node --test.
 * There are no artificial connectors between distinct OSM roads.
 */
import {physicalLayer} from "./asphalt-union.js";
import {ROAD_DETAIL_DEFAULT,arcStepsForRoadRadius} from "./vector-road-quality.js";
import {sidewalkWidth} from "./road-corridor.js";
import {clip3DTriangle} from "./worldgen-region-stream.js";
import {FLAT_ASPHALT_TILE_METRES,FLAT_CURB_BORDER_METRES}
  from "./worldgen-flat-asphalt-surface.js";

export const VECTOR_ROAD_HEIGHTS=Object.freeze({
  sidewalk:.073,curb:.074,asphalt:.075
});
export const VECTOR_ROAD_COLORS=Object.freeze({
  sidewalk:"#ccc4b6",curb:"#eee1cf",asphalt:"#3f484e"
});
const KINDS=["sidewalk","curb","asphalt"];
const key=(gx,gz)=>gx+":"+gz;
const widthOf=road=>{
  const n=Number(road.widthMeters);
  return Number.isFinite(n)&&n>0?n:7;
};
const radiusOf=(item,kind)=>
  kind==="sidewalk"?item.half+item.walk:
  kind==="curb"?item.half+FLAT_CURB_BORDER_METRES:item.half;

const bounds=(gx,gz,size)=>({
  minX:gx*size,maxX:(gx+1)*size,
  minZ:gz*size,maxZ:(gz+1)*size
});
/** True vector geometry: clipping happens AFTER computing each full
 * world-space primitive. Neighbor tiles therefore cut the SAME geometry.
 */
export function createFlatVectorRoadPlan(roads,{
  tileMetres=FLAT_ASPHALT_TILE_METRES
}={}){
  if(!Array.isArray(roads)||!(tileMetres>0))
    throw Error("Vector road atlas requires OSM ways and positive tile size");
  const tileIndex=new Map();
  let roadsEligible=0,segments=0,joints=0;
  function insert(primitive,radius,centerX,centerZ,farX=centerX,farZ=centerZ){
    const minX=Math.min(centerX,farX)-radius,
      maxX=Math.max(centerX,farX)+radius,
      minZ=Math.min(centerZ,farZ)-radius,
      maxZ=Math.max(centerZ,farZ)+radius;
    for(let gx=Math.floor(minX/tileMetres);
      gx<=Math.floor(maxX/tileMetres);gx++)
      for(let gz=Math.floor(minZ/tileMetres);
        gz<=Math.floor(maxZ/tileMetres);gz++){
        const id=key(gx,gz);
        if(!tileIndex.has(id))tileIndex.set(id,[]);
        tileIndex.get(id).push(primitive);
      }
  }
  for(const road of roads){
    if(physicalLayer(road)!==0||road.bridge||road.tunnel||
      !Array.isArray(road.p)||road.p.length<2)continue;
    const half=widthOf(road)/2,walk=sidewalkWidth(road),
      far=half+walk,points=road.p;
    const existing=new Set();
    const normalized=[];
    for(const p of points){
      if(!Array.isArray(p)||!Number.isFinite(p[0])||
        !Number.isFinite(p[1]))continue;
      if(!normalized.length||
        Math.hypot(p[0]-normalized.at(-1)[0],
          p[1]-normalized.at(-1)[1])>.02)
        normalized.push(p);
    }
    if(normalized.length<2)continue;
    roadsEligible++;
    for(let i=1;i<normalized.length;i++){
      const a=normalized[i-1],b=normalized[i];
      const item={kind:"segment",roadId:String(road.id),
        ax:a[0],az:a[1],bx:b[0],bz:b[1],half,walk};
      insert(item,far,a[0],a[1],b[0],b[1]);
      segments++;
    }
    // Rounded caps at ends, rounded joins only where direction
    // changes enough to expose a wedge between two rectangles.
    for(let i=0;i<normalized.length;i++){
      let include=i===0||i===normalized.length-1;
      if(!include){
        const a=normalized[i-1],p=normalized[i],b=normalized[i+1];
        const ux=p[0]-a[0],uz=p[1]-a[1],
          vx=b[0]-p[0],vz=b[1]-p[1];
        const du=Math.hypot(ux,uz),dv=Math.hypot(vx,vz);
        const dot=(ux*vx+uz*vz)/(du*dv);
        include=dot<.9986; // ~3 degrees
      }
      if(!include)continue;
      const p=normalized[i],id=String(road.id)+":"+i;
      if(existing.has(id))continue;
      existing.add(id);
      insert({kind:"joint",roadId:String(road.id),
        x:p[0],z:p[1],half,walk},far,p[0],p[1]);
      joints++;
    }
  }
  function tileTriangles(gx,gz,detail=ROAD_DETAIL_DEFAULT){
    const box=bounds(gx,gz,tileMetres),
      originX=(gx+.5)*tileMetres,
      originZ=(gz+.5)*tileMetres;
    const out={sidewalk:[],curb:[],asphalt:[]},
      candidates=tileIndex.get(key(gx,gz))||[];
    function emit(kind,tri){
      for(const clipped of clip3DTriangle(tri,box))
        for(const p of clipped)
          out[kind].push(p[0]-originX,p[1],p[2]-originZ);
    }
    for(const item of candidates)
      for(const kind of KINDS){
        const r=radiusOf(item,kind),
          y=VECTOR_ROAD_HEIGHTS[kind];
        if(item.kind==="segment"){
          const dx=item.bx-item.ax,dz=item.bz-item.az;
          const len=Math.hypot(dx,dz);
          if(len<.02)continue;
          const nx=-dz/len*r,nz=dx/len*r;
          const a=[item.ax+nx,y,item.az+nz],
            b=[item.bx+nx,y,item.bz+nz],
            c=[item.bx-nx,y,item.bz-nz],
            d=[item.ax-nx,y,item.az-nz];
          emit(kind,[a,b,c]);
          emit(kind,[a,c,d]);
        }else{
          // Arc precision is proportional to the physical radius. The same
          // number of wedges is used when the same joint is seen from
          // either side of a chunk boundary.
          const steps=arcStepsForRoadRadius(r,detail);
          const mid=[item.x,y,item.z];
          for(let i=0;i<steps;i++){
            const a=2*Math.PI*i/steps,b=2*Math.PI*(i+1)/steps;
            emit(kind,[mid,
              [item.x+Math.cos(a)*r,y,item.z+Math.sin(a)*r],
              [item.x+Math.cos(b)*r,y,item.z+Math.sin(b)*r]]);
          }
        }
      }
    return {layers:out,sourcePrimitives:candidates.length,
      triangles:KINDS.reduce((n,k)=>n+out[k].length/9,0)};
  }
  return {tileTriangles,
    stats:{sourceWays:roads.length,flatGroundWays:roadsEligible,
      segments,joints,indexedTiles:tileIndex.size,tileMetres}};
}
