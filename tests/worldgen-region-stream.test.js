import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {REGION_METRES,REGION_HALO_METRES,regionAt,
  regionBounds,regionDistance,regionKey,plannedRegions,
  createRegionRoadIndex,clip3DTriangle,
  clipMeshBufferToRegion,activateLoadedRoadRegion}
  from "../src/worldgen-region-stream.js";

const area=tri=>{
  const [a,b,c]=tri;
  return Math.abs((b[0]-a[0])*(c[2]-a[2])-
    (c[0]-a[0])*(b[2]-a[2]))/2;
};
const near=(a,b,tol=1e-6)=>Math.abs(a-b)<tol;

test("Region cells are contiguous 880m squares even for negative OSM coords",()=>{
  assert.equal(REGION_METRES,880);
  assert.ok(REGION_HALO_METRES>=45);
  assert.deepEqual(regionAt(0,0),{x:0,z:0});
  assert.deepEqual(regionAt(-.1,-880),{x:-1,z:-1});
  assert.deepEqual(regionAt(879.99,880),{x:0,z:1});
  assert.deepEqual(regionBounds(-1,1),
    {minX:-880,maxX:0,minZ:880,maxZ:1760});
  assert.equal(regionKey(-2,3),"-2:3");
});
test("Distance zero applies to whole CORE of a region; nearby regions prioritized",()=>{
  assert.equal(regionDistance(0,0,0,0),0);
  assert.equal(regionDistance(879,600,1,0),1);
  assert.ok(near(regionDistance(3000,0,0,0),2120));
  const planned=plannedRegions(450,-180,{radius:1350});
  assert.ok(planned.length>4&&planned.length<30);
  assert.equal(planned[0].key,"0:-1");
  assert.ok(planned.every(r=>r.distance<=1350));
  assert.ok(planned.every((r,i)=>i===0||
    planned[i-1].distance<=r.distance));
});
test("Include both roads touching opposite sides of a real border",()=>{
  const roads=[
    {id:"left",p:[[810,0],[910,0]]},
    {id:"right",p:[[900,-20],[900,20]]},
    {id:"far",p:[[4100,0],[4200,0]]}
  ];
  const index=createRegionRoadIndex(roads);
  assert.deepEqual(index.select(0,0).map(r=>r.id),["left","right"]);
  assert.deepEqual(index.select(1,0).map(r=>r.id),["left","right"]);
  assert.deepEqual(index.select(4,0).map(r=>r.id),["far"]);
  const span={id:"long",p:[[-2000,200],[2000,200]]};
  assert.deepEqual(createRegionRoadIndex([span]).select(0,0),[span],
    "Segment without an internal vertex may still cross a region");
});
test("Clipping a flat triangle in two adjacent regions preserves exact area",()=>{
  const tri=[[850,10,20],[910,10,20],[880,10,90]];
  const left=clip3DTriangle(tri,regionBounds(0,0));
  const right=clip3DTriangle(tri,regionBounds(1,0));
  assert.ok(left.length>0&&right.length>0);
  const sum=[...left,...right].reduce((n,t)=>n+area(t),0);
  assert.ok(near(sum,area(tri)),"Neighboring clips must conserve area");
  assert.ok(left.every(t=>t.every(p=>p[0]<=880+1e-8)));
  assert.ok(right.every(t=>t.every(p=>p[0]>=880-1e-8)));
  const border=[...left,...right].flat().filter(v=>near(v[0],880));
  assert.ok(border.length>=4);
  assert.ok(border.every(p=>near(p[1],10)));
});
test("Clipped triangles interpolate a sloping road's Y at shared boundaries",()=>{
  const h=(x,z)=>15+x*.025-z*.014;
  const tri=[[850,h(850,35),35],[915,h(915,35),35],
    [895,h(895,87),87]];
  const halves=[
    ...clip3DTriangle(tri,regionBounds(0,0)),
    ...clip3DTriangle(tri,regionBounds(1,0))
  ];
  assert.ok(halves.length>=3);
  for(const p of halves.flat()){
    assert.ok(near(p[1],h(p[0],p[2])));
    assert.ok(Number.isFinite(p[1]));
  }
});
test("Region clipping removes triangles entirely outside and degenerates",()=>{
  const tri=[[10000,0,10000],[10050,0,10000],[10000,0,10050]];
  assert.deepEqual(clip3DTriangle(tri,regionBounds(0,0)),[]);
  const zero=[[100,5,100],[100,5,100],[100,5,100]];
  assert.deepEqual(clip3DTriangle(zero,regionBounds(0,0)),[]);
});
test("Clipping an entire mesh keeps non-indexed 9-float triangle format",()=>{
  const bounds={minX:0,maxX:10,minZ:0,maxZ:10};
  const buf=[
    -5,2,5, 5,2,5, 0,2,15,
    3,6,3, 6,6,3, 3,6,6,
    50,9,50, 55,9,50, 50,9,55
  ];
  const output=clipMeshBufferToRegion(buf,bounds);
  assert.equal(output.length%9,0);
  assert.ok(output.length>=18);
  for(let i=0;i<output.length;i+=3){
    assert.ok(output[i]>=0&&output[i]<=10);
    assert.ok(output[i+2]>=0&&output[i+2]<=10);
  }
  assert.ok(output.some((v,i)=>i%3===1&&v===6));
  assert.ok(output.every(Number.isFinite));
});
test("Real Grajaú centerline needs only a fraction of 4,777 ways at spawn",()=>{
  const map=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=map.roads;
  assert.ok(roads.length>=4700);
  const planner=createRegionRoadIndex(roads);
  const start=performance.now();
  const near=planner.select(0,0);
  const ms=performance.now()-start;
  assert.ok(near.length>10);
  assert.ok(near.length<roads.length*.8,
    "WorldGen first region must not process the entire Grajaú");
  const ordered=plannedRegions(0,0,{radius:1260});
  assert.ok(ordered.length<25);
  assert.ok(ms<1200);
  console.log("[buzun-region-stream-plan]",JSON.stringify({
    totalWays:roads.length,initialWays:near.length,
    initialFraction:+(near.length/roads.length).toFixed(3),
    plannedNeighborRegions:ordered.length,
    selectionMs:+ms.toFixed(2)}));
});

test("Every newly assembled region receives visibility rules BEFORE it is shown",()=>{
  const meshes=[
    {visible:true,kind:"asphalt"},
    {visible:true,kind:"tactile"},
    {visible:true,kind:"curb"}
  ];
  const scenery={
    lodStatistics:{updates:0,visibleDrawables:0},
    updateVisibility(x,z){
      assert.equal(x,5);assert.equal(z,-9);
      // Simulated distant region: road body remains; small decorations
      // must not render during idle population of the standing screen.
      meshes[0].visible=true;
      meshes[1].visible=false;
      meshes[2].visible=false;
      this.lodStatistics.updates++;
      this.lodStatistics.visibleDrawables=1;
    }
  };
  const stats=activateLoadedRoadRegion(scenery,5,-9);
  assert.deepEqual(meshes.map(x=>x.visible),[true,false,false]);
  assert.equal(stats.updates,1);
  assert.equal(stats.visibleDrawables,1);
  assert.throws(()=>activateLoadedRoadRegion({lodStatistics:{}},0,0));
});
