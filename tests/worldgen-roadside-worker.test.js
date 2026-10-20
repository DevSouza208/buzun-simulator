import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";
import {runRoadsideJob,replayRoadsideGeometry,
  validateRoadsideGeometry} from "../src/worldgen-roadside-job.js";
import {startRoadsideWorkerJob}
  from "../src/worldgen-roadside-client.js";

const vertices=pts=>pts.flat();
function fixture(){
  const asphalt=[],walks=[];
  for(const [id,x,z] of [[1,-20,0],[2,0,0],[3,19,0],[4,0,12]]){
    const a=[x,z],b=[x+20,z],width=7,half=width/2;
    const meta={id,t:"residential",layer:0,widthMeters:width,
      a,b,h0:10,h1:10,curbTop:.18};
    asphalt.push({...meta,quad:[
      [x,10.072,z-half],[x+20,10.072,z-half],
      [x+20,10.072,z+half],[x,10.072,z+half]
    ]});
    for(const side of [-1,1]){
      const d0=side*half,d1=side*(half+1.65);
      walks.push({...meta,quad:[
        [x,z+d0],[x+20,z+d0],[x+20,z+d1],[x,z+d1]
      ]});
    }
  }
  const site={id:"demo",roadId:2,point:[8,0],
    axis:[1,0],normal:[0,1],
    widthMeters:7,sidewalkMeters:1.65};
  return {asphalt,walks,options:{
    rampSites:[site],junctions:[],bevelCurbs:true,
    tactileOptions:{countAcross:3,rows:1}
  }};
}
function baseline(asphalt,walks,options){
  const geometry={walk:[],median:[],curb:[],tactile:[]};
  const stats=composeRoadsideMeshes(asphalt,walks,(tri,patch)=>{
    geometry[patch.isMedian?"median":"walk"].push(...vertices(tri));
  },quad=>geometry.curb.push(...vertices(quad)),
  {...options,onTactile:tri=>geometry.tactile.push(...vertices(tri))});
  return {geometry,stats};
}
test("Roadside worker-computable output is EXACTLY identical across four material streams",()=>{
  const {asphalt,walks,options}=fixture();
  const ref=baseline(asphalt,walks,options);
  const job=runRoadsideJob(asphalt,walks,options);
  assert.deepEqual(job.stats,ref.stats);
  assert.equal(validateRoadsideGeometry(job.geometry),true);
  for(const key of ["walk","median","curb","tactile"])
    assert.deepEqual([...job.geometry[key]],ref.geometry[key],
      key+" must preserve exact vertices and ordering");
  assert.ok(job.geometry.walk.length>0);
  assert.ok(job.geometry.curb.length>0);
  assert.ok(job.geometry.tactile.length>0);
});
test("Median grouping remains separate and preserves original order",()=>{
  const {asphalt,walks,options}=fixture();
  walks.push({id:77,t:"residential",isMedian:true,
    a:[200,0],b:[215,0],h0:10,h1:10,layer:0,
    quad:[[200,8],[215,8],[215,11],[200,11]]});
  const ref=baseline(asphalt,walks,options);
  const job=runRoadsideJob(asphalt,walks,options);
  assert.deepEqual([...job.geometry.median],ref.geometry.median);
  assert.ok(job.geometry.median.length>0);
});
test("Material-specific replay yields and reproduces triangles and curb quads exactly",()=>{
  const {asphalt,walks,options}=fixture();
  const computed=runRoadsideJob(asphalt,walks,options);
  const replay={walk:[],median:[],curb:[],tactile:[]};
  const gen=replayRoadsideGeometry(computed.geometry,(kind,pts)=>
    replay[kind].push(...vertices(pts)),{batchPrimitives:2});
  let done=gen.next(),checkpoints=0;
  while(!done.done){checkpoints++;done=gen.next();}
  assert.ok(checkpoints>3);
  assert.ok(done.value>0);
  for(const kind of Object.keys(replay))
    assert.deepEqual(replay[kind],[...computed.geometry[kind]]);
  assert.throws(()=>replayRoadsideGeometry({
    ...computed.geometry,curb:new Float64Array(13)
  },()=>{}).next());
  assert.throws(()=>replayRoadsideGeometry(
    computed.geometry,()=>{},{batchPrimitives:0}).next());
});
class MockWorker {
  static instances=[];
  constructor(url,config){
    assert.equal(config.type,"module");
    this.closed=false;
    MockWorker.instances.push(this);
  }
  postMessage(data){this.sent=data;}
  terminate(){this.closed=true;}
  reply(data){
    if(!this.closed)this.onmessage?.({data:{id:this.sent.id,...data}});
  }
  fail(){
    if(!this.closed)this.onerror?.({message:"Worker bloqueado",
      preventDefault(){}});
  }
}
test("Roadside worker client completes, rejects malformed replies and cancels",()=>{
  const {asphalt,walks,options}=fixture();
  const job=startRoadsideWorkerJob(asphalt,walks,options,
    {WorkerClass:MockWorker});
  assert.ok(job);
  const mocked=MockWorker.instances.at(-1);
  assert.deepEqual(mocked.sent.options,options);
  assert.equal(job.status,"pending");
  const expected=runRoadsideJob(asphalt,walks,options);
  mocked.reply(expected);
  assert.equal(job.status,"complete");
  assert.deepEqual(job.stats,expected.stats);
  assert.equal(mocked.closed,true);
  const bad=startRoadsideWorkerJob(asphalt,walks,options,
    {WorkerClass:MockWorker});
  MockWorker.instances.at(-1).reply({geometry:{},stats:{}});
  assert.equal(bad.status,"failed");
  const broken=startRoadsideWorkerJob(asphalt,walks,options,
    {WorkerClass:MockWorker});
  MockWorker.instances.at(-1).fail();
  assert.equal(broken.status,"failed");
  const cancelled=startRoadsideWorkerJob(asphalt,walks,options,
    {WorkerClass:MockWorker});
  const worker=MockWorker.instances.at(-1);
  cancelled.cancel();
  assert.equal(cancelled.status,"cancelled");
  assert.equal(worker.closed,true);
  assert.equal(startRoadsideWorkerJob(asphalt,walks,options,
    {WorkerClass:null}),null);
  class Unsupported{constructor(){throw Error("blocked");}}
  assert.equal(startRoadsideWorkerJob(asphalt,walks,options,
    {WorkerClass:Unsupported}),null);
});
test("Real Grajaú 100-road sample produces same curb/sidewalk/tactile buffers",()=>{
  const map=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=map.roads.slice(0,100);
  const asphalt=[],walks=[];
  for(const road of roads)for(let i=1;i<road.p.length;i++){
    const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],
      dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.05)continue;
    const n=[-dz/length,dx/length],half=(road.widthMeters||7)/2;
    const p=(v,d)=>[v[0]+n[0]*d,v[1]+n[1]*d];
    const common={id:road.id,t:road.t,layer:road.layer||0,
      a,b,widthMeters:road.widthMeters||7,h0:10,h1:10,
      curbTop:.18};
    asphalt.push({...common,quad:[
      [...p(a,-half).slice(0,1),10.072,p(a,-half)[1]],
      [...p(b,-half).slice(0,1),10.072,p(b,-half)[1]],
      [...p(b,half).slice(0,1),10.072,p(b,half)[1]],
      [...p(a,half).slice(0,1),10.072,p(a,half)[1]]
    ]});
    for(const side of [-1,1])
      walks.push({...common,quad:[
        p(a,side*half),p(b,side*half),
        p(b,side*(half+1.65)),p(a,side*(half+1.65))
      ]});
  }
  const options={junctions:[],rampSites:[],bevelCurbs:true};
  const ref=baseline(asphalt,walks,options);
  const job=runRoadsideJob(asphalt,walks,options);
  assert.deepEqual(job.stats,ref.stats);
  for(const key of Object.keys(ref.geometry))
    assert.deepEqual([...job.geometry[key]],ref.geometry[key]);
  assert.ok(job.geometry.walk.length>900);
  assert.ok(job.geometry.curb.length>200);
  console.log("[buzun-roadside-worker-parity]",JSON.stringify({
    roads:roads.length,asphalt:asphalt.length,
    sidewalkTriangles:job.geometry.walk.length/9,
    curbQuads:job.geometry.curb.length/12,
    transferredBytes:Object.values(job.geometry).reduce(
      (sum,a)=>sum+a.byteLength,0)
  }));
});
