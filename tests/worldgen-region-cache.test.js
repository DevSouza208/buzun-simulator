import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRegionGeometryCache,REGION_CACHE_MAX_ENTRIES,
  REGION_CACHE_MAX_BYTES} from "../src/worldgen-region-cache.js";
import {regionAt,regionKey,regionDistance}
  from "../src/worldgen-region-stream.js";

const MiB=1024*1024;
const record=(id,bytes=MiB)=>({
  x:Number(id),z:0,
  scenery:{geometryStatistics:{gpuBytes:bytes},
    tiles:[{group:{id},meshes:{
      asphalt:{geometry:{id}}
    }}],surface:{sample(x,z){return {height:10+x*.013-z*.004};}}}
});
test("Warm regional cache defaults are intentionally small",()=>{
  assert.equal(REGION_CACHE_MAX_ENTRIES,4);
  assert.equal(REGION_CACHE_MAX_BYTES,24*MiB);
  const c=createRegionGeometryCache();
  assert.equal(c.stats.entries,0);
  assert.equal(c.stats.estimatedBytes,0);
  assert.deepEqual(c.keys(),[]);
});
test("LRU cache takes detached region without altering geometry or precise grade",()=>{
  const freed=[],cache=createRegionGeometryCache({
    maxEntries:2,maxBytes:4*MiB,
    onEvict:(key,rec)=>freed.push([key,rec])
  });
  const one=record(1,MiB),two=record(2,2*MiB);
  const surface=one.scenery.surface.sample(-333,190);
  assert.equal(cache.put("1:0",one),true);
  assert.equal(cache.put("2:0",two),true);
  assert.equal(cache.stats.entries,2);
  assert.equal(cache.stats.estimatedBytes,3*MiB);
  const restored=cache.take("1:0");
  assert.equal(restored,one,"The EXACT same scene objects must be reattached");
  assert.deepEqual(restored.scenery.surface.sample(-333,190),surface);
  assert.equal(cache.stats.hits,1);
  assert.equal(cache.stats.entries,1);
  assert.deepEqual(cache.keys(),["2:0"]);
  assert.equal(freed.length,0);
});
test("Evicts least recently parked region and disposes once per entry",()=>{
  const freed=[],c=createRegionGeometryCache({
    maxEntries:2,maxBytes:8*MiB,
    onEvict:(key,rec)=>freed.push([key,rec])
  });
  const a=record(1),b=record(2),d=record(3);
  c.put("a",a);c.put("b",b);
  assert.equal(c.take("a"),a);
  c.put("a",a); // park most recently visited region
  c.put("d",d);
  assert.deepEqual(c.keys(),["a","d"]);
  assert.deepEqual(freed,[["b",b]]);
  assert.equal(c.stats.evictions,1);
  assert.equal(c.stats.hits,1);
});
test("Hard memory limit evicts before exceeding budget, oversized rejects",()=>{
  const freed=[],c=createRegionGeometryCache({
    maxEntries:9,maxBytes:5*MiB,
    onEvict:key=>freed.push(key)
  });
  const a=record(1,3*MiB),b=record(2,3*MiB);
  c.put("a",a);
  c.put("b",b);
  assert.deepEqual(c.keys(),["b"]);
  assert.ok(c.stats.estimatedBytes<=5*MiB);
  const gigantic=record(3,7*MiB);
  assert.equal(c.put("huge",gigantic),false);
  assert.equal(c.has("huge"),false);
  assert.deepEqual(freed,["a","huge"]);
  assert.equal(c.stats.rejects,1);
  assert.equal(c.stats.evictions,1);
});
test("Disabled cache disposes immediately; clearing frees ALL parked geometries",()=>{
  const released=[];
  const disabled=createRegionGeometryCache({
    maxEntries:0,onEvict:(key)=>released.push(key)
  });
  disabled.put("none",record(1));
  assert.equal(disabled.stats.entries,0);
  assert.deepEqual(released,["none"]);
  const c=createRegionGeometryCache({
    maxEntries:4,onEvict:(key)=>released.push(key)
  });
  c.put("a",record(1));c.put("b",record(2));
  c.clear();
  assert.deepEqual(released,["none","a","b"]);
  assert.equal(c.stats.estimatedBytes,0);
  assert.equal(c.stats.entries,0);
  assert.equal(c.take("a"),null);
  assert.equal(c.stats.misses,1);
  c.clear();
  assert.equal(released.length,3,"Clearing twice must not double-dispose");
});
test("Replacing a key disposes the old region, never retains two copies",()=>{
  const released=[];
  const c=createRegionGeometryCache({onEvict:(_,r)=>released.push(r)});
  const old=record(1),updated=record(2);
  c.put("same",old);
  c.put("same",updated);
  assert.deepEqual(released,[old]);
  assert.equal(c.take("same"),updated);
});
test("Memory budgets reject nonsensical records or settings",()=>{
  assert.throws(()=>createRegionGeometryCache({maxEntries:-1}));
  assert.throws(()=>createRegionGeometryCache({maxBytes:-1}));
  const cache=createRegionGeometryCache();
  assert.throws(()=>cache.put("",record(1)));
  assert.throws(()=>cache.put("broken",{scenery:{}}));
  assert.equal(cache.stats.entries,0);
});
test("Grajaú streaming: returning to a previously seen region reuses EXACT same road height model",()=>{
  const raw=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=raw.roads;
  const seen=new Map(),cache=createRegionGeometryCache({
    maxEntries:4,maxBytes:24*MiB
  });
  let builds=0,restores=0;
  // Simulated movement across real OSM way vertices and a distant trip.
  const points=roads.flatMap(way=>way.p).filter((_,i)=>i%97===0);
  const cells=[...new Set(points.map(p=>{
    const r=regionAt(...p);return regionKey(r.x,r.z);
  }))].slice(0,12);
  assert.ok(cells.length>=8);
  function visit(key){
    let value=cache.take(key);
    if(value)restores++;
    else{builds++;value=record(builds,2*MiB);}
    seen.set(key,value);
    return value;
  }
  const target=cells[7];
  const first=visit(target);
  const h=first.scenery.surface.sample(57,-90);
  // Park, leave to three nearby regions and return before the LRU cap.
  cache.put(target,seen.get(target));seen.delete(target);
  for(const key of cells.slice(0,3)){
    const r=visit(key);
    cache.put(key,r);seen.delete(key);
  }
  const after=visit(target);
  assert.equal(after,first);
  assert.deepEqual(after.scenery.surface.sample(57,-90),h);
  assert.equal(restores,1);
  assert.equal(builds,4,"Revisiting should NOT call any worldgen compositor");
  assert.ok(cache.stats.estimatedBytes<=24*MiB);
});
