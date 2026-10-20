import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { sidewalkWidth, createRoadCorridors } from "./road-corridor.js";
import { composeRoadsideSteps } from "./sidewalk-union.js";
import { drapedSections, createRoadSurfaceIndex, coordinateKey }
  from "./draped-road.js";
import { unionAsphaltSteps, asphaltPriority, physicalLayer } from "./asphalt-union.js";
import { resolveLanePlan, paintIntervals } from "./road-lanes.js";
import { buildIntersectionGradeModels,reconcileRoadGrade }
  from "./intersection-grade.js";
import { buildJunctionFillets,createFilletSurfaceIndex }
  from "./junction-fillets.js";
import { findSeparatedCarriagewayMedians } from "./median-islands.js";
import { sealMeshSeams } from "./mesh-seams.js";
import { planPedestrianCrossings,buildZebraBars }
  from "./pedestrian-crossings.js";
import { buildCurbRampZones,createRampIndex } from "./curb-ramps.js";
import { streetTexturePixels,streetUv } from "./street-materials.js";
import {clipMeshBufferToRegion} from "./worldgen-region-stream.js";
import {renderProfile,renderBatchForPoint}
  from "./worldgen-render-profile.js";
import {startAsphaltWorkerJob} from "./worldgen-asphalt-client.js";
import {replayAsphaltTriangles} from "./worldgen-asphalt-job.js";
import {makeWorldgenProfiler,geometryBudget,summarizeRoadSectors,
  newRoadVisibilityStats,applyRoadTileLOD} from "./worldgen-diagnostics.js";

/**
 * A single joined cross-section per sampled centreline.
 * No disconnected quads at OSM polyline bends: miter joins are capped.
 * Each cross-section is in game metres.
 */
export const STREET_PALETTE=Object.freeze({
  asphalt:"#3f484e",walk:"#ccc4b6",curb:"#eee1cf",median:"#76946c",shoulder:"#a5b89d",
  tactile:"#d4b65c",
  white:"#eee8dc",yellow:"#e9c86c",ground:"#a5b89d"
});
const SPACING=5; // metre-to-metre tessellation; no coordinate scaling
function lerp(a,b,t){return a+(b-a)*t;}
function addTri(buffer,a,b,c){
  buffer.push(...a,...b,...c);
}
function addQuad(buffer,a,b,c,d){
  addTri(buffer,a,b,c);addTri(buffer,a,c,d);
}
function samplePolyline(raw,spacing=SPACING) {
  if(!Array.isArray(raw)||raw.length<2)return [];
  const out=[[...raw[0]]];
  for(let i=1;i<raw.length;i++){
    const a=raw[i-1],b=raw[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(len<.02)continue;
    const count=Math.max(1,Math.ceil(len/spacing));
    for(let j=1;j<=count;j++)out.push([lerp(a[0],b[0],j/count),lerp(a[1],b[1],j/count)]);
  }
  return out;
}
function normalAt(points,i) {
  const prev=points[Math.max(0,i-1)],p=points[i],next=points[Math.min(points.length-1,i+1)];
  const ax=p[0]-prev[0],az=p[1]-prev[1],bx=next[0]-p[0],bz=next[1]-p[1];
  const al=Math.hypot(ax,az),bl=Math.hypot(bx,bz);
  const tx=(al>.02?ax/al:bx/(bl||1)),tz=(al>.02?az/al:bz/(bl||1));
  const ux=(bl>.02?bx/bl:tx),uz=(bl>.02?bz/bl:tz);
  const nx=-tz,nz=tx;
  const mx=-(tz+uz),mz=tx+ux,ml=Math.hypot(mx,mz);
  if(ml<.25)return [nx,nz];
  const mX=mx/ml,mZ=mz/ml,dot=Math.max(.96,mX*nx+mZ*nz);
  return [mX/dot,mZ/dot];
}
function getSections(path,sampleHeight){
  const points=path.map(row=>Array.isArray(row)?row:row.p);
  return points.map((p,i)=>({p,normal:normalAt(points,i),
    base:Array.isArray(path[i])?sampleHeight(...p):path[i].base}));
}
function point(section,offset,up,sampleHeight) {
  const x=section.p[0]+section.normal[0]*offset;
  const z=section.p[1]+section.normal[1]*offset;
  // The carriageway and sidewalk are level ACROSS a road section.
  // DEM changes apply along its centreline, not as jagged cross-slope noise.
  return [x,(Number.isFinite(section.base)?section.base:sampleHeight(x,z))+up,z];
}
export function joinedRoadSections(points,halfWidth,sampleHeight=()=>0,spacing=SPACING) {
  const path=samplePolyline(points,spacing);
  return getSections(path,sampleHeight).map(s=>({
    center:s.p,
    left:point(s,-halfWidth,.042,sampleHeight),
    right:point(s,halfWidth,.042,sampleHeight),
    normal:s.normal
  }));
}
function faceBand(target,sections,from,to,heightAt,level){
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1],b=sections[i];
    addQuad(target,point(a,from,level,heightAt),point(b,from,level,heightAt),
      point(b,to,level,heightAt),point(a,to,level,heightAt));
  }
}
function curbWall(target,sections,offset,heightAt){
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1],b=sections[i];
    addQuad(target,point(a,offset,.04,heightAt),point(b,offset,.04,heightAt),
      point(b,offset,.17,heightAt),point(a,offset,.17,heightAt));
  }
}
/**
 * Paint a lane marking against the same draped grade as its road section.
 * Dash phases advance in metres along the ENTIRE way, not per 5m piece.
 */
function paintLaneMarking(buffer,a,b,mark,metresFromStart,heightAt){
  const distance=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);
  if(distance<.02)return;
  const at=t=>({
    p:[lerp(a.p[0],b.p[0],t),lerp(a.p[1],b.p[1],t)],
    normal:[lerp(a.normal[0],b.normal[0],t),
      lerp(a.normal[1],b.normal[1],t)],
    base:lerp(a.base,b.base,t)
  });
  for(const [from,to] of paintIntervals(metresFromStart,distance,mark.style)){
    const p=at(from),q=at(to),half=mark.width/2,
      offset=mark.offset;
    addQuad(buffer[mark.color],
      point(p,offset-half,.104,heightAt),point(q,offset-half,.104,heightAt),
      point(q,offset+half,.104,heightAt),point(p,offset+half,.104,heightAt));
  }
}
// Exactly three 64px textures shared by ALL streaming road chunks.
const materialCache=new Map();
function createStreetMaterial(kind,color,lambert){
  if(materialCache.has(kind))return materialCache.get(kind);
  let map=null;
  if(["asphalt","walk","median"].includes(kind)){
    const spec=streetTexturePixels(kind);
    map=new THREE.DataTexture(spec.data,spec.size,spec.size,
      THREE.RGBAFormat,THREE.UnsignedByteType);
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.magFilter=THREE.LinearFilter;
    map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true;
    map.colorSpace=THREE.SRGBColorSpace;
    map.needsUpdate=true;
  }
  const options={color:map?"#ffffff":color,side:THREE.DoubleSide,
    ...(map?{map}:{})};
  const mat=(lambert||kind==="median")
    ? new THREE.MeshLambertMaterial({...options,flatShading:true})
    : new THREE.MeshBasicMaterial(options);
  materialCache.set(kind,mat);
  return mat;
}
function meshFrom(points,color,lambert=false,kind="",cameraCulling=false){
  if(!points.length)return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
  if(["asphalt","walk","median"].includes(kind)){
    // Global metric UVs: fragments from different OSM roads show one
    // seamless pavement pattern after polygon union/clipping.
    const uvs=[];
    for(let i=0;i<points.length;i+=3)
      uvs.push(...streetUv(points[i],points[i+2],kind));
    g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  }
  g.computeVertexNormals();
  // Camera frustum culling is independent of distance LOD: it rejects
  // region meshes behind or beyond the camera. Bounding spheres are
  // conservative, so any partially visible road remains drawable.
  if(cameraCulling)g.computeBoundingSphere();
  const obj=new THREE.Mesh(g,createStreetMaterial(kind,color,lambert));
  obj.frustumCulled=cameraCulling;
  return obj;
}
function chunkKey(p,size=440){
  return Math.floor(p[0]/size)+":"+Math.floor(p[1]/size);
}
function emptyChunk(x,z){
  return {x,z,asphalt:[],walk:[],curb:[],median:[],
    tactile:[],white:[],yellow:[],caps:[],shoulder:[]};
}
function streetNodeKey(p){
  return p.map(v=>Math.round(v*10)).join(":");
}
export function getJunctions(roads){
  const touches=new Map();
  for(const road of roads) {
    for(let i=0;i<road.p.length;i++){
      const key=road.nodeIds?.[i]!=null?"osm:"+road.nodeIds[i]:streetNodeKey(road.p[i]);
      if(!touches.has(key))touches.set(key,{point:road.p[i],ways:new Set(),maxWidth:0});
      const t=touches.get(key);
      t.ways.add(road.id);
      t.maxWidth=Math.max(t.maxWidth,road.widthMeters||7);
    }
  }
  return [...touches.values()].filter(j=>j.ways.size>1);
}
/** Generator-driven world creation shared by both run modes.
 * Streaming drives a few steps per animation frame. The legacy wrapper
 * below runs the SAME generator to completion, synchronously.
 */
export function* createRoadSceneSteps(scene,roads,sampleHeight,{
  renderBounds=null,roadBatchSize=4,backgroundAsphalt=false
}={}) {
  const profiler=makeWorldgenProfiler();
  const detail=renderProfile(renderBounds);
  const chunks=new Map();
  const chunkFor=p=>{
    const batch=renderBatchForPoint(p,renderBounds);
    const key=batch.x+":"+batch.z;
    if(!chunks.has(key))
      chunks.set(key,{...emptyChunk(batch.x,batch.z),
        bounds:batch.bounds});
    return chunks.get(key);
  };
  const segments=[],surfaceSegments=[],asphaltPatches=[],walkPatches=[];
  const laneStatistics={roadsByLaneCount:{},sourceCounts:{},
    oneWayRoads:0,constrainedByWidth:0,ambiguousLaneTags:0};
  const corridors=createRoadCorridors(roads);
  profiler.mark("corredores_espaciais");
  const joints=getJunctions(roads);
  const pedestrianCrossings=planPedestrianCrossings(roads,joints);
  // Small per-40m tile index to suppress lane paint underneath zebra
  // stripes; no shared road centerlines or original OSM data are moved.
  const crossingCells=new Map(),crossingCellSize=40;
  for(const site of pedestrianCrossings.sites){
    const cx=Math.floor(site.point[0]/crossingCellSize),
      cz=Math.floor(site.point[1]/crossingCellSize);
    const key=cx+":"+cz;
    if(!crossingCells.has(key))crossingCells.set(key,[]);
    crossingCells.get(key).push(site);
  }
  const nearCrosswalk=(point,id)=>{
    const cx=Math.floor(point[0]/crossingCellSize),
      cz=Math.floor(point[1]/crossingCellSize);
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)
      for(const site of crossingCells.get(x+":"+z)||[]){
        if(String(site.roadId)!==String(id))continue;
        const dx=point[0]-site.point[0],dz=point[1]-site.point[1];
        const along=Math.abs(dx*site.axis[0]+dz*site.axis[1]);
        const sideways=Math.abs(dx*site.normal[0]+dz*site.normal[1]);
        if(along<4.6&&sideways<site.widthMeters/2+1)return true;
      }
    return false;
  };
  const gradeModels=buildIntersectionGradeModels(roads,joints,sampleHeight);
  const roundedCorners=buildJunctionFillets(roads,joints,sampleHeight,
    {gradeModels:gradeModels.models});
  // Only OSM-confirmed dual one-way carriageways produce planted medians.
  // Crossroads cut these islands through the same asphalt polygon mask.
  const medians=findSeparatedCarriagewayMedians(roads,sampleHeight);
  const filletSurface=createFilletSurfaceIndex(roundedCorners.patches);
  const fixedJunctions=new Set(joints.map(j=>coordinateKey(j.point)));
  const junctionCells=new Map();
  const cellSize=40;
  const put=(x,z,item)=>{
    const key=x+":"+z;if(!junctionCells.has(key))junctionCells.set(key,[]);
    junctionCells.get(key).push(item);
  };
  for(const j of joints)put(Math.floor(j.point[0]/cellSize),Math.floor(j.point[1]/cellSize),j);
  const nearJunction=(p,clearance=0)=>{
    const cx=Math.floor(p[0]/cellSize),cz=Math.floor(p[1]/cellSize);
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)
      for(const j of junctionCells.get(x+":"+z)||[])
        if(Math.hypot(j.point[0]-p[0],j.point[1]-p[1])<j.maxWidth/2+1.1+clearance)return true;
    return false;
  };
  profiler.mark("cruzamentos_terreno_planejamento");
  let roadProcessed=0;
  for(const road of roads){
    if(!road.p?.length)continue;
    const width=road.widthMeters||7,half=width/2,
      lanePlan=resolveLanePlan(road),
      foot=sidewalkWidth(road),
      curbTop=.04+Math.max(0,Math.min(.4,
        Number.isFinite(Number(road.curbHeightMeters))
          ? Number(road.curbHeightMeters):.14));
    // One elevation profile along the entire OSM way, subdivided into
    // short draped sections. Both asphalt edges, curbs and lane markings
    // share EXACTLY the same sampled road heights.
    const sectionGrades=reconcileRoadGrade(
      drapedSections(road.p,sampleHeight,{
        fixedJunctions,step:detail.sampleMetres}),
      gradeModels.byWay.get(String(road.id)));
    const sections=getSections(sectionGrades,sampleHeight);
    if(sections.length<2)continue;
    laneStatistics.roadsByLaneCount[lanePlan.total]=
      (laneStatistics.roadsByLaneCount[lanePlan.total]||0)+1;
    laneStatistics.sourceCounts[lanePlan.source]=
      (laneStatistics.sourceCounts[lanePlan.source]||0)+1;
    if(lanePlan.oneway)laneStatistics.oneWayRoads++;
    if(lanePlan.limitedByWidth)laneStatistics.constrainedByWidth++;
    if(lanePlan.ambiguousOSM)laneStatistics.ambiguousLaneTags++;
    let travelled=0;
    // Exact sampled OSM centreline, physically separate raised sidewalks.
    for(let i=1;i<sections.length;i++){
      const a=sections[i-1],b=sections[i],buffer=chunkFor([
        (a.p[0]+b.p[0])/2,(a.p[1]+b.p[1])/2
      ]);
      // Do NOT push each road ribbon directly into the scene. All asphalt
      // polygons first pass through the planar worldgen union, so a side
      // street is geometrically CUT by the major road at a T-junction.
      // The same draped height profile is retained at all new vertices.
      asphaltPatches.push({
        id:road.id,t:road.t,widthMeters:width,layer:road.layer||0,
        bridge:road.bridge,tunnel:road.tunnel,
        a:a.p,b:b.p,h0:a.base,h1:b.base,
        quad:[point(a,-half,.072,sampleHeight),
          point(b,-half,.072,sampleHeight),
          point(b,half,.072,sampleHeight),
          point(a,half,.072,sampleHeight)]
      });
      surfaceSegments.push({a:a.p,b:b.p,h0:a.base,h1:b.base,
        halfWidth:half,walk:foot,curbTop,
        roadId:road.id,priority:asphaltPriority(road),layer:physicalLayer(road)});
      // Sidewalk geometry is buffered, NOT rendered here. The final pass
      // subtracts every asphalt surface and unions pedestrian corridors.
      // This guarantees that raised sidewalks cannot cover the asphalt
      // at a T-junction, and only the resulting shared boundary gets a curb.
      for(const side of [-1,1]){
        const inside=side*half,outside=side*(half+foot);
        const p=(s,offset)=>[
          s.p[0]+s.normal[0]*offset,s.p[1]+s.normal[1]*offset];
        walkPatches.push({
          id:road.id,t:road.t,widthMeters:width,
          layer:road.layer||0,bridge:road.bridge,tunnel:road.tunnel,
          a:a.p,b:b.p,h0:a.base,h1:b.base,curbTop,
          cornerClearanceMeters:road.cornerClearanceMeters||0,
          quad:[p(a,inside),p(b,inside),p(b,outside),p(a,outside)]
        });
      }
      const middle=[(a.p[0]+b.p[0])/2,(a.p[1]+b.p[1])/2];
      const intersection=nearJunction(middle);
      // Lane markings are inferred from physical width and direction.
      // Keep the whole intersection mouth blank: marks cannot run across
      // a crossing, even if only a single end of this 5m quad is near it.
      const clearOfJunction=!intersection &&
        !nearJunction(a.p,.6)&&!nearJunction(b.p,.6)&&
        !nearCrosswalk(middle,road.id)&&
        !nearCrosswalk(a.p,road.id)&&!nearCrosswalk(b.p,road.id);
      if(clearOfJunction)
        for(const mark of lanePlan.markings)
          paintLaneMarking(buffer,a,b,mark,travelled,sampleHeight);
      travelled+=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);
    }
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i];
      if(Math.hypot(b[0]-a[0],b[1]-a[1])>.04)
        segments.push({a,b,width,name:road.n,type:road.t,id:road.id,
          oneway:road.o,widthSource:road.widthSource});
    }
    // Yield only after a COMPLETE road's geometry has been buffered.
    if(++roadProcessed%roadBatchSize===0){
      profiler.pause();
      yield {stage:"roads",done:roadProcessed,total:roads.length};
      profiler.resume();
    }
  }
  // Union all asphalt sheets in 2D before sending triangles to WebGL.
  // Junction circles formerly covered seams but produced extra overlap and
  // white/green islands at T-junctions; resolved road ribbons now own the
  // entire common footprint without arbitrary discs.
  // Corner fillets share the SAME planar footprint with the asphalt
  // compositor and the sidewalk subtraction; never draw free-standing
  // rounded curb decorations without adding their road surface.
  profiler.mark("amostragem_vias_e_pintura");
  asphaltPatches.push(...roundedCorners.patches);
  const emitAsphalt=triangle=>{
    const mid=[(triangle[0][0]+triangle[1][0]+triangle[2][0])/3,
      (triangle[0][2]+triangle[1][2]+triangle[2][2])/3];
    addTri(chunkFor(mid).asphalt,...triangle);
  };
  // Only background regions use a Worker. The synchronous initial region,
  // emergency load and traditional full-city mode CANNOT wait on a worker:
  // blocking the event loop would prevent any onmessage from running.
  const asphaltWorkerStats={requested:backgroundAsphalt,
    used:false,fallback:false,triangles:0,error:null};
  let asphaltUnion=null;
  const job=backgroundAsphalt&&renderBounds?
    startAsphaltWorkerJob(asphaltPatches):null;
  try{
    if(job){
      while(job.status==="pending"){
        profiler.pause();
        yield {stage:"asphalt_worker_wait",waiting:true};
        profiler.resume();
      }
      if(job.status==="complete"){
        asphaltWorkerStats.used=true;
        asphaltWorkerStats.triangles=job.positions.length/9;
        asphaltUnion=job.stats;
        yield* paceGeometry(replayAsphaltTriangles(
          job.positions,emitAsphalt),profiler);
      }else{
        asphaltWorkerStats.fallback=true;
        asphaltWorkerStats.error=job.error||"Worker cancelado";
      }
    }else if(backgroundAsphalt) {
      asphaltWorkerStats.fallback=true;
      asphaltWorkerStats.error="Worker indisponível";
    }
    if(!asphaltUnion)
      asphaltUnion=yield* paceGeometry(unionAsphaltSteps(
        asphaltPatches,emitAsphalt),profiler);
  }finally{
    job?.cancel();
  }
  profiler.mark("uniao_poligonal_asfalto");
  // Zebra paint is validated against the same draped road surface BEFORE
  // we carve ramps. Only actually paintable crossings receive curb cuts.
  const surface=createRoadSurfaceIndex(surfaceSegments);
  const crossingStatistics={...pedestrianCrossings.stats,
    crossingsPainted:0,barsPainted:0,rejectedSurface:0};
  const verifiedRampSites=[];
  for(const site of pedestrianCrossings.sites){
    const bars=buildZebraBars(site,surface);
    if(!bars.length){crossingStatistics.rejectedSurface++;continue;}
    const buffer=chunkFor(site.point).white;
    for(const [a,b,c,d] of bars)addQuad(buffer,a,b,c,d);
    crossingStatistics.crossingsPainted++;
    crossingStatistics.barsPainted+=bars.length;
    verifiedRampSites.push(site);
  }
  profiler.mark("verificacao_travessias");
  const rampGeometry=buildCurbRampZones(verifiedRampSites);
  const rampSurface=createRampIndex(rampGeometry.zones);
  // Use the same accepted sidewalk polygon union. The ramp cutter removes
  // the old flat sidewalk, emits graded cells, and opens the real curb wall.
  const roadsideStats=yield* paceGeometry(composeRoadsideSteps(asphaltPatches,
    [...walkPatches,...medians.patches],
    (triangle,patch)=>{
      const mid=[(triangle[0][0]+triangle[1][0]+triangle[2][0])/3,
        (triangle[0][2]+triangle[1][2]+triangle[2][2])/3];
      addTri(chunkFor(mid)[patch.isMedian?"median":"walk"],...triangle);
    },
    (wall)=>{
      const mid=[(wall[0][0]+wall[1][0])/2,
        (wall[0][2]+wall[1][2])/2];
      addQuad(chunkFor(mid).curb,...wall);
    },{junctions:joints,bevelCurbs:true,rampSites:verifiedRampSites,
      tactileOptions:{countAcross:detail.tactileColumns,
        rows:detail.tactileRows},
      onTactile:(triangle)=>{
        const mid=[(triangle[0][0]+triangle[1][0]+triangle[2][0])/3,
          (triangle[0][2]+triangle[1][2]+triangle[2][2])/3];
        addTri(chunkFor(mid).tactile,...triangle);
      }}),profiler);
  profiler.mark("uniao_calcadas_guias_rampas");
  const tiles=[];
  const seamStats={sharedVertices:0,snappedVertices:0,
    independentLevels:0,degenerateTriangles:0};
  const hues=[
    ["asphalt",STREET_PALETTE.asphalt],
    ["walk",STREET_PALETTE.walk],
    ["median",STREET_PALETTE.median],
    ["curb",STREET_PALETTE.curb],
    ["tactile",STREET_PALETTE.tactile],
    ["caps",STREET_PALETTE.asphalt],
    ["white",STREET_PALETTE.white],
    ["yellow",STREET_PALETTE.yellow],
    ["shoulder",STREET_PALETTE.shoulder]
  ];
  for(const ch of chunks.values()){
    // Geometry was composed with halo roads, and only now cut to the
    // authoritative region edge. Neighboring regions each own their own
    // nonoverlapping half, including draped interpolation at cut vertices.
    if(renderBounds)for(const [key] of hues){
      ch[key]=clipMeshBufferToRegion(ch[key],renderBounds);
      profiler.pause();
      yield {stage:"region_clip",material:key};
      profiler.resume();
    }
    // Snap and reconcile neighboring vertices AFTER all geometric clipping.
    // Identical X/Z points in asphalt, walks and curbs now have consistent
    // coordinates; real vertical steps/overpasses stay independent.
    for(const key of ["asphalt","walk","median","curb","tactile"]){
      // Vertical bevel tiers in curbs are intentional; don't smooth away
      // those details while reconciling nearby asphalt elevations.
      const health=sealMeshSeams(ch[key],
        {heightTolerance:
          key==="curb"||key==="tactile"?1e-6:.085});
      for(const k of Object.keys(seamStats))seamStats[k]+=health[k]||0;
      profiler.pause();
      yield {stage:"seam",material:key};
      profiler.resume();
    }
    const budget=geometryBudget(ch);
    if(budget.triangles===0)continue;
    const group=new THREE.Group();
    group.name="Buzun_RoadTile_"+ch.x+"_"+ch.z;
    const meshes={};
    for(const [key,color] of hues){
      const m=meshFrom(ch[key],color,
        key==="walk"||key==="curb"||key==="tactile",key,
        detail.cameraFrustumCulling);
      if(m){m.name="Buzun_"+key;group.add(m);meshes[key]=m;}
      ch[key].length=0;
      profiler.pause();
      yield {stage:"mesh",material:key};
      profiler.resume();
    }
    // Do not reveal half-built regions; add only finished render groups.
    scene.add(group);
    tiles.push({x:ch.x,z:ch.z,bounds:ch.bounds,
      group,meshes,budget});
  }
  profiler.mark("costura_e_alocacao_mesh");
  const geometryStatistics=summarizeRoadSectors(tiles);
  const buildProfile=profiler.report();
  // The same object is updated in place so developer panels can observe
  // current GPU draw-budget without walking the Three.js scene.
  const lodStatistics=newRoadVisibilityStats();
  let lastVisibility=null;
  return {
    segments,tiles,junctions:joints.length,junctionPoints:joints,corridors,
    surface,asphaltUnion,laneStatistics,roadsideStats,filletSurface,
    cornerStatistics:roundedCorners.stats,medianStatistics:medians.stats,
    crossingStatistics,rampStatistics:{
      ...rampGeometry.stats,
      cells:roadsideStats.rampCells,
      triangles:roadsideStats.rampTriangles,
      curbSegmentsLowered:roadsideStats.loweredCurbSegments
    },rampSurface,seamStatistics:seamStats,
    finishStatistics:{
      textures:["asphalt","walk","median"],
      texelsPerTexture:64*64,
      tactileTriangles:roadsideStats.tactileTriangles,
      tactileFragments:roadsideStats.tactileFragments
    },
    gradeStatistics:{sharedJunctionPlanes:gradeModels.models.length},
    buildProfile,geometryStatistics,lodStatistics,
    renderProfile:detail,asphaltWorkerStats,
    // Only 3D VISUAL detail is culled; physics, lane metadata, terrain,
    // minimap and OSM geometry are unaffected. Recompute when the camera
    // moves enough to matter, not 60 times per second.
    updateVisibility(x,z,radius=detail.visualRadiusMetres) {
      if(lastVisibility&&lastVisibility.radius===radius&&
        Math.hypot(x-lastVisibility.x,z-lastVisibility.z)<10)return;
      applyRoadTileLOD(tiles,x,z,{radius,stats:lodStatistics});
      lastVisibility={x,z,radius};
    }
  };
}

/** The legacy API runs all phases at once; the streaming API explicitly
 * consumes yielded checkpoints via the browser's cooperative scheduler.
 */
export function createRoadScene(scene,roads,sampleHeight,options={}){
  const steps=createRoadSceneSteps(scene,roads,sampleHeight,options);
  let current=steps.next();
  while(!current.done)current=steps.next();
  return current.value;
}

/** Keep active CPU timings separate from the idle time between frames. */
function* paceGeometry(iterator,profiler){
  let step=iterator.next();
  while(!step.done){
    profiler.pause();
    yield step.value;
    profiler.resume();
    step=iterator.next();
  }
  return step.value;
}
