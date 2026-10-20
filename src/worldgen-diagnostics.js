/**
 * Buzun WorldGen 5.10 — pure, testable instrumentation + distance LOD.
 *
 * Distances are from the camera/player to the NEAREST edge of a 440 m tile,
 * not the tile center. This matters when a car is near a tile boundary.
 * No geometry, height samples, collisions, terrain masks or OSM topology
 * are changed by LOD. We only skip visually tiny material groups.
 */
export const ROAD_CHUNK_METRES=440;
export const ROAD_LOD_METRES=Object.freeze({
  asphalt:Infinity, // pinned to the world's visibility radius
  walk:850,          // pavement remains visible as far as road base
  median:630,
  curb:390,
  white:520,
  yellow:520,
  tactile:135,
  shoulder:630,
  caps:Infinity
});
export function distanceToRoadTile(x,z,tileX,tileZ,{
  chunkSize=ROAD_CHUNK_METRES,overhang=25
}={}){
  const x0=tileX*chunkSize-overhang,x1=(tileX+1)*chunkSize+overhang;
  const z0=tileZ*chunkSize-overhang,z1=(tileZ+1)*chunkSize+overhang;
  return Math.hypot(Math.max(x0-x,0,x-x1),
    Math.max(z0-z,0,z-z1));
}
export function roadDetailVisible(kind,distance,{
  radius=850,wasVisible=false,hysteresis=18
}={}){
  const limit=Math.min(radius,ROAD_LOD_METRES[kind]??radius);
  return distance<=limit+(wasVisible?hysteresis:0);
}
export function makeWorldgenProfiler(now=()=>
  typeof performance!=="undefined"?performance.now():Date.now()){
  const born=now();let previous=born;
  const stages={};
  return {
    mark(name){
      const time=now();
      stages[name]=Math.max(0,time-previous);
      previous=time;
      return stages[name];
    },
    report(){
      return {totalMs:+(now()-born).toFixed(2),
        stagesMs:Object.fromEntries(Object.entries(stages).map(
          ([name,value])=>[name,+value.toFixed(2)]))};
    }
  };
}
export function geometryBudget(counts){
  const out={triangles:0,vertices:0,gpuBytes:0,byMaterial:{}};
  for(const [kind,values] of Object.entries(counts)){
    const vertices=Math.floor(values.length/3),
      triangles=Math.floor(vertices/3);
    if(!vertices)continue;
    const textured=["asphalt","walk","median"].includes(kind);
    // Every float32 position + float32 normal; textured gets 2D UVs.
    const bytes=vertices*(6+(textured?2:0))*4;
    out.byMaterial[kind]={vertices,triangles,gpuBytes:bytes};
    out.vertices+=vertices;out.triangles+=triangles;out.gpuBytes+=bytes;
  }
  return out;
}
export function summarizeRoadSectors(sectors,{top=10}={}){
  const totals={tiles:sectors.length,vertices:0,triangles:0,
    gpuBytes:0,byMaterial:{}};
  for(const tile of sectors){
    totals.vertices+=tile.budget.vertices;
    totals.triangles+=tile.budget.triangles;
    totals.gpuBytes+=tile.budget.gpuBytes;
    for(const [kind,value] of Object.entries(tile.budget.byMaterial)){
      const item=totals.byMaterial[kind]??{triangles:0,gpuBytes:0};
      item.triangles+=value.triangles;
      item.gpuBytes+=value.gpuBytes;
      totals.byMaterial[kind]=item;
    }
  }
  return {...totals,megabytes:+(totals.gpuBytes/1048576).toFixed(2),
    heavySectors:[...sectors].sort((a,b)=>
      b.budget.gpuBytes-a.budget.gpuBytes).slice(0,top).map(tile=>({
      tile:tile.x+":"+tile.z,triangles:tile.budget.triangles,
      megabytes:+(tile.budget.gpuBytes/1048576).toFixed(2)
    }))};
}
/** Only CPU-side visibility metrics, no GPU readback or side effects. */
export function newRoadVisibilityStats(){
  return {updates:0,culledTiles:0,visibleTiles:0,
    visibleTriangles:0,hiddenTriangles:0,visibleDrawables:0,
    hiddenDrawables:0};
}
export function applyRoadTileLOD(tiles,x,z,{
  radius=850,hysteresis=18,
  stats=newRoadVisibilityStats()
}={}){
  let shown=0,hidden=0,visibleTriangles=0,hiddenTriangles=0,
    visibleDrawables=0,hiddenDrawables=0;
  for(const tile of tiles){
    const distance=distanceToRoadTile(x,z,tile.x,tile.z);
    let any=false;
    for(const [kind,mesh] of Object.entries(tile.meshes)){
      const visible=roadDetailVisible(kind,distance,{
        radius,wasVisible:mesh.visible,hysteresis});
      mesh.visible=visible;
      const triangles=tile.budget.byMaterial[kind]?.triangles??0;
      if(visible){any=true;visibleTriangles+=triangles;visibleDrawables++;}
      else{hiddenTriangles+=triangles;hiddenDrawables++;}
    }
    tile.group.visible=any;
    if(any)shown++;else hidden++;
  }
  Object.assign(stats,{
    updates:stats.updates+1,visibleTiles:shown,culledTiles:hidden,
    visibleTriangles,hiddenTriangles,
    visibleDrawables,hiddenDrawables
  });
  return stats;
}
