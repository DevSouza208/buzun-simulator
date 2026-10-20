import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runAsphaltJob,replayAsphaltTriangles}
  from "../src/worldgen-asphalt-job.js";
import {startAsphaltWorkerJob}
  from "../src/worldgen-asphalt-client.js";
import {unionAsphaltPatches} from "../src/asphalt-union.js";
import {createCooperativeRunner}
  from "../src/worldgen-cooperative.js";

const quad=(id,x,z,height=11)=>({
  id,t:id%2?"primary":"residential",layer:0,
  widthMeters:8,a:[x,z],b:[x+20,z],h0:height,h1:height,
  quad:[[x,height+.072,z-4],[x+20,height+.072,z-4],
    [x+20,height+.072,z+4],[x,height+.072,z+4]]
});
const flatten=triangle=>triangle.flat();

test("Worker CPU job emits byte-identical triangles and union stats",()=>{
  const patches=[quad(1,0,0),quad(2,7,2),quad(3,15,0),
    quad(4,0,0),quad(5,200,25,45)];
  const expected=[];
  const stats=unionAsphaltPatches(patches,tri=>expected.push(...flatten(tri)));
  const job=runAsphaltJob(patches);
  assert.deepEqual(job.stats,stats);
  assert.deepEqual([...job.positions],expected);
  assert.equal(job.positions.length/9,stats.outputTriangles);
  assert.ok(job.positions.every(Number.isFinite));
});
test("Replaying typed-array response with checkpoints preserves triangle order",()=>{
  const patches=Array.from({length:25},(_,i)=>
    quad(i+1,i*13,i%3*2));
  const {positions,stats}=runAsphaltJob(patches);
  const restored=[];
  const steps=replayAsphaltTriangles(positions,tri=>restored.push(...flatten(tri)),
    {batchTriangles:3});
  const result=[];
  let next=steps.next();
  while(!next.done){
    result.push(next.value);next=steps.next();
  }
  assert.deepEqual(restored,[...positions]);
  assert.equal(next.value,stats.outputTriangles);
  assert.ok(result.length>0);
  assert.ok(result.every(x=>x.stage==="asphalt_worker_replay"));
  assert.throws(()=>replayAsphaltTriangles(new Float32Array(9),
    ()=>{}).next());
  assert.throws(()=>replayAsphaltTriangles(new Float64Array(10),
    ()=>{}).next());
});

class MockWorker {
  static instances=[];
  constructor(url,options){
    assert.equal(options.type,"module");
    this.closed=false;this.payload=null;
    MockWorker.instances.push(this);
  }
  postMessage(payload){this.payload=payload;}
  terminate(){this.closed=true;}
  reply(response){
    if(!this.closed)this.onmessage?.({data:{id:this.payload.id,...response}});
  }
  fail(message="Módulo bloqueado"){
    if(!this.closed)this.onerror?.({message,preventDefault(){}});
  }
}
test("Browser worker client succeeds, transfers typed result, and releases worker",()=>{
  const patches=[quad(1,0,0),quad(2,4,0)];
  const job=startAsphaltWorkerJob(patches,{WorkerClass:MockWorker});
  assert.equal(job.status,"pending");
  const w=MockWorker.instances.at(-1);
  assert.deepEqual(w.payload.patches,patches);
  const result=runAsphaltJob(patches);
  w.reply(result);
  assert.equal(job.status,"complete");
  assert.deepEqual([...job.positions],[...result.positions]);
  assert.deepEqual(job.stats,result.stats);
  assert.equal(w.closed,true);
});
test("Unresponsive, error and unsupported workers allow identical CPU fallback",()=>{
  const patches=[quad(1,0,0)];
  assert.equal(startAsphaltWorkerJob(patches,{WorkerClass:null}),null);
  class Unavailable{constructor(){throw Error("Worker blocked");}}
  assert.equal(startAsphaltWorkerJob(patches,{WorkerClass:Unavailable}),null);
  const invalid=startAsphaltWorkerJob(patches,{WorkerClass:MockWorker});
  MockWorker.instances.at(-1).reply({positions:[1,2,3],stats:{}});
  assert.equal(invalid.status,"failed");
  const failed=startAsphaltWorkerJob(patches,{WorkerClass:MockWorker});
  MockWorker.instances.at(-1).fail("Content security policy");
  assert.equal(failed.status,"failed");
  const cancelled=startAsphaltWorkerJob(patches,{WorkerClass:MockWorker});
  const worker=MockWorker.instances.at(-1);
  cancelled.cancel();
  assert.equal(cancelled.status,"cancelled");
  assert.equal(worker.closed,true);
  const valid=runAsphaltJob(patches);
  assert.equal(valid.stats.outputTriangles,2);
});
test("Cancelling suspended generator invokes its finally block and terminates worker",()=>{
  const patch=[quad(9,100,0)];
  let closed=false;
  function* building(){
    const job=startAsphaltWorkerJob(patch,{WorkerClass:MockWorker});
    try{
      yield {stage:"asphalt_worker_wait",waiting:true};
      yield {stage:"post_worker"};
    }finally{
      job.cancel();closed=true;
    }
  }
  const runner=createCooperativeRunner(building(),{
    now:()=>0,maxSteps:20
  });
  const first=runner.advance();
  assert.equal(first.steps,1,"Waiting for worker must not burn all steps");
  assert.equal(first.progress.waiting,true);
  assert.equal(runner.stats.waitSlices,1);
  runner.cancel();
  assert.equal(closed,true);
  assert.equal(MockWorker.instances.at(-1).closed,true);
  assert.equal(runner.advance().cancelled,true);
});
test("Runner identifies individual slow blocking stage, not only complete slice",()=>{
  let elapsed=0;
  function* process(){
    elapsed+=9;yield {stage:"huge_curb_polygon"};
    elapsed+=1;yield {stage:"small_road"};
  }
  const run=createCooperativeRunner(process(),{
    now:()=>elapsed,sliceMs:6,maxSteps:6
  });
  run.advance();
  assert.equal(run.stats.slowSteps,1);
  assert.equal(run.stats.slowestStage,"huge_curb_polygon");
  assert.equal(run.stats.maxStepMs,9);
});
test("150 Grajaú OSM ways: worker-equivalent polygon union is deterministic",()=>{
  const roads=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"))
    .roads.slice(0,150);
  const patches=[];
  for(const road of roads)for(let i=1;i<road.p.length;i++){
    const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],
      dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<.2)continue;
    const nx=-dz/len,nz=dx/len,half=(road.widthMeters||7)/2,
      p=(v,d)=>[v[0]+nx*d,10.072,v[1]+nz*d];
    patches.push({id:road.id,t:road.t,widthMeters:road.widthMeters||7,
      a,b,h0:10,h1:10,layer:road.layer||0,
      quad:[p(a,-half),p(b,-half),p(b,half),p(a,half)]});
  }
  const output=[];
  const normal=unionAsphaltPatches(patches,
    tri=>output.push(...flatten(tri)));
  const background=runAsphaltJob(patches);
  assert.deepEqual(background.stats,normal);
  assert.deepEqual([...background.positions],output);
  assert.ok(output.length>5000);
  console.log("[buzun-asphalt-worker-parity]",JSON.stringify({
    osmWays:roads.length,patches:patches.length,
    finalTriangles:normal.outputTriangles,
    bytesTransferred:background.positions.byteLength
  }));
});
