/**
 * WorldGen 6.0 — one deterministic crumpled sheet beneath the entire city.
 *
 * Global OSM coordinates, real elevation samples and graded road sections
 * are authoritative; chunk boundaries never participate in height queries.
 * Road materials remain separate for lanes/markings, but NO holes are cut
 * in the base sheet. All ground tiles evaluate this same height function.
 *
 * Plain JS so geometry/canonical grades can be regression-tested in Node.
 */
import {drapedSections,coordinateKey} from "./draped-road.js";
import {reconcileRoadGrade} from "./intersection-grade.js";
import {asphaltPriority,physicalLayer} from "./asphalt-union.js";
import {sidewalkWidth} from "./road-corridor.js";
import {connectorHeightAt} from "./worldgen-road-connectors.js";
import {ROAD_RENDER_PROFILE} from "./worldgen-render-profile.js";

export const SHEET_TILE_METRES=420;
export const SHEET_GRID_SEGMENTS=60;
export const SHEET_GRID_STEP_METRES=SHEET_TILE_METRES/SHEET_GRID_SEGMENTS;
export const SHEET_SHOULDER_BLEND_METRES=9;
const CELL=75;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=t=>{const v=clamp(t,0,1);return v*v*(3-2*v);};
const lerp=(a,b,t)=>a+(b-a)*t;
const key=(x,z)=>x+":"+z;

function sampleGrade(rows,distance) {
  if(distance<=rows[0].distance)return rows[0].base;
  if(distance>=rows.at(-1).distance)return rows.at(-1).base;
  let lo=0,hi=rows.length-1;
  while(lo+1<hi){
    const mid=(lo+hi)>>1;
    if(rows[mid].distance<=distance)lo=mid;
    else hi=mid;
  }
  const a=rows[lo],b=rows[hi];
  return lerp(a.base,b.base,clamp(
    (distance-a.distance)/(b.distance-a.distance||1),0,1));
}

/** Immutable OSM lines + lazy canonical grade cache shared with road meshes.
 * Keeping lazy profiles avoids constructing 4,777 full render ribbons up front.
 */
export function createWorldSheet(roads,naturalHeight,{
  gradeModels=null,fixedJunctions=new Set(),blendMetres=SHEET_SHOULDER_BLEND_METRES,
  profile=ROAD_RENDER_PROFILE.streaming
}={}){
  if(!Array.isArray(roads)||typeof naturalHeight!=="function")
    throw Error("WorldSheet requires OSM ways and an elevation function");
  const cells=new Map(),gradeCache=new Map();
  const segments=[];
  function sectionsFor(road) {
    const id=String(road.id);
    if(gradeCache.has(id))return gradeCache.get(id);
    const base=road.visualConnector?
      (x,z)=>connectorHeightAt(road,x,z,naturalHeight):naturalHeight;
    const sampled=drapedSections(road.p,base,{
      step:profile.sampleMetres,
      radius:profile.gradeSmoothMetres,
      adaptive:profile.adaptiveSampling,
      maxSlope:profile.maxRoadSlope,
      fixedJunctions
    });
    const sections=reconcileRoadGrade(sampled,gradeModels?.byWay?.get(id));
    gradeCache.set(id,sections);
    return sections;
  }
  for(const road of roads){
    // A bridge must remain suspended and a tunnel must not flatten the
    // surface above it. Both retain their existing independent road meshes.
    if(physicalLayer(road)!==0||road.bridge||road.tunnel||
      !road.p||road.p.length<2)continue;
    const halfWidth=(Number(road.widthMeters)||7)/2;
    const walk=sidewalkWidth(road),pad=halfWidth+walk+blendMetres;
    let travelled=0;
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i],
        dx=b[0]-a[0],dz=b[1]-a[1],
        length=Math.hypot(dx,dz);
      if(length<.02)continue;
      const index=segments.length;
      segments.push({road,a,b,dx,dz,length,at:travelled,
        halfWidth,walk,priority:asphaltPriority(road)});
      travelled+=length;
      const minX=Math.floor((Math.min(a[0],b[0])-pad)/CELL),
        maxX=Math.floor((Math.max(a[0],b[0])+pad)/CELL),
        minZ=Math.floor((Math.min(a[1],b[1])-pad)/CELL),
        maxZ=Math.floor((Math.max(a[1],b[1])+pad)/CELL);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
        const id=key(x,z);
        if(!cells.has(id))cells.set(id,[]);
        cells.get(id).push(index);
      }
    }
  }
  function roadAt(x,z){
    const candidates=cells.get(key(
      Math.floor(x/CELL),Math.floor(z/CELL)))||[];
    let closest=null;
    for(const i of candidates){
      const s=segments[i],r2=s.length*s.length;
      const t=clamp(((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/r2,0,1);
      const distance=Math.hypot(x-s.a[0]-t*s.dx,
        z-s.a[1]-t*s.dz);
      const limit=s.halfWidth+s.walk+blendMetres;
      if(distance>limit)continue;
      const within=distance<=s.halfWidth+.1;
      const previousWithin=closest?.within||false;
      if(closest&&(
        (!within&&previousWithin)||
        (within===previousWithin&&
          (within?((s.priority<closest.s.priority)||
            (s.priority===closest.s.priority&&distance>=closest.distance)):
            distance>=closest.distance))))continue;
      closest={s,t,distance,within};
    }
    if(!closest)return null;
    const {s,t,distance}=closest,rows=sectionsFor(s.road);
    if(rows.length<2)return null;
    return {
      roadId:s.road.id,layer:0,base:sampleGrade(rows,s.at+s.length*t),
      distance,halfWidth:s.halfWidth,walk:s.walk,
      curbTop:.18,priority:s.priority
    };
  }
  function height(x,z){
    const natural=naturalHeight(x,z),hit=roadAt(x,z);
    if(!hit)return natural;
    // The pavement's geometric surface is at base + .072; its underlying
    // world sheet is depressed by .34 m. A continuous shoulder eases back
    // into natural terrain without alpha masks or transparent gaps.
    const beneath=hit.base-.34;
    const edge=hit.halfWidth+hit.walk;
    const t=smooth((hit.distance-(edge-.55))/
      (blendMetres+.55));
    return lerp(beneath,natural,t);
  }
  function tileSample(x,z){return height(x,z);}
  return {height,roadAt,sectionsFor,tileSample,
    get stats(){return {sourceRoadSegments:segments.length,
      cachedProfiles:gradeCache.size,gridCellMetres:CELL};}};
}

/** A tile samples the same global sheet at positions shared by neighbors.
 * Both sides of any edge agree without repair or region-based blending.
 */
export function sheetTileVertices(tileX,tileZ,heightAt,{
  tileMetres=SHEET_TILE_METRES,segments=SHEET_GRID_SEGMENTS
}={}){
  if(!Number.isInteger(segments)||segments<2)throw Error("Invalid sheet resolution");
  const vertices=[],step=tileMetres/segments;
  for(let z=0;z<=segments;z++)
    for(let x=0;x<=segments;x++){
      const px=tileX*tileMetres+x*step,
        pz=tileZ*tileMetres+z*step;
      vertices.push([px,heightAt(px,pz),pz]);
    }
  return vertices;
}
