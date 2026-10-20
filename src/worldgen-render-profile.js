/**
 * WorldGen 5.12 — performance-only quality presets for regional geometry.
 * OSM vertices, junction topology, road width, ramps and physical height
 * authority remain unchanged. We vary only intermediate render samples,
 * optional visual paver density, and final draw-call batching.
 */
export const ROAD_RENDER_PROFILE=Object.freeze({
  complete:Object.freeze({
    sampleMetres:5,tactileColumns:7,tactileRows:2,
    mergeByRegion:false
  }),
  streaming:Object.freeze({
    sampleMetres:9,tactileColumns:3,tactileRows:1,
    mergeByRegion:true
  })
});
export function renderProfile(regionBounds=null){
  return regionBounds?ROAD_RENDER_PROFILE.streaming:
    ROAD_RENDER_PROFILE.complete;
}
/** A single chunk per streaming region means up to one GPU draw per
 * actual material, rather than N independent 440m chunks per material.
 * It is ALWAYS clipped to that region's exact render bounds.
 */
export function renderBatchForPoint(point,regionBounds,{
  chunkMetres=440
}={}){
  if(regionBounds){
    return {
      x:Math.floor(regionBounds.minX/chunkMetres),
      z:Math.floor(regionBounds.minZ/chunkMetres),
      bounds:regionBounds
    };
  }
  return {
    x:Math.floor(point[0]/chunkMetres),
    z:Math.floor(point[1]/chunkMetres),
    bounds:null
  };
}
