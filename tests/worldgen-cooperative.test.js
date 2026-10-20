import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {unionAsphaltPatches,unionAsphaltSteps}
  from "../src/asphalt-union.js";
import {composeRoadsideMeshes,composeRoadsideSteps}
  from "../src/sidewalk-union.js";
import {createCooperativeRunner}
  from "../src/worldgen-cooperative.js";
import {makeWorldgenProfiler} from "../src/worldgen-diagnostics.js";

function finish(iterator){
  let step=iterator.next(),yields=0,stages=new Set();
  while(!step.done){
    yields++;
    stages.add(step.value?.stage);
    step=iterator.next();
  }
  return {value:step.value,yields,stages};
}
const makePatch=(id,x,z)=>({
  id,t:"residential",widthMeters:8,layer:0,
  a:[x,z],b:[x+8,z],h0:15,h1:15,
  quad:[[x,15.072,z-4],[x+8,15.072,z-4],
    [x+8,15.072,z+4],[x,15.072,z+4]]
});
test("Stepwise asphalt union has EXACT same emitted polygon order, height and statistics",()=>{
  const patches=[
    makePatch(1,0,0),makePatch(2,3,1),
    makePatch(3,4,-2),makePatch(4,80,10)
  ];
  const sync=[],async=[];
  const base=unionAsphaltPatches(patches,(triangle,patch)=>
    sync.push([patch.id,triangle]));
  const resumed=finish(unionAsphaltSteps(patches,(triangle,patch)=>
    async.push([patch.id,triangle]),{batchSize:1}));
  assert.ok(resumed.yields>=6);
  assert.equal(resumed.stages.has("asphalt"),true);
  assert.deepEqual(resumed.value,base);
  assert.deepEqual(async,sync);
});
test("Stepwise curb and sidewalk composition reproduces old triangles exactly",()=>{
  const asphalt=[makePatch(1,0,0),makePatch(2,6,0)];
  const sidewalks=[];
  for(let i=0;i<8;i++){
    const x=i*5;
    sidewalks.push({
      id:i+30,t:"residential",layer:0,widthMeters:8,
      a:[x,0],b:[x+5,0],h0:15,h1:15,curbTop:.18,
      quad:[[x,4],[x+5,4],[x+5,6],[x,6]]
    });
  }
  const leftWalk=[],leftCurb=[],rightWalk=[],rightCurb=[];
  const options={batchSize:1};
  const base=composeRoadsideMeshes(asphalt,sidewalks,
    (triangle,patch)=>leftWalk.push([patch.id,triangle]),
    (triangle,patch)=>leftCurb.push([patch.id,triangle]),options);
  const result=finish(composeRoadsideSteps(asphalt,sidewalks,
    (triangle,patch)=>rightWalk.push([patch.id,triangle]),
    (triangle,patch)=>rightCurb.push([patch.id,triangle]),options));
  assert.ok(result.yields>8);
  assert.equal(result.stages.has("sidewalk"),true);
  assert.equal(result.stages.has("curb"),true);
  assert.deepEqual(result.value,base);
  assert.deepEqual(rightWalk,leftWalk);
  assert.deepEqual(rightCurb,leftCurb);
});
test("Cooperative runner returns control at budget and resumes without duplicate work",()=>{
  let now=0,executed=0;
  function* work(){
    for(let i=0;i<25;i++){
      executed++;
      now+=2;
      yield {stage:"road",done:i+1,total:25};
    }
    return {roads:25};
  }
  const runner=createCooperativeRunner(work(),{
    now:()=>now,sliceMs:6,maxSteps:20
  });
  const first=runner.advance();
  assert.equal(first.done,false);
  assert.equal(first.steps,3);
  assert.equal(executed,3);
  assert.ok(first.elapsed<=6);
  let calls=1,last=first;
  while(!last.done){
    last=runner.advance();calls++;
  }
  assert.deepEqual(last.value,{roads:25});
  assert.equal(executed,25);
  assert.ok(runner.stats.slices>1);
  assert.equal(runner.stats.yields,25);
  assert.equal(runner.advance().done,true);
  assert.equal(executed,25);
});
test("Cancel pending generator and reject scheduling invalid work",()=>{
  const calls=[];
  function* work(){
    calls.push("one");yield {stage:"x"};
    calls.push("two");yield {stage:"x"};
  }
  const run=createCooperativeRunner(work(),{
    maxSteps:1,sliceMs:5,now:()=>0
  });
  assert.equal(run.advance().done,false);
  run.cancel();
  assert.equal(run.advance().cancelled,true);
  assert.deepEqual(calls,["one"]);
  assert.throws(()=>createCooperativeRunner(null));
  assert.throws(()=>createCooperativeRunner(work(),{sliceMs:0}));
});
test("Paused profiler correctly excludes time while browser draws frames",()=>{
  let clock=0;
  const p=makeWorldgenProfiler(()=>clock);
  clock=30;p.mark("prepare");
  clock=40;p.pause();
  clock=1040;p.resume();
  clock=1060;p.mark("asphalt");
  clock=2060;p.pause();
  clock=5060;p.resume();
  clock=5080;
  const report=p.report();
  assert.equal(report.stagesMs.prepare,30);
  assert.equal(report.stagesMs.asphalt,30);
  assert.equal(report.totalMs,1080);
});
test("Real Grajaú 250-way geometry matches exactly when union and curbs are sliced",()=>{
  const all=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8")).roads;
  const selected=all.slice(0,250);
  const asphalt=[],walk=[];
  for(const road of selected){
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i],
        len=Math.hypot(a[0]-b[0],a[1]-b[1]);
      if(len<.5)continue;
      const n=[-(b[1]-a[1])/len,(b[0]-a[0])/len],
        half=(road.widthMeters||7)/2;
      const p=(v,d,y)=>[v[0]+n[0]*d,y,v[1]+n[1]*d],
        q=(v,d)=>[v[0]+n[0]*d,v[1]+n[1]*d];
      const common={id:road.id,t:road.t,layer:road.layer||0,
        a,b,h0:10,h1:10,widthMeters:road.widthMeters||7};
      asphalt.push({...common,quad:[
        p(a,-half,10.072),p(b,-half,10.072),
        p(b,half,10.072),p(a,half,10.072)]});
      for(const side of [-1,1])
        walk.push({...common,curbTop:.18,
          quad:[q(a,side*half),q(b,side*half),
            q(b,side*(half+1.6)),q(a,side*(half+1.6))]});
    }
  }
  let baseline=0,sliced=0;
  const a=unionAsphaltPatches(asphalt,()=>baseline++);
  const result=finish(unionAsphaltSteps(asphalt,()=>sliced++,{
    batchSize:9
  }));
  assert.deepEqual(result.value,a);
  assert.equal(sliced,baseline);
  assert.ok(result.yields>=30);
  const save=composeRoadsideMeshes(asphalt,walk,()=>{},()=>{});
  const incremental=finish(composeRoadsideSteps(
    asphalt,walk,()=>{},()=>{},{batchSize:11}));
  assert.deepEqual(incremental.value,save);
  assert.ok(incremental.yields>=25);
  console.log("[buzun-cooperative-equivalence]",JSON.stringify({
    originalWays:selected.length,asphaltTriangles:baseline,
    asphaltSteps:result.yields,sidewalkSteps:incremental.yields
  }));
});
