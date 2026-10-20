import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderProfile} from "../src/worldgen-render-profile.js";
import {plannedRegions,prioritizeDriveRegions,regionAt,
  regionKey,REGION_METRES} from "../src/worldgen-region-stream.js";
import {roadDetailVisible,distanceToRoadBounds}
  from "../src/worldgen-diagnostics.js";

test("Camera frustum culling and shorter render radius are opt-in to experimental stream",()=>{
  const stable=renderProfile();
  const streaming=renderProfile({minX:0,maxX:880,minZ:0,maxZ:880});
  assert.equal(stable.cameraFrustumCulling,false);
  assert.equal(stable.visualRadiusMetres,850);
  assert.equal(streaming.cameraFrustumCulling,true);
  assert.equal(streaming.visualRadiusMetres,670);
  assert.ok(streaming.visualRadiusMetres>REGION_METRES/2);
  assert.equal(roadDetailVisible("asphalt",680,{
    radius:streaming.visualRadiusMetres,hysteresis:0}),false);
  assert.equal(roadDetailVisible("asphalt",680,{
    radius:stable.visualRadiusMetres,hysteresis:0}),true);
});
test("Predicted movement ranks current region first and front before similarly distant rear",()=>{
  const p=prioritizeDriveRegions(440,440,{radius:1300,heading:[1,0]});
  assert.equal(p[0].key,"0:0");
  assert.ok(p.find(x=>x.key==="1:0"));
  assert.ok(p.find(x=>x.key==="-1:0"));
  assert.ok(p.findIndex(x=>x.key==="1:0")<
    p.findIndex(x=>x.key==="-1:0"));
  const reverse=prioritizeDriveRegions(440,440,{radius:1300,heading:[-1,0]});
  assert.ok(reverse.findIndex(x=>x.key==="-1:0")<
    reverse.findIndex(x=>x.key==="1:0"));
});
test("Directional prefetch reprioritizes SAME region set, never drops sideways or behind",()=>{
  const a=plannedRegions(-430,15,{radius:1260});
  const b=prioritizeDriveRegions(-430,15,{
    radius:1260,heading:[0,-42]});
  const keys=regions=>regions.map(r=>r.key).sort();
  assert.deepEqual(keys(a),keys(b));
  assert.equal(new Set(keys(b)).size,b.length);
  const current=regionAt(-430,15);
  assert.equal(b[0].key,regionKey(current.x,current.z));
  assert.ok(b.every(entry=>entry.distance<=1260));
});
test("Stationary heading preserves deterministic distance priority",()=>{
  const base=plannedRegions(300,-20,{radius:1300});
  const zero=prioritizeDriveRegions(300,-20,{
    radius:1300,heading:[0,0]});
  assert.deepEqual(zero.map(r=>r.key),base.map(r=>r.key));
});
test("Regions remain available approaching an exact OSM tile boundary",()=>{
  const left=prioritizeDriveRegions(879.95,72,{
    radius:1260,heading:[1,0]});
  const right=prioritizeDriveRegions(880.05,72,{
    radius:1260,heading:[1,0]});
  assert.equal(left[0].key,"0:0");
  assert.equal(right[0].key,"1:0");
  assert.ok(left.some(r=>r.key==="1:0"));
  assert.ok(right.some(r=>r.key==="0:0"));
  assert.equal(distanceToRoadBounds(879.95,72,{
    minX:880,maxX:1760,minZ:0,maxZ:880}),0);
});
test("Real Grajaú route can walk across different stream regions without losing current-cell priority",()=>{
  const raw=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  assert.ok(raw.roads.length>4700);
  const path=raw.roads.filter(r=>r.p.length>=3).slice(0,220);
  let samples=0;
  const begin=performance.now();
  for(const road of path){
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i];
      const heading=[b[0]-a[0],b[1]-a[1]];
      if(Math.hypot(...heading)<1)continue;
      const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
      const list=prioritizeDriveRegions(x,z,{
        heading,radius:1260});
      const current=regionAt(x,z);
      assert.equal(list[0].key,regionKey(current.x,current.z));
      assert.ok(list.length<=25&&list.length>=1);
      assert.ok(list.some(r=>r.key===regionKey(current.x,current.z)));
      samples++;
    }
  }
  assert.ok(samples>400);
  assert.ok(performance.now()-begin<1500);
  console.log("[buzun-drive-prefetch]",JSON.stringify({
    ways:raw.roads.length,movementSamples:samples,
    elapsedMs:+(performance.now()-begin).toFixed(2)
  }));
});
