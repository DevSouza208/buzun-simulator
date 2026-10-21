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
import {physicalLayer,asphaltPriority} from "./asphalt-union.js";
import {unionVectorAsphaltTriangles} from "./worldgen-vector-asphalt-union.js";
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
// 10cm safety band protects rasterized triangle boundaries from floating
// point and MSAA coverage differences when adjacent 420m tiles meet.
// The same canonical OSM primitives are clipped in both tiles.
export const VECTOR_SEAM_GUARD_METRES=.10;
const key=(gx,gz)=>gx+":"+gz;
const widthOf=road=>{
  const n=Number(road.widthMeters);
  return Number.isFinite(n)&&n>0?n:7;
};
const radiusOf=(item,kind)=>
  kind==="sidewalk"?item.half+item.walk:
  kind==="curb"?item.half+FLAT_CURB_BORDER_METRES:item.half;

export const vectorTileClipBounds=(gx,gz,size,
  guard=VECTOR_SEAM_GUARD_METRES)=>({
  minX:gx*size-guard,maxX:(gx+1)*size+guard,
  minZ:gz*size-guard,maxZ:(gz+1)*size+guard
});
/** True vector geometry: clipping happens AFTER computing each full
 * world-space primitive. Neighbor tiles therefore cut the SAME geometry.
 */
export function createFlatVectorRoadPlan(roads,{
  tileMetres=FLAT_ASPHALT_TILE_METRES,
  seamGuardMetres=VECTOR_SEAM_GUARD_METRES,
  sampleHeight=null,reliefSampleMetres=5,
  asphaltOnly=false
}={}){
  if(!Array.isArray(roads)||!(tileMetres>0))
    throw Error("Vector road atlas requires OSM ways and positive tile size");
  if(!Number.isFinite(seamGuardMetres)||
      seamGuardMetres<0||seamGuardMetres>.5)
    throw Error("Vector tile seam guard must be between 0 and 0.5m");
  const tileIndex=new Map();
  let roadsEligible=0,segments=0,joints=0;
  function insert(primitive,radius,centerX,centerZ,farX=centerX,farZ=centerZ){
    // A tile must know about primitives whose true footprint ends
    // just outside its nominal edge but inside the 10cm guard band.
    const reach=radius+seamGuardMetres;
    const minX=Math.min(centerX,farX)-reach,
      maxX=Math.max(centerX,farX)+reach,
      minZ=Math.min(centerZ,farZ)-reach,
      maxZ=Math.max(centerZ,farZ)+reach;
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
    const half=widthOf(road)/2,walk=asphaltOnly?0:sidewalkWidth(road),
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
        priority:asphaltPriority(road),
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
        priority:asphaltPriority(road),
        x:p[0],z:p[1],half,walk},far,p[0],p[1]);
      joints++;
    }
  }
  function tileTriangles(gx,gz,detail=ROAD_DETAIL_DEFAULT){
    const box=vectorTileClipBounds(
      gx,gz,tileMetres,seamGuardMetres),
      originX=(gx+.5)*tileMetres,
      originZ=(gz+.5)*tileMetres;
    const out={sidewalk:[],curb:[],asphalt:[]},
      candidates=tileIndex.get(key(gx,gz))||[],
      elevationCache=new Map(),asphaltPatches=[];
    const activeKinds=asphaltOnly?["asphalt"]:KINDS;
    function atHeight(x,z){
      const k=x.toFixed(3)+":"+z.toFixed(3);
      if(!elevationCache.has(k)){
        const y=sampleHeight(x,z);
        elevationCache.set(k,Number.isFinite(y)?y:0);
      }
      return elevationCache.get(k);
    }
    function emit(kind,tri,item){
      for(const clipped of clip3DTriangle(tri,box)){
        const verts=clipped.map(p=>[
          p[0]-originX,
          sampleHeight?atHeight(p[0],p[2])+.22+
            (VECTOR_ROAD_HEIGHTS[kind]-
              VECTOR_ROAD_HEIGHTS.asphalt):
            p[1],
          p[2]-originZ
        ]);
        if(asphaltOnly){
          asphaltPatches.push({vertices:verts,
            roadId:item.roadId,priority:item.priority});
        }else for(const v of verts)out[kind].push(...v);
      }
    }
    for(const item of candidates)
      for(const kind of activeKinds){
        const r=radiusOf(item,kind),
          y=VECTOR_ROAD_HEIGHTS[kind];
        if(item.kind==="segment"){
          const dx=item.bx-item.ax,dz=item.bz-item.az;
          const len=Math.hypot(dx,dz);
          if(len<.02)continue;
          const nx=-dz/len*r,nz=dx/len*r;
          // Vertical tessellation is also LOD-dependent. Never store
          // three whole-road meshes or subdivide the canonical OSM index.
          // Terrain relief is ~17m resolution, so 5/10/20m sampling
          // stays smooth without wasting Ultra geometry on distant LOD.
          const pitch=detail==="economy"?reliefSampleMetres*4:
            detail==="balanced"?reliefSampleMetres*2:reliefSampleMetres;
          const n=sampleHeight?Math.ceil(len/pitch):1;
          for(let step=0;step<n;step++){
            const u=step/n,v=(step+1)/n,
              ax=item.ax+dx*u,az=item.az+dz*u,
              bx=item.ax+dx*v,bz=item.az+dz*v;
            const a=[ax+nx,y,az+nz],
              b=[bx+nx,y,bz+nz],
              c=[bx-nx,y,bz-nz],
              d=[ax-nx,y,az-nz];
            emit(kind,[a,b,c],item);
            emit(kind,[a,c,d],item);
          }
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
              [item.x+Math.cos(b)*r,y,item.z+Math.sin(b)*r]],item);
          }
        }
      }
    let unionStats=null;
    if(asphaltOnly){
      const union=unionVectorAsphaltTriangles(asphaltPatches,{
        heightAt:sampleHeight?
          (x,z)=>atHeight(x+originX,z+originZ)+.22:null
      });
      out.asphalt=union.positions;
      unionStats=union.stats;
    }
    return {layers:out,unionStats,sourcePrimitives:candidates.length,
      triangles:activeKinds.reduce((n,k)=>n+out[k].length/9,0)};
  }
  return {tileTriangles,
    stats:{sourceWays:roads.length,flatGroundWays:roadsEligible,
      segments,joints,indexedTiles:tileIndex.size,
      tileMetres,seamGuardMetres,elevated:Boolean(sampleHeight),
      asphaltOnly}};
}
