import {sampleHeight} from "./terrain.js";
import {createRoadScene,getJunctions} from "./city-road-mesh.js";
import {createRoadCorridors} from "./road-corridor.js";
import {createCarvedTerrain} from "./terrain-cutout.js";
import {graphFromRoads} from "./grajau-osm.js";
import {summarizeRoadSectors} from "./worldgen-diagnostics.js";
import {createRegionRoadIndex,regionAt,regionKey,regionBounds,
  plannedRegions,regionDistance,REGION_METRES} from "./worldgen-region-stream.js";

/**
 * Experimental streaming city. Only the current 880 m road region is
 * composed before the game opens; nearby regions are produced ONE AT A
 * TIME during browser idle work, then evicted after the player leaves.
 * The complete OSM centerline graph, minimap, road queries and the DEM
 * stay available even when 3D polygons are not in memory.
 *
 * Legacy mode (without ?worldgen=stream) still uses the verified full-city
 * generation until this mode passes sustained browser smoke tests.
 */
const MAX_LOADED=16;
const PRELOAD_METRES=1260;
const EVICT_METRES=2350;
const time=()=>performance.now();
function boundsFor(roads){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const road of roads)for(const p of road.p){
    minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
    minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);
  }
  if(!Number.isFinite(minX))throw Error("Não existem vias para gerar");
  return {minX:minX-220,maxX:maxX+220,minZ:minZ-220,maxZ:maxZ+220};
}
function centerlineIndex(roads,cellSize=105){
  const cells=new Map(),segments=[];
  const insert=(cx,cz,id)=>{
    const key=cx+":"+cz;
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(id);
  };
  for(const road of roads)for(let i=1;i<road.p.length;i++){
    const a=road.p[i-1],b=road.p[i],width=road.widthMeters||7;
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<.02)continue;
    const s={a,b,width,name:road.n,type:road.t,id:road.id,
      oneway:road.o,widthSource:road.widthSource},index=segments.length;
    segments.push(s);
    const pad=width+2;
    for(let x=Math.floor((Math.min(a[0],b[0])-pad)/cellSize);
      x<=Math.floor((Math.max(a[0],b[0])+pad)/cellSize);x++)
      for(let z=Math.floor((Math.min(a[1],b[1])-pad)/cellSize);
        z<=Math.floor((Math.max(a[1],b[1])+pad)/cellSize);z++)
        insert(x,z,index);
  }
  function candidates(x,z,r=100){
    const found=new Set();
    for(let cx=Math.floor((x-r)/cellSize);
      cx<=Math.floor((x+r)/cellSize);cx++)
      for(let cz=Math.floor((z-r)/cellSize);
        cz<=Math.floor((z+r)/cellSize);cz++)
        for(const id of cells.get(cx+":"+cz)||[])found.add(id);
    return [...found].map(id=>segments[id]);
  }
  function closest(x,z){
    let near=null;
    const visit=s=>{
      const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],
        len=dx*dx+dz*dz;
      const t=len?Math.max(0,Math.min(1,
        ((x-s.a[0])*dx+(z-s.a[1])*dz)/len)):0;
      const px=s.a[0]+dx*t,pz=s.a[1]+dz*t,
        distance=Math.hypot(x-px,z-pz);
      if(!near||distance<near.distance)
        near={x:px,z:pz,t,distance,
          angle:Math.atan2(dx,-dz),segment:s};
    };
    for(const s of candidates(x,z,100))visit(s);
    if(!near)for(const s of candidates(x,z,850))visit(s);
    return near;
  }
  return {segments,candidates,closest};
}
export function createStreamingCityWorld(scene,map){
  const began=time(),bounds=boundsFor(map.roads);
  const streets=centerlineIndex(map.roads);
  const routeStart=map.route?.[0]||[0,0];
  const origin=streets.closest(...routeStart);
  if(!origin)throw Error("Rota inicial não possui asfalto OSM");
  const next=map.route?.[1]||[origin.x,origin.z-1];
  const spawn={x:origin.x,z:origin.z,
    angle:Math.atan2(next[0]-routeStart[0],
      -(next[1]-routeStart[1]))};
  const regionIndex=createRegionRoadIndex(map.roads);
  const loaded=new Map(),emptyRegions=new Set();
  const counters={mode:"experimental",regionMetres:REGION_METRES,
    totalRoads:map.roads.length,loadedRegions:0,readyRegions:0,
    unloadedRegions:0,building:null,queuedRegions:0,
    totalRegionBuildMs:0,initialRegionMs:0,
    maxRegionBuildMs:0,trianglesAllocated:0};
  const buildRegion=(rx,rz)=>{
    const key=regionKey(rx,rz);
    if(loaded.has(key)||emptyRegions.has(key))return;
    const ways=regionIndex.select(rx,rz);
    if(!ways.length){emptyRegions.add(key);return;}
    const started=time();
    // The full road compositor operates on ALL ways touching the halo;
    // clipping occurs only after every intersection has been resolved.
    const scenery=createRoadScene(scene,ways,sampleHeight,
      {renderBounds:regionBounds(rx,rz)});
    const elapsed=time()-started;
    counters.totalRegionBuildMs+=elapsed;
    counters.maxRegionBuildMs=Math.max(elapsed,counters.maxRegionBuildMs);
    loaded.set(key,{x:rx,z:rz,scenery,ms:elapsed});
    counters.readyRegions++;
    counters.loadedRegions=loaded.size;
    return scenery;
  };
  const initial=regionAt(spawn.x,spawn.z);
  const first=buildRegion(initial.x,initial.z);
  if(!first||first.tiles.length===0)
    throw Error("A região inicial não gerou pista 3D");
  counters.initialRegionMs=counters.totalRegionBuildMs;
  // Use the same full source for terrain cutouts, regardless of whether
  // region meshes happen to be present in the GPU at that instant.
  const corridors=createRoadCorridors(map.roads);
  const surfaceAt=(x,z)=>{
    const cell=regionAt(x,z);
    return loaded.get(regionKey(cell.x,cell.z))?.scenery||null;
  };
  const roadSurfaceAdapter={sample(x,z){
    const model=surfaceAt(x,z);
    const hit=model?.surface.sample(x,z);
    if(hit)return hit;
    // An unloaded area remains navigable with a cheap OSM centerline
    // approximation; renderer prefetches at least 1260m ahead.
    const nearest=streets.closest(x,z);
    if(!nearest)return null;
    const halfWidth=nearest.segment.width/2;
    if(nearest.distance>halfWidth+4)return null;
    return {roadId:nearest.segment.id,
      height:sampleHeight(nearest.x,nearest.z),
      distance:nearest.distance,halfWidth,walk:1.7,curbTop:.18};
  }};
  const globalJunctions=getJunctions(map.roads);
  const ground=createCarvedTerrain(scene,corridors,globalJunctions,
    sampleHeight,bounds,roadSurfaceAdapter);
  const graph=graphFromRoads(map.roads);
  const corridorLandmarks=(map.landmarks||[]).map(loc=>{
    const road=streets.closest(...loc.xy);
    return {key:loc.key,label:loc.label,xy:loc.xy,
      roadPoint:road?[road.x,road.z]:loc.xy,confirmedFootprint:false};
  });
  function heightAt(x,z){
    const scenery=surfaceAt(x,z);
    if(scenery){
      const road=scenery.surface.sample(x,z);
      const corner=scenery.filletSurface.sample(x,z,0);
      if(road&&road.distance<=road.halfWidth+.08)
        return road.height+.072;
      if(corner!==null)return corner;
      const ramp=scenery.rampSurface.heightAt(x,z,scenery.surface);
      if(ramp!==null)return ramp;
      if(road&&road.distance<=road.halfWidth+road.walk)
        return road.height+(road.curbTop??.18);
    }
    const hit=roadSurfaceAdapter.sample(x,z);
    if(hit&&hit.distance<=hit.halfWidth+.08)return hit.height+.072;
    if(hit&&hit.distance<=hit.halfWidth+hit.walk)
      return hit.height+(hit.curbTop??.18);
    return sampleHeight(x,z);
  }
  const geometryStatistics={...summarizeRoadSectors(first.tiles)};
  // Aggregate diagnostic counters must NOT alias the first scenery's
  // mutable local counters; otherwise resetting totals erases that
  // sector's own visibility measurements.
  const lodStatistics={...first.lodStatistics};
  const stats={
    roads:map.roads.length,buildings:0,trees:0,pilotFacades:0,
    landmarks:corridorLandmarks.length,fictionalStores:0,utilityPoles:0,
    nodes:graph.nodes.length,edges:graph.edges.length,
    components:graph.components,junctions:globalJunctions.length,
    knownWidths:map.roads.filter(r=>r.widthSource==="osm:width").length,
    asphaltUnion:first.asphaltUnion,laneStatistics:first.laneStatistics,
    roadsideStats:first.roadsideStats,gradeStatistics:first.gradeStatistics,
    cornerStatistics:first.cornerStatistics,
    medianStatistics:first.medianStatistics,
    seamStatistics:first.seamStatistics,
    crossingStatistics:first.crossingStatistics,
    rampStatistics:first.rampStatistics,
    finishStatistics:first.finishStatistics,
    buildProfile:first.buildProfile,geometryStatistics,lodStatistics,
    streaming:counters,
    worldTiming:{roadsMs:+counters.initialRegionMs.toFixed(1),
      terrainMs:0,totalMs:0}
  };
  const rebuildStats=()=>{
    const tiles=[...loaded.values()].flatMap(r=>r.scenery.tiles);
    Object.assign(geometryStatistics,summarizeRoadSectors(tiles));
    counters.trianglesAllocated=geometryStatistics.triangles;
    Object.assign(lodStatistics,{visibleTriangles:0,hiddenTriangles:0,
      visibleTiles:0,culledTiles:0,visibleDrawables:0,
      hiddenDrawables:0});
    for(const {scenery} of loaded.values())
      for(const name of ["visibleTriangles","hiddenTriangles",
        "visibleTiles","culledTiles","visibleDrawables","hiddenDrawables"])
        lodStatistics[name]+=scenery.lodStatistics[name]||0;
  };
  let focus={x:spawn.x,z:spawn.z},queue=[],
    scheduled=false,disposed=false,lastPlan=null;
  const schedule=()=>{
    if(scheduled||disposed||!queue.length)return;
    scheduled=true;
    const run=()=>{
      scheduled=false;if(disposed)return;
      // Skip any region no longer near the player after rapid teleport.
      const current=new Set(plannedRegions(focus.x,focus.z,
        {radius:PRELOAD_METRES}).map(r=>r.key));
      while(queue.length){
        const todo=queue.shift();
        if(!current.has(todo.key)||
           loaded.has(todo.key)||emptyRegions.has(todo.key))continue;
        counters.building=todo.key;
        try{buildRegion(todo.x,todo.z);}
        catch(error){
          console.error("[Buzun WorldGen] Falha no setor "+todo.key,error);
          emptyRegions.add(todo.key);
        }finally{counters.building=null;}
        break;
      }
      counters.queuedRegions=queue.length;
      rebuildStats();
      if(queue.length)schedule();
    };
    if(typeof requestIdleCallback==="function")
      requestIdleCallback(run,{timeout:350});
    else setTimeout(run,35);
  };
  function refreshQueue(x,z){
    focus={x,z};
    const wanted=plannedRegions(x,z,{radius:PRELOAD_METRES});
    queue=wanted.filter(r=>!loaded.has(r.key)&&
      !emptyRegions.has(r.key));
    counters.queuedRegions=queue.length;
    schedule();
  }
  function evict(x,z){
    const distant=[...loaded.entries()].map(([key,entry])=>({
      key,entry,distance:regionDistance(x,z,entry.x,entry.z)
    })).filter(c=>c.distance>EVICT_METRES);
    distant.sort((a,b)=>b.distance-a.distance);
    const excess=Math.max(0,loaded.size-MAX_LOADED);
    const removal=new Set(distant.map(v=>v.key));
    if(excess)for(const entry of [...loaded.entries()].map(([key,entry])=>({
      key,entry,distance:regionDistance(x,z,entry.x,entry.z)
    })).sort((a,b)=>b.distance-a.distance).slice(0,excess))
      if(entry.distance>PRELOAD_METRES)removal.add(entry.key);
    for(const key of removal){
      const record=loaded.get(key);
      if(!record)continue;
      for(const tile of record.scenery.tiles){
        scene.remove(tile.group);
        for(const mesh of Object.values(tile.meshes))
          mesh.geometry.dispose();
        // DO NOT dispose cached road materials; they are shared
        // across all currently visible regions.
      }
      loaded.delete(key);
      counters.unloadedRegions++;
    }
    counters.loadedRegions=loaded.size;
    if(removal.size)rebuildStats();
  }
  let lastLod=[Infinity,Infinity],lastRegionKey="";
  function update(x,z){
    const current=regionAt(x,z);
    const key=regionKey(current.x,current.z);
    if(key!==lastRegionKey||
       Math.hypot(x-lastPlan?.[0],z-lastPlan?.[1])>250||
       !lastPlan){
      lastRegionKey=key;lastPlan=[x,z];
      refreshQueue(x,z);
      evict(x,z);
    }
    if(Math.hypot(x-lastLod[0],z-lastLod[1])>10){
      for(const record of loaded.values())
        record.scenery.updateVisibility(x,z);
      lastLod=[x,z];rebuildStats();
    }
    ground.update(x,z);
  }
  // Seed neighbor loading as soon as the first region has materialized.
  const beforeTerrain=time();
  update(spawn.x,spawn.z);
  stats.worldTiming.terrainMs=+(time()-beforeTerrain).toFixed(1);
  stats.worldTiming.totalMs=+(time()-began).toFixed(1);
  console.info("[Buzun WorldGen 5.11] Primeira região:",
    stats.worldTiming,counters);
  const empty=[];
  return {
    segments:streets.segments,spawn,terminalSpawn:spawn,
    pilotSpawns:empty,collides:()=>false,
    inExploreArea:(x,z)=>x>bounds.minX&&x<bounds.maxX&&
      z>bounds.minZ&&z<bounds.maxZ&&
      (streets.closest(x,z)?.distance??Infinity)<62,
    heightAt,facades:empty,corridorLandmarks,
    closest:streets.closest,
    nearbySegments:(x,z,r=650)=>streets.candidates(x,z,r),
    update,graph,stats,bounds,
    dispose(){disposed=true;queue=[];evict(Infinity,Infinity);}
  };
}
