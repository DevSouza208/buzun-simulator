import test from "node:test";
import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {runRoadsideJob} from "../src/worldgen-roadside-job.js";

test("Real ESM roadside Worker processes crossing and returns four transferred streams",{
  timeout:20000
},async()=>{
  const asphalt=[{id:1,t:"residential",widthMeters:8,layer:0,
    a:[0,0],b:[30,0],h0:20,h1:20,
    quad:[[0,20.072,-4],[30,20.072,-4],
      [30,20.072,4],[0,20.072,4]]}];
  const walk=[];
  for(const side of [-1,1]){
    const d0=side*4,d1=side*5.7;
    walk.push({id:1,t:"residential",widthMeters:8,layer:0,
      a:[0,0],b:[30,0],h0:20,h1:20,curbTop:.18,
      quad:[[0,d0],[30,d0],[30,d1],[0,d1]]});
  }
  const options={rampSites:[{id:"test",roadId:1,
    point:[15,0],axis:[1,0],normal:[0,1],
    widthMeters:8,sidewalkMeters:1.7}],
    junctions:[],bevelCurbs:true,
    tactileOptions:{countAcross:3,rows:1}};
  const expected=runRoadsideJob(asphalt,walk,options);
  const worker=new Worker(new URL("../src/worldgen-roadside.worker.js",
    import.meta.url),{type:"module"});
  const run=payload=>new Promise((resolve,reject)=>{
    worker.once("message",resolve);
    worker.once("error",reject);
    worker.postMessage(payload);
  });
  try{
    const result=await run({id:92,
      asphaltPatches:asphalt,walkPatches:walk,options});
    assert.equal(result.id,92);
    assert.deepEqual(result.stats,expected.stats);
    for(const kind of ["walk","median","curb","tactile"]){
      assert.ok(result.geometry[kind] instanceof Float64Array);
      assert.deepEqual([...result.geometry[kind]],
        [...expected.geometry[kind]]);
    }
    assert.ok(result.geometry.walk.length>0);
    assert.ok(result.geometry.curb.length>0);
    assert.ok(result.geometry.tactile.length>0);
    const invalid=await run({id:93,
      asphaltPatches:null,walkPatches:[],options:{}});
    assert.equal(invalid.id,93);
    assert.equal(typeof invalid.error,"string");
  }finally{
    await worker.terminate();
  }
});
