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
import {conservativeGroundSupport} from "./worldgen-sheet-safety.js";

export const SHEET_TILE_METRES=420;
export const SHEET_GRID_SEGMENTS=105;
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
  gradeModels=null,fixedJunctions=new Set(),junctions=[],
  blendMetres=SHEET_SHOULDER_BLEND_METRES,
  profile=ROAD_RENDER_PROFILE.streaming
}={}){
  if(!Array.isArray(roads)||typeof naturalHeight!=="function")
    throw Error("WorldSheet requires OSM ways and an elevation function");
  const cells=new Map(),gradeCache=new Map();
  // Only actual same-level OSM junctions may contribute several streets
  // to one support surface. Parallel carriageways must not be blended.
  const junctionLinks=new Map();
  for(const joint of junctions){
    if(!joint?.point||!joint.ways||joint.ways.size<2)continue;
    const ways=[...joint.ways].map(String);
    for(const id of ways){
      if(!junctionLinks.has(id))junctionLinks.set(id,new Map());
      const connections=junctionLinks.get(id);
      for(const other of ways){
        if(other===id)continue;
        if(!connections.has(other))connections.set(other,[]);
        connections.get(other).push(joint.point);
      }
    }
  }
  const meetNear=(a,b,x,z)=>{
    if(a===b)return true;
    const shared=junctionLinks.get(String(a))?.get(String(b));
    return Boolean(shared?.some(p=>
      Math.hypot(p[0]-x,p[1]-z)<26));
  };
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
  /**
   * At the seam between two streets, deduplicate a polyline's neighboring
   * segments before calculating grades. Only the four nearest eligible ways
   * contribute; road meshes keep their independent OSM geometry.
   */
  function roadHits(x,z,maxWays=5){
    const candidates=cells.get(key(
      Math.floor(x/CELL),Math.floor(z/CELL)))||[];
    const byWay=new Map();
    for(const i of candidates){
      const s=segments[i],r2=s.length*s.length;
      const t=clamp(((x-s.a[0])*s.dx+(z-s.a[1])*s.dz)/r2,0,1);
      const distance=Math.hypot(x-s.a[0]-t*s.dx,
        z-s.a[1]-t*s.dz);
      if(distance>s.halfWidth+s.walk+blendMetres)continue;
      const id=String(s.road.id),existing=byWay.get(id);
      if(!existing||distance<existing.distance)
        byWay.set(id,{s,t,distance,
          within:distance<=s.halfWidth+.1});
    }
    const candidatesByWay=[...byWay.values()].sort((a,b)=>
      Number(b.within)-Number(a.within)||
      (a.within?b.s.priority-a.s.priority:0)||
      a.distance-b.distance||
      String(a.s.road.id).localeCompare(String(b.s.road.id)));
    return candidatesByWay.slice(0,maxWays).map(({s,t,distance})=>{
      const rows=sectionsFor(s.road);
      if(rows.length<2)return null;
      return {
        roadId:s.road.id,layer:0,
        base:sampleGrade(rows,s.at+s.length*t),
        distance,halfWidth:s.halfWidth,walk:s.walk,
        curbTop:.18,priority:s.priority
      };
    }).filter(Boolean);
  }
  function roadAt(x,z){return roadHits(x,z)[0]||null;}

  /** Ground support follows road, footway and natural shoulder separately.
   * Every zone joins its neighbor continuously in height AND slope.
   */
  function roadSupportHeight(hit,natural){
    const d=hit.distance,lane=hit.halfWidth,
      outer=lane+hit.walk;
    const laneGround=hit.base-.16;
    const sidewalkGround=hit.base+(hit.curbTop??.18)-.045;
    if(d<=lane)return laneGround;
    if(d<=outer)
      return lerp(laneGround,sidewalkGround,
        smooth((d-lane)/Math.max(hit.walk,.01)));
    return lerp(sidewalkGround,natural,
      smooth((d-outer)/Math.max(blendMetres,.01)));
  }
  function height(x,z,candidates=null){
    const natural=naturalHeight(x,z);
    const allHits=candidates||roadHits(x,z,Infinity);
    if(!allHits.length)return natural;
    const hits=allHits.slice(0,5),owner=hits[0];
    let sum=0,total=0,lowestLane=Infinity,lowestWalk=Infinity;
    // A grass triangle must never cover the footprint of any road
    // actually drawn at ground level, even with incomplete OSM junctions.
    // Topology controls BLENDING only; safety of the surface is universal.
    for(const hit of allHits){
      if(hit.distance<=hit.halfWidth+.08)
        lowestLane=Math.min(lowestLane,hit.base-.24);
      else if(hit.distance<=hit.halfWidth+hit.walk)
        lowestWalk=Math.min(lowestWalk,
          hit.base+(hit.curbTop??.18)-.10);
    }
    for(const hit of hits){
      if(!meetNear(owner.roadId,hit.roadId,x,z))continue;
      // Never combine unrelated vertical grades (e.g. missing OSM bridge
      // layer metadata) just because projected roads are geographically near.
      if(Math.abs(hit.base-owner.base)>.65)continue;
      const outer=hit.halfWidth+hit.walk;
      const w=hit.distance<=outer?1:
        1-smooth((hit.distance-outer)/Math.max(blendMetres,.01));
      if(w<=0)continue;
      sum+=roadSupportHeight(hit,natural)*w;
      total+=w;
      if(hit.distance<=hit.halfWidth+.08)
        lowestLane=Math.min(lowestLane,hit.base-.12);
      if(hit.distance<=outer)
        lowestWalk=Math.min(lowestWalk,
          hit.base+(hit.curbTop??.18)-.04);
    }
    if(!total)return natural;
    let surface=sum/total;
    // At real crossings the base sheet must stay UNDER every asphalt
    // strip, even if its intersecting sidewalk has a higher curb.
    if(lowestLane<Infinity)surface=Math.min(surface,lowestLane);
    else if(lowestWalk<Infinity)surface=Math.min(surface,lowestWalk);
    return surface;
  }
  function meshHeight(x,z){
    // Actual THREE.PlaneGeometry interpolates heights across triangles;
    // a 4m triangle may otherwise bridge over a paved road without
    // any vertex inside the lane. Expand its ground support by a full
    // cell diagonal so the interpolated face stays beneath the pavement.
    const candidates=roadHits(x,z,Infinity);
    const original=height(x,z,candidates);
    return conservativeGroundSupport(original,candidates,{
      step:SHEET_GRID_STEP_METRES
    });
  }
  function tileSample(x,z){return meshHeight(x,z);}
  return {height,meshHeight,roadAt,roadHits,sectionsFor,tileSample,
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
