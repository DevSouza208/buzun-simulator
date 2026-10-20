import test from "node:test";
import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {runAsphaltJob} from "../src/worldgen-asphalt-job.js";

const quad=(id,x,z)=>({
  id,t:"residential",widthMeters:8,layer:0,
  a:[x,z],b:[x+30,z],h0:12,h1:12,
  quad:[[x,12.072,z-4],[x+30,12.072,z-4],
    [x+30,12.072,z+4],[x,12.072,z+4]]
});
test("Real worker thread computes and transfers same polygon mesh",{
  timeout:12000
},async()=>{
  const worker=new Worker(new URL("../src/worldgen-asphalt.worker.js",
    import.meta.url),{type:"module"});
  const request=input=>new Promise((resolve,reject)=>{
    worker.once("message",resolve);
    worker.once("error",reject);
    worker.postMessage(input);
  });
  try{
    const patches=[
      quad(1,-20,-15),quad(2,-5,-15),quad(3,250,30)
    ];
    const expected=runAsphaltJob(patches);
    const response=await request({id:123,patches});
    assert.equal(response.id,123);
    assert.equal(response.error,undefined);
    assert.ok(response.positions instanceof Float64Array);
    assert.deepEqual([...response.positions],[...expected.positions]);
    assert.deepEqual(response.stats,expected.stats);
    assert.equal(response.positions.byteLength,
      expected.positions.byteLength);
    const invalid=await request({id:124,patches:"invalid"});
    assert.equal(invalid.id,124);
    assert.equal(typeof invalid.error,"string");
  }finally{
    await worker.terminate();
  }
});
