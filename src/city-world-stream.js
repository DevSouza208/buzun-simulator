import {sampleHeight} from "./terrain.js";
import {coordinateKey} from "./draped-road.js";
import {buildIntersectionGradeModels} from "./intersection-grade.js";
import {buildSmoothRoadConnectors} from "./worldgen-road-connectors.js";
import {createRoadScene,createRoadSceneSteps,getJunctions}
  from "./city-road-mesh.js";
import {createCooperativeRunner} from "./worldgen-cooperative.js";
import {createRegionGeometryCache} from "./worldgen-region-cache.js";
import {resolveRegionalHeight,resolveRegionalSurface,roadRegionAhead,
  prioritizeBoundaryQueue} from "./worldgen-boundary-height.js";
import {createRoadCorridors} from "./road-corridor.js";
import {createCarvedTerrain} from "./terrain-cutout.js";
import {createWorldSheet} from "./worldgen-sheet.js";
import {createFlatMapWorldSheet,flatSampleHeight} from "./worldgen-flat-map.js";
import {createSheetTerrain} from "./worldgen-sheet-terrain.js";
import {applyVisualVectorEdits,createVectorElevationField}
  from "./worldgen-vector-edit-model.js";
import {createFlatVectorRoadPlan,VECTOR_SEAM_GUARD_METRES}
  from "./worldgen-flat-vector-roads.js";
import {ROAD_DETAIL_DEFAULT} from "./vector-road-quality.js";
import {createFlatAsphaltPlan} from "./worldgen-flat-asphalt-surface.js";
import {physicalLayer} from "./asphalt-union.js";
import {createGlobalAsphaltAtlas} from "./worldgen-global-asphalt.js";
import {graphFromRoads} from "./grajau-osm.js";
import {summarizeRoadSectors} from "./worldgen-diagnostics.js";
import {createRegionRoadIndex,regionAt,regionKey,regionBounds,
  plannedRegions,prioritizeDriveRegions,regionDistance,REGION_METRES,
  activateLoadedRoadRegion} from "./worldgen-region-stream.js";

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
export function createStreamingCityWorld(scene,map,{
  sheetPreview=false,flatWorld=false,flatPaintedRoads=false,
  flatTextureQuality="smooth",flatRoadRender="raster",
  vectorDetail=ROAD_DETAIL_DEFAULT,
  vectorSeamGuardMetres=VECTOR_SEAM_GUARD_METRES,
  reliefWorld=false,vectorEdits=null
}={}){
  const began=time(),bounds=boundsFor(map.roads);
  const streets=centerlineIndex(map.roads);
  const routeStart=map.route?.[0]||[0,0];
  const origin=streets.closest(...routeStart);
  if(!origin)throw Error("Rota inicial não possui asfalto OSM");
  const next=map.route?.[1]||[origin.x,origin.z-1];
  const spawn={x:origin.x,z:origin.z,
    angle:Math.atan2(next[0]-routeStart[0],
      -(next[1]-routeStart[1]))};
  // Flat experiment uses ONLY the snapshot shown by the mini-map.
  // No synthesized shortcuts, connector ways or geographic edits.
  const terrainHeight=reliefWorld?sampleHeight:
    flatWorld?flatSampleHeight:sampleHeight;
  const joinPlan=flatWorld?
    {connectors:[],stats:{connected:0}}:
    buildSmoothRoadConnectors(map.roads,terrainHeight);
  const renderRoads=flatWorld?map.roads:
    [...map.roads,...joinPlan.connectors];
  const regionIndex=createRegionRoadIndex(renderRoads);
  // Model the city once, render it in parts. Global OSM junction planes and
  // fixed height anchors keep a road's source profile identical for EVERY
  // region, even when the compositor clips triangles into separate meshes.
  const globalJunctions=getJunctions(map.roads);
  const globalGrades=buildIntersectionGradeModels(
    map.roads,globalJunctions,terrainHeight);
  const globalFixedJunctions=new Set(
    globalJunctions.map(j=>coordinateKey(j.point)));
  // v6 opt-in: one canonical, road-aware terrain height field. It is
  // created once for all OSM roads and does not depend on region loading.
  const sheetOptions={
    gradeModels:globalGrades,
    fixedJunctions:globalFixedJunctions,
    junctions:globalJunctions
  };
  const visualRoads=vectorEdits?
    applyVisualVectorEdits(map.roads,vectorEdits):map.roads;
  // OSM routing/physics identifiers remain unchanged, but the visible
  // terrain support follows manually shifted DISPLAY vectors. Otherwise
  // editing a hillside road would leave its old roadside depression behind.
  const worldSheet=reliefWorld?
    createWorldSheet(visualRoads,terrainHeight,sheetOptions):
    flatWorld?createFlatMapWorldSheet(renderRoads,sheetOptions):
    sheetPreview?createWorldSheet(renderRoads,terrainHeight,
      sheetOptions):null;
  const elevationField=reliefWorld&&worldSheet?
    createVectorElevationField(
      (x,z)=>worldSheet.meshHeight(x,z),map.roads,vectorEdits):null;
  const surfaceHeight=elevationField?.sample||null;
  const terrainSheet=surfaceHeight?{
    tileSample:surfaceHeight,flatWorld:false
  }:worldSheet;
  // All OSM streets are part of ONE canonical asphalt domain. Atlas
  // cells are only render/cache partitions and never decide junctions.
  // Flat WorldGen 7.0: every same-level road is painted on one
  // continuous ground sheet. Bridges/tunnels remain separate 3D meshes.
  const flatAsphaltPlan=flatWorld&&flatPaintedRoads&&
    flatRoadRender!=="vector"?
    createFlatAsphaltPlan(map.roads):null;
  const flatVectorPlan=flatWorld&&flatPaintedRoads&&
    flatRoadRender==="vector"?
    createFlatVectorRoadPlan(visualRoads,{
      seamGuardMetres:vectorSeamGuardMetres,
      sampleHeight:surfaceHeight
    }):null;
  const flatAnyRoad=Boolean(flatAsphaltPlan||flatVectorPlan);
  const asphaltSource=flatAnyRoad?
    renderRoads.filter(road=>physicalLayer(road)!==0):
    renderRoads;
  const globalAsphaltAtlas=worldSheet?createGlobalAsphaltAtlas(
    asphaltSource,worldSheet,{
      junctions:globalJunctions,
      gradeModels:globalGrades,
      naturalHeight:terrainHeight,
      flatLayerSpacing:flatWorld?5:0
    }):null;
  const worldSource={globalGrades,globalFixedJunctions,
    worldSheet,globalAsphaltAtlas,
    flatPaintedRoadside:flatAnyRoad,
    vectorSurfaceHeight:surfaceHeight};
  const loaded=new Map(),emptyRegions=new Set();
  const disposeRegion=record=>{
    for(const tile of record.scenery.tiles){
      scene.remove(tile.group);
      for(const mesh of Object.values(tile.meshes))
        mesh.geometry.dispose();
      // Road materials/textures are shared by every active region.
      // Dispose ONLY geometry, never the shared material.
    }
  };
  const cache=createRegionGeometryCache({
    onEvict:(_,record)=>disposeRegion(record)
  });
  // Regions are mounted while the user may be standing still on the
  // landing screen. They MUST receive LOD visibility immediately; waiting
  // for the next 10m player movement leaves every brand-new chunk visible
  // and can send hundreds of draw calls to WebGL (measured 1.8 FPS).
  let visibilityFocus={x:spawn.x,z:spawn.z};
  const counters={mode:flatVectorPlan?"flat-vector-osm":
    flatAsphaltPlan?"flat-single-surface":
    flatWorld?"flat-osm-1to1":
    sheetPreview?"world-sheet-preview":"experimental",
    regionMetres:REGION_METRES,
    repairedRoadGaps:joinPlan.stats.connected,
    totalRoads:map.roads.length,loadedRegions:0,readyRegions:0,
    unloadedRegions:0,building:null,queuedRegions:0,
    totalRegionBuildMs:0,initialRegionMs:0,
    maxRegionBuildMs:0,trianglesAllocated:0,
    urgentRegionLoads:0,travelDirection:[0,0],
    backgroundRegions:0,cooperativeSlices:0,
    maxCooperativeSliceMs:0,cooperativeCpuMs:0,
    cancelledBackgroundRegions:0,buildStage:null,
    asphaltWorkerRegions:0,asphaltWorkerFallbacks:0,
    asphaltWorkerTriangles:0,
    roadsideWorkerRegions:0,roadsideWorkerFallbacks:0,
    roadsideWorkerPrimitives:0,
    maxCooperativeStepMs:0,slowestCooperativeStage:null,
    slowCooperativeSteps:0,asphaltWorkerWaitSlices:0,
    cachedRegions:0,cachedGeometryMiB:0,cachedRestores:0,
    cacheDiscards:0,cacheRejects:0,cacheStores:0,
    boundaryHeightBlends:0,boundaryNeighborSamples:0,
    boundaryPrefetches:0,boundaryUrgentLoads:0,
    borderFallbackHeights:0};
  const syncCacheStats=()=>{
    const status=cache.stats;
    counters.cachedRegions=status.entries;
    counters.cachedGeometryMiB=status.estimatedMiB;
    counters.cacheDiscards=status.evictions;
    counters.cacheRejects=status.rejects;
    counters.cacheStores=status.stores;
  };
  const buildRegion=(rx,rz)=>{
    const key=regionKey(rx,rz);
    if(loaded.has(key)||emptyRegions.has(key))return;
    const restored=cache.take(key);
    if(restored){
      // The exact same draped grades, ramp indices and GPU geometries
      // are reattached: no new OSM union or Worker job is launched.
      for(const tile of restored.scenery.tiles)scene.add(tile.group);
      activateLoadedRoadRegion(restored.scenery,
        visibilityFocus.x,visibilityFocus.z);
      loaded.set(key,restored);
      counters.cachedRestores++;
      counters.loadedRegions=loaded.size;
      syncCacheStats();
      return restored.scenery;
    }
    const ways=regionIndex.select(rx,rz);
    if(!ways.length){emptyRegions.add(key);return;}
    const started=time();
    // The full road compositor operates on ALL ways touching the halo;
    // clipping occurs only after every intersection has been resolved.
    const scenery=createRoadScene(scene,ways,terrainHeight,
      {renderBounds:regionBounds(rx,rz),...worldSource});
    activateLoadedRoadRegion(scenery,visibilityFocus.x,visibilityFocus.z);
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
  // Painted flat roads are already visible on the ground plane.
  // A region with no 3D lane stripes must still be playable.
  if(!first||(!flatAnyRoad&&first.tiles.length===0))
    throw Error("A região inicial não gerou pista 3D");
  counters.initialRegionMs=counters.totalRegionBuildMs;
  // Use the same full source for terrain cutouts, regardless of whether
  // region meshes happen to be present in the GPU at that instant.
  const corridors=createRoadCorridors(renderRoads);
  const regionScenery=(rx,rz)=>{
    const key=regionKey(rx,rz);
    return loaded.get(key)?.scenery||cache.peek(key)?.scenery||null;
  };
  const roadSurfaceAdapter={sample(x,z){
    // Near an 880m border, the adjacent fully-composed region often has
    // the right pavement altitude even when our current cell is queued.
    const hit=resolveRegionalSurface(x,z,regionScenery);
    if(hit)return hit;
    const nearest=streets.closest(x,z);
    if(!nearest)return null;
    const halfWidth=nearest.segment.width/2;
    if(nearest.distance>halfWidth+4)return null;
    return {roadId:nearest.segment.id,
      height:terrainHeight(nearest.x,nearest.z),
      distance:nearest.distance,halfWidth,walk:1.7,curbTop:.18};
  }};
  // A sheet does not cut a transparent hole underneath asphalt.
  // Adjacent terrain chunks use precisely the same global H(x,z).
  const ground=worldSheet?
    createSheetTerrain(scene,terrainSheet,bounds,{
      flatAsphaltPlan,flatVectorPlan,flatTextureQuality,
      vectorDetail
    }):
    createCarvedTerrain(scene,corridors,globalJunctions,
      terrainHeight,bounds,roadSurfaceAdapter);
  const graph=graphFromRoads(map.roads);
  const corridorLandmarks=(map.landmarks||[]).map(loc=>{
    const road=streets.closest(...loc.xy);
    return {key:loc.key,label:loc.label,xy:loc.xy,
      roadPoint:road?[road.x,road.z]:loc.xy,confirmedFootprint:false};
  });
  function heightAt(x,z){
    if(surfaceHeight){
      // The terrain and all vector overlays use the same H(x,z).
      // Camera, car and collisions cannot develop a step at a junction.
      const hit=worldSheet.roadAt(x,z);
      return surfaceHeight(x,z)+
        (hit&&hit.distance<=hit.halfWidth+.08 ? .22 : 0);
    }
    if(worldSheet){
      // Collision cannot change height when a neighboring chunk arrives:
      // the entire road profile exists independently of streamed meshes.
      const street=worldSheet.roadAt(x,z);
      if(street?.distance<=street.halfWidth+.08)
        return street.base+.072;
      if(street?.distance<=street.halfWidth+street.walk)
        return street.base+(street.curbTop??.18);
      return worldSheet.meshHeight(x,z);
    }
    const sampled=resolveRegionalHeight(x,z,regionScenery,{
      onBlend:()=>counters.boundaryHeightBlends++
    });
    if(sampled){
      if(sampled.fromNeighbor)counters.boundaryNeighborSamples++;
      return sampled.height;
    }
    // Only when NO completed region in the boundary halo can supply the
    // asphalt surface do we use an OSM + DEM approximation. This avoids
    // snapping from a measured draped sheet to a raw height at the seam.
    const hit=roadSurfaceAdapter.sample(x,z);
    if(hit){
      counters.borderFallbackHeights++;
      if(hit.distance<=hit.halfWidth+.08)return hit.height+.072;
      if(hit.distance<=hit.halfWidth+hit.walk)
        return hit.height+(hit.curbTop??.18);
    }
    return terrainHeight(x,z);
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
    scheduled=false,disposed=false,lastPlan=null,pendingTask=null;
  // Initial OSM heading helps neighbor loads favor the direction of travel.
  let driveHeading=[Math.sin(spawn.angle),-Math.cos(spawn.angle)];
  let lastPrefetchKey=null;
  const schedule=()=>{
    if(scheduled||disposed||(!queue.length&&!pendingTask))return;
    scheduled=true;
    const run=()=>{
      scheduled=false;
      if(disposed)return;
      const current=new Set(plannedRegions(focus.x,focus.z,
        {radius:PRELOAD_METRES}).map(r=>r.key));
      if(pendingTask&&!current.has(pendingTask.key)){
        pendingTask.runner.cancel();
        pendingTask=null;
        counters.cancelledBackgroundRegions++;
        counters.building=null;
        counters.buildStage=null;
      }
      if(!pendingTask){
        while(queue.length){
          const todo=queue.shift();
          if(!current.has(todo.key)||loaded.has(todo.key)||
             emptyRegions.has(todo.key))continue;
          if(cache.has(todo.key)){
            buildRegion(todo.x,todo.z);
            rebuildStats();
            // One reattachment per idle slice avoids frame spikes.
            break;
          }
          const ways=regionIndex.select(todo.x,todo.z);
          if(!ways.length){emptyRegions.add(todo.key);continue;}
          const started=time();
          pendingTask={
            ...todo,started,
            runner:createCooperativeRunner(createRoadSceneSteps(
              scene,ways,terrainHeight,
              {renderBounds:regionBounds(todo.x,todo.z),
                backgroundAsphalt:true,...worldSource}),{
              now:time,sliceMs:6,maxSteps:6
            })
          };
          counters.building=todo.key;
          break;
        }
      }
      if(pendingTask){
        const task=pendingTask;
        try{
          const step=task.runner.advance();
          counters.cooperativeSlices++;
          counters.maxCooperativeSliceMs=Math.max(
            counters.maxCooperativeSliceMs,step.elapsed||0);
          counters.cooperativeCpuMs+=step.elapsed||0;
          if(task.runner.stats.maxStepMs>counters.maxCooperativeStepMs){
            counters.maxCooperativeStepMs=task.runner.stats.maxStepMs;
            counters.slowestCooperativeStage=task.runner.stats.slowestStage;
          }
          counters.slowCooperativeSteps+=
            task.runner.stats.slowSteps-(task.reportedSlowSteps||0);
          task.reportedSlowSteps=task.runner.stats.slowSteps;
          counters.asphaltWorkerWaitSlices+=
            task.runner.stats.waitSlices-(task.reportedWaitSlices||0);
          task.reportedWaitSlices=task.runner.stats.waitSlices;
          counters.buildStage=step.progress?.stage||"finalizando";
          if(step.done){
            const scenery=step.value;
            activateLoadedRoadRegion(scenery,
              visibilityFocus.x,visibilityFocus.z);
            const elapsed=time()-task.started;
            counters.totalRegionBuildMs+=elapsed;
            counters.maxRegionBuildMs=Math.max(
              elapsed,counters.maxRegionBuildMs);
            loaded.set(task.key,{x:task.x,z:task.z,scenery,ms:elapsed});
            counters.readyRegions++;
            counters.backgroundRegions++;
            counters.loadedRegions=loaded.size;
            if(scenery.asphaltWorkerStats?.used){
              counters.asphaltWorkerRegions++;
              counters.asphaltWorkerTriangles+=
                scenery.asphaltWorkerStats.triangles;
            }else if(scenery.asphaltWorkerStats?.fallback){
              counters.asphaltWorkerFallbacks++;
            }
            if(scenery.roadsideWorkerStats?.used){
              counters.roadsideWorkerRegions++;
              counters.roadsideWorkerPrimitives+=
                scenery.roadsideWorkerStats.primitives;
            }else if(scenery.roadsideWorkerStats?.fallback){
              counters.roadsideWorkerFallbacks++;
            }
            pendingTask=null;
            counters.building=null;
            counters.buildStage=null;
            rebuildStats();
          }
        }catch(error){
          console.error("[Buzun WorldGen] Falha no setor "+task.key,error);
          emptyRegions.add(task.key);
          task.runner.cancel();
          pendingTask=null;
          counters.building=null;
          counters.buildStage=null;
        }
      }
      counters.queuedRegions=queue.length+(pendingTask?1:0);
      if(queue.length||pendingTask)schedule();
    };
    // requestIdleCallback merely schedules the NEXT short CPU slice;
    // unlike v5.11–5.13, no single idle callback builds a whole region.
    if(typeof requestIdleCallback==="function")
      requestIdleCallback(run,{timeout:280});
    else setTimeout(run,16);
  };
  function refreshQueue(x,z){
    const dx=x-focus.x,dz=z-focus.z;
    const move=Math.hypot(dx,dz);
    if(move>8)driveHeading=[dx/move,dz/move];
    focus={x,z};
    counters.travelDirection=driveHeading.map(v=>+v.toFixed(3));
    const wanted=prioritizeDriveRegions(x,z,{
      heading:driveHeading,radius:PRELOAD_METRES});
    queue=wanted.filter(r=>!loaded.has(r.key)&&
      !emptyRegions.has(r.key));
    // Predict the NEXT boundary crossing, not merely the nearest region
    // center: a queued sector immediately ahead gets first opportunity
    // to run its Workers while the car is still on visible asphalt.
    const ahead=roadRegionAhead(x,z,driveHeading);
    if(ahead?.key!==lastPrefetchKey)lastPrefetchKey=null;
    if(ahead&&!loaded.has(ahead.key)&&
       !emptyRegions.has(ahead.key)){
      queue=prioritizeBoundaryQueue(queue,ahead);
      if(lastPrefetchKey!==ahead.key){
        counters.boundaryPrefetches++;
        lastPrefetchKey=ahead.key;
      }
    }
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
      // Stop rendering immediately. Cache owns the detached, fully
      // constructed scene and its exact physical road surface index.
      for(const tile of record.scenery.tiles)scene.remove(tile.group);
      loaded.delete(key);
      cache.put(key,record); // LRU disposes oldest/oversize entries
      counters.unloadedRegions++;
    }
    syncCacheStats();
    counters.loadedRegions=loaded.size;
    if(removal.size)rebuildStats();
  }
  let lastLod=[Infinity,Infinity],lastRegionKey="";
  function update(x,z){
    visibilityFocus={x,z};
    const current=regionAt(x,z);
    const key=regionKey(current.x,current.z);
    const moved=!lastPlan?Infinity:
      Math.hypot(x-lastPlan[0],z-lastPlan[1]);
    // Track direction and re-rank forward regions sooner than the old
    // 200m interval. This matters on short links near cell boundaries.
    if(key!==lastRegionKey||moved>60){
      lastRegionKey=key;lastPlan=[x,z];
      refreshQueue(x,z);
      // Teleports or rapid movement can enter an area before idle
      // prefetch finishes. Build that exact cell once rather than drive
      // on approximate ground with invisible asphalt. This slow path
      // is only entered when prefetch did not meet the player in time.
      if(!loaded.has(key)&&!emptyRegions.has(key)){
        if(pendingTask?.key===key){
          pendingTask.runner.cancel();
          pendingTask=null;
          counters.cancelledBackgroundRegions++;
          counters.building=null;
          counters.buildStage=null;
        }
        // Warm restoration is not an urgent rebuild; do not increment
        // the emergency construction counter for a cache hit.
        const warm=cache.has(key);
        if(!warm){
          counters.urgentRegionLoads++;
          counters.boundaryUrgentLoads++;
        }
        try{
          buildRegion(current.x,current.z);
          rebuildStats();
        }
        catch(error){
          console.error("[Buzun WorldGen] Falha na região atual",error);
          emptyRegions.add(key);
        }
      }
      evict(x,z);
    }
    if(Math.hypot(x-lastLod[0],z-lastLod[1])>10){
      for(const record of loaded.values())
        record.scenery.updateVisibility(x,z);
      lastLod=[x,z];rebuildStats();
    }
    ground.update(x,z);
    if(flatVectorPlan){
      counters.vectorSeamGuardMetres=flatVectorPlan.stats.seamGuardMetres;
      counters.vectorRoadTriangles=ground.vectorTriangles;
      counters.vectorRoadTiles=ground.loadedTiles;
      counters.vectorRoadDetail=ground.vectorDetail;
      counters.vectorPendingTiles=ground.vectorPendingTiles;
    }
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
    flatWorld:flatWorld&&!reliefWorld,reliefWorld,
    flatPaintedRoads:flatAnyRoad,
    pilotSpawns:empty,collides:()=>false,
    inExploreArea:(x,z)=>x>bounds.minX&&x<bounds.maxX&&
      z>bounds.minZ&&z<bounds.maxZ&&
      (streets.closest(x,z)?.distance??Infinity)<62,
    heightAt,facades:empty,corridorLandmarks,
    closest:streets.closest,
    nearbySegments:(x,z,r=650)=>streets.candidates(x,z,r),
    update,graph,stats,bounds,
    setRoadDetailLevel:level=>{
      const changed=ground.setVectorDetailLevel?.(level)??false;
      if(changed){
        counters.vectorRoadDetail=ground.vectorDetail;
        counters.vectorPendingTiles=ground.vectorPendingTiles;
      }
      return changed;
    },
    dispose(){
      disposed=true;queue=[];
      pendingTask?.runner.cancel();
      pendingTask=null;
      // World teardown always frees everything, not a warm LRU store.
      for(const record of loaded.values())disposeRegion(record);
      loaded.clear();
      cache.clear();
      worldSheet&&ground.dispose();
      syncCacheStats();
      counters.loadedRegions=0;
    }
  };
}
