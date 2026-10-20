import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {distanceToRoadTile,roadDetailVisible,geometryBudget,
  summarizeRoadSectors,makeWorldgenProfiler,newRoadVisibilityStats,
  applyRoadTileLOD} from "../src/worldgen-diagnostics.js";
import {mountWorldgenOverlay} from "../src/worldgen-overlay.js";

test("Distance uses nearest tile EDGE, not its center — no pop on boundary",()=>{
  assert.equal(distanceToRoadTile(439,220,1,0),0);
  assert.equal(distanceToRoadTile(0,0,0,0),0);
  assert.equal(distanceToRoadTile(1000,0,0,0,{overhang:0}),560);
  assert.equal(distanceToRoadTile(200,200,0,0),0);
  assert.ok(distanceToRoadTile(600,600,0,0,{overhang:0})>220);
});
test("Asphalt, sidewalk and tactile keep separate LOD limits",()=>{
  assert.equal(roadDetailVisible("asphalt",700),true);
  assert.equal(roadDetailVisible("walk",700),true);
  assert.equal(roadDetailVisible("tactile",200),false);
  assert.equal(roadDetailVisible("tactile",130),true);
  assert.equal(roadDetailVisible("curb",420),false);
  assert.equal(roadDetailVisible("white",500),true);
  assert.equal(roadDetailVisible("yellow",520.2),false);
});
test("LOD respects player visibility radius and has low-distance hysteresis",()=>{
  assert.equal(roadDetailVisible("asphalt",100,{radius:85}),false);
  assert.equal(roadDetailVisible("asphalt",103,{radius:85,
    wasVisible:true,hysteresis:18}),true);
  assert.equal(roadDetailVisible("tactile",146,{
    wasVisible:true,hysteresis:18}),true);
  assert.equal(roadDetailVisible("tactile",154,{
    wasVisible:true,hysteresis:18}),false);
});
test("GPU memory estimates use 3D position + normals and UV for textured surfaces",()=>{
  const budget=geometryBudget({
    asphalt:Array(18).fill(0),walk:Array(9).fill(0),
    curb:Array(9).fill(0),tactile:Array(9).fill(0)
  });
  assert.equal(budget.triangles,5);
  assert.equal(budget.vertices,15);
  assert.equal(budget.byMaterial.asphalt.triangles,2);
  assert.equal(budget.gpuBytes,(6*32)+(3*32)+(3*24)+(3*24));
});
test("Spatial sector summary finds the heaviest sectors, count is deterministic",()=>{
  const big=geometryBudget({asphalt:Array(90).fill(0)});
  const small=geometryBudget({tactile:Array(18).fill(0)});
  const result=summarizeRoadSectors([
    {x:0,z:0,budget:small},{x:1,z:-1,budget:big}
  ],{top:1});
  assert.equal(result.tiles,2);
  assert.equal(result.triangles,12);
  assert.equal(result.heavySectors[0].tile,"1:-1");
  assert.equal(result.heavySectors.length,1);
  assert.equal(result.byMaterial.tactile.triangles,2);
});
function tile(x,z,counts){
  const budget=geometryBudget(Object.fromEntries(
    Object.entries(counts).map(([kind,triangles])=>
      [kind,Array(triangles*9).fill(0)])));
  return {x,z,budget,meshes:Object.fromEntries(
    Object.keys(counts).map(kind=>[kind,{visible:true}])),
    group:{visible:true}};
}
test("Per-material LOD removes tiny decorations but leaves full road close/medium",()=>{
  const t=tile(0,0,{asphalt:100,walk:200,curb:40,
    tactile:120,white:70,yellow:40});
  const stats=newRoadVisibilityStats();
  applyRoadTileLOD([t],500,200,{stats,hysteresis:0});
  assert.equal(t.group.visible,true);
  assert.equal(t.meshes.asphalt.visible,true);
  assert.equal(t.meshes.walk.visible,true);
  assert.equal(t.meshes.curb.visible,true,
    "500m camera x is only 35m away from tile boundary");
  assert.equal(t.meshes.tactile.visible,true);
  applyRoadTileLOD([t],870,220,{stats,hysteresis:0});
  assert.equal(t.meshes.asphalt.visible,true);
  assert.equal(t.meshes.walk.visible,true);
  assert.equal(t.meshes.tactile.visible,false);
  assert.equal(t.meshes.curb.visible,false);
  assert.equal(t.meshes.white.visible,true);
  assert.equal(stats.visibleTriangles,410);
  assert.equal(stats.hiddenTriangles,160);
  assert.equal(stats.updates,2);
  applyRoadTileLOD([t],2100,0,{stats,hysteresis:0});
  assert.equal(t.group.visible,false);
  assert.equal(stats.culledTiles,1);
  assert.equal(stats.visibleTriangles,0);
});
test("LOD updates are idempotent for same position and leave mesh data untouched",()=>{
  const tiles=[tile(0,0,{asphalt:200,walk:150,curb:75,
    tactile:100,white:80}),tile(2,0,{asphalt:300,walk:170})];
  const before=JSON.stringify(tiles.map(t=>t.budget));
  const first=applyRoadTileLOD(tiles,440,100);
  const firstVisible=tiles.map(t=>Object.values(t.meshes).map(m=>m.visible));
  const second=applyRoadTileLOD(tiles,440,100);
  assert.deepEqual(tiles.map(t=>Object.values(t.meshes).map(m=>m.visible)),
    firstVisible);
  assert.equal(JSON.stringify(tiles.map(t=>t.budget)),before);
  assert.ok(first.visibleTriangles>=0&&second.visibleTriangles>=0);
});
test("Profiler records relative durations without depending on browser APIs",()=>{
  let now=500;
  const profiler=makeWorldgenProfiler(()=>now);
  now=530;assert.equal(profiler.mark("asfalto"),30);
  now=615;profiler.mark("calcadas");
  now=700;
  const snapshot=profiler.report();
  assert.equal(snapshot.totalMs,200);
  assert.deepEqual(snapshot.stagesMs,{asfalto:30,calcadas:85});
});
test("Optional HUD is inert when not enabled or DOM absent",()=>{
  assert.equal(mountWorldgenOverlay({enabled:false}),null);
  assert.equal(mountWorldgenOverlay({enabled:true,documentRef:null}),null);
});
test("Real Grajaú snapshot has enough distinct geometry to warrant profiling",()=>{
  const map=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  assert.ok(map.roads.length>4000);
  const nodes=map.roads.reduce((sum,way)=>sum+way.p.length,0);
  assert.ok(nodes>30000);
  const stats=newRoadVisibilityStats();
  const tiles=[];
  const seen=new Set();
  for(const way of map.roads)for(const [x,z] of way.p){
    const ix=Math.floor(x/440),iz=Math.floor(z/440),key=ix+":"+iz;
    if(seen.has(key))continue;
    seen.add(key);tiles.push(tile(ix,iz,{asphalt:8,curb:4,tactile:2}));
  }
  const started=performance.now();
  applyRoadTileLOD(tiles,0,0,{stats});
  assert.ok(tiles.length>10);
  assert.ok(stats.culledTiles>0);
  assert.ok(stats.hiddenDrawables>stats.visibleDrawables);
  assert.ok(performance.now()-started<300);
  console.log("[buzun-lod-audit]",JSON.stringify({
    osmWays:map.roads.length,osmVertices:nodes,
    potentialSectors:tiles.length,
    visible:stats.visibleTiles,culled:stats.culledTiles,
    activeTriangles:stats.visibleTriangles,
    skippedTriangles:stats.hiddenTriangles}));
});
