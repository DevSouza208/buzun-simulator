import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {adjacentRoadRegions,roadRegionAhead,
  resolveRegionalHeight,resolveRegionalSurface,prioritizeBoundaryQueue,
  BOUNDARY_HEIGHT_MARGIN,BOUNDARY_PREFETCH_METRES}
  from "../src/worldgen-boundary-height.js";
import {regionAt,regionKey,REGION_METRES}
  from "../src/worldgen-region-stream.js";
import {createRegionGeometryCache}
  from "../src/worldgen-region-cache.js";
import {createRoadSurfaceIndex} from "../src/draped-road.js";

const near=(a,b,e=.00001)=>Math.abs(a-b)<=e;
const surface=(id,height,{
  layer=0,halfWidth=4,walk=1.7,distance=0
}={})=>({
  surface:{sample(){return {
    height,roadId:id,layer,halfWidth,walk,distance,
    curbTop:.18
  };}},
  filletSurface:{sample(){return null;}},
  rampSurface:{heightAt(){return null;}}
});
const pair=(a,b,keyA="0:0",keyB="1:0")=>(x,z)=>{
  const models=new Map([[keyA,a],[keyB,b]]);
  return models.get(regionKey(x,z));
};
test("9m border halo covers owner, adjacent cells, corners and negative coordinates",()=>{
  assert.equal(BOUNDARY_HEIGHT_MARGIN,9);
  assert.deepEqual(adjacentRoadRegions(300,400).map(x=>x.key),["0:0"]);
  assert.deepEqual(adjacentRoadRegions(879,440).map(x=>x.key),
    ["0:0","1:0"]);
  assert.deepEqual(adjacentRoadRegions(880,440).map(x=>x.key),
    ["1:0","0:0"]);
  assert.deepEqual(adjacentRoadRegions(879,-.5).map(x=>x.key),
    ["0:-1","0:0","1:-1","1:0"]);
  const neg=adjacentRoadRegions(-.001,20).map(x=>x.key);
  assert.deepEqual(neg,["-1:0","0:0"]);
  const keys=adjacentRoadRegions(879,879).map(x=>x.key);
  assert.deepEqual(keys,["0:0","0:1","1:0","1:1"]);
});
test("Missing owner uses completed neighboring OSM height, not DEM guess",()=>{
  const get=pair(surface("route",40),null);
  const reading=resolveRegionalHeight(880.25,300,get);
  assert.ok(reading);
  assert.equal(reading.height,40.072);
  assert.equal(reading.fromNeighbor,true);
  assert.equal(reading.kind,"asphalt");
  assert.equal(resolveRegionalHeight(900,300,get),null,
    "No distant borrowing beyond boundary margin");
  const surf=resolveRegionalSurface(880.25,300,get);
  assert.equal(surf.roadId,"route");
});
test("Both completed sides blend small grades of the SAME asphalt ID continuously",()=>{
  const get=pair(surface("same",30),surface("same",30.24));
  let blends=0;
  const left=resolveRegionalHeight(879.999,240,get,{
    onBlend:()=>blends++
  });
  const right=resolveRegionalHeight(880.001,240,get,{
    onBlend:()=>blends++
  });
  assert.ok(near(left.height,right.height,.001));
  assert.ok(left.blended&&right.blended);
  assert.ok(left.height>30.072);
  assert.ok(left.height<30.312);
  assert.equal(blends,2);
  const outside=resolveRegionalHeight(900,240,get);
  assert.ok(near(outside.height,30.312,1e-10));
});
test("Bridge and a different OSM way never get averaged across borders",()=>{
  for(const other of [
    surface("different",22.2),
    surface("same",22.2,{layer:1}),
    surface("same",24.3)
  ]){
    const get=pair(surface("same",22.1),other);
    const left=resolveRegionalHeight(879.99,240,get);
    const right=resolveRegionalHeight(880.01,240,get);
    assert.equal(left.blended,false);
    assert.equal(right.blended,false);
    assert.ok(near(left.height,22.172));
    assert.ok(near(right.height,other.surface.sample().height+.072));
  }
});
test("Corner and ramp heights retain their original precedence",()=>{
  const rampScene=surface("r",15);
  rampScene.surface.sample=()=>({
    roadId:"r",height:15,halfWidth:4,walk:1.7,distance:4.5,
    curbTop:.18,layer:0
  });
  rampScene.rampSurface.heightAt=()=>15.09;
  const hit=resolveRegionalHeight(879,150,()=>rampScene);
  assert.equal(hit.kind,"ramp");
  assert.equal(hit.height,15.09);
  const cornerScene=surface("r",15);
  cornerScene.surface.sample=()=>({
    roadId:"r",height:15,halfWidth:4,walk:1.7,distance:5.1,
    layer:0
  });
  cornerScene.filletSurface.sample=()=>15.077;
  const corner=resolveRegionalHeight(879,150,()=>cornerScene);
  assert.equal(corner.kind,"corner");
  assert.equal(corner.height,15.077);
});
test("Roadside surface samples do not jump to a remote bridge or offroad index",()=>{
  const get=pair(surface("road",20,{distance:2}),
    surface("road",26,{distance:500}));
  const road=resolveRegionalSurface(880.1,200,get);
  assert.ok(road);
  assert.equal(road.height,20);
  assert.equal(resolveRegionalSurface(900,200,get),null);
});
test("Directional lookahead recognizes positive, negative and diagonal borders",()=>{
  assert.equal(BOUNDARY_PREFETCH_METRES,130);
  assert.deepEqual(roadRegionAhead(800,300,[1,0]),{
    x:1,z:0,key:"1:0",distance:80
  });
  assert.deepEqual(roadRegionAhead(900,300,[-1,0]),{
    x:0,z:0,key:"0:0",distance:20
  });
  const negative=roadRegionAhead(-800,200,[-2,0]);
  assert.equal(negative.key,"-2:0");
  assert.ok(near(negative.distance,80));
  assert.equal(roadRegionAhead(700,200,[1,0]),null);
  assert.equal(roadRegionAhead(810,200,[0,0]),null);
  const diagonal=roadRegionAhead(800,800,[1,1]);
  assert.equal(diagonal.key,"1:1");
  assert.ok(near(diagonal.distance,Math.sqrt(2)*80));
});
test("An OSM segment crossing an actual Grajaú 880m boundary has continuous sampled grade",()=>{
  const json=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  let sample=null;
  for(const road of json.roads){
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i];
      const c0=regionAt(...a),c1=regionAt(...b);
      if(c0.x===c1.x||c0.z!==c1.z)continue;
      const border=(Math.max(c0.x,c1.x))*REGION_METRES,
        t=(border-a[0])/(b[0]-a[0]),
        crossZ=a[1]+(b[1]-a[1])*t;
      if(t>.1&&t<.9&&Math.abs(crossZ/880-Math.round(crossZ/880))>.06){
        sample={road,a,b,border,crossZ};break;
      }
    }
    if(sample)break;
  }
  assert.ok(sample,"Real OSM data must include a line crossing a regional seam");
  const {road,a,b,border,crossZ}=sample;
  const model=(offset)=>{
    const natural=p=>130+p[0]*.016+p[1]*.009+offset;
    return {
      surface:createRoadSurfaceIndex([{
        a,b,h0:natural(a),h1:natural(b),
        halfWidth:(road.widthMeters||7)/2,
        roadId:road.id,walk:1.65,curbTop:.18,layer:road.layer||0
      }]),
      filletSurface:{sample(){return null;}},
      rampSurface:{heightAt(){return null;}}
    };
  };
  const left=regionAt(border-.001,crossZ),
    right=regionAt(border+.001,crossZ);
  assert.notEqual(left.x,right.x);
  const available=new Map([
    [regionKey(left.x,left.z),model(0)],
    [regionKey(right.x,right.z),model(.13)]
  ]);
  const resolver=(rx,rz)=>available.get(regionKey(rx,rz));
  const h0=resolveRegionalHeight(border-.001,crossZ,resolver);
  const h1=resolveRegionalHeight(border+.001,crossZ,resolver);
  assert.ok(h0?.blended&&h1?.blended);
  assert.ok(Math.abs(h0.height-h1.height)<.004,
    "Crossing border must not cause 13cm collision jolt");
  assert.ok(Number.isFinite(h0.height));
  console.log("[buzun-border-road]",JSON.stringify({
    roadId:road.id,border,crossZ:+crossZ.toFixed(1),
    deltaMetres:+Math.abs(h0.height-h1.height).toFixed(6)
  }));
});
test("Sampling a parked region through peek does not resurrect it or update LRU order",()=>{
  const cache=createRegionGeometryCache({maxEntries:2,maxBytes:10000});
  const road=surface("cached",42);
  const rec={scenery:{...road,geometryStatistics:{gpuBytes:150}}};
  cache.put("0:0",rec);
  assert.equal(cache.peek("0:0"),rec);
  assert.deepEqual(cache.keys(),["0:0"]);
  const hit=resolveRegionalHeight(880.2,300,(x,z)=>
    cache.peek(regionKey(x,z))?.scenery);
  assert.equal(hit.height,42.072);
  assert.equal(hit.fromNeighbor,true);
  assert.equal(cache.stats.hits,0);
  assert.equal(cache.stats.entries,1);
});

test("Directional boundary queue is stable, makes urgent next cell FIRST, and does not duplicate",()=>{
  const queue=[{key:"1:1"},{key:"0:1"},{key:"1:0"}];
  const ahead={key:"1:0",x:1,z:0};
  const sorted=prioritizeBoundaryQueue(queue,ahead);
  assert.deepEqual(sorted.map(r=>r.key),["1:0","1:1","0:1"]);
  assert.deepEqual(queue.map(r=>r.key),["1:1","0:1","1:0"]);
  assert.equal(new Set(sorted.map(r=>r.key)).size,3);
  const extra={key:"-1:0",x:-1,z:0};
  assert.deepEqual(prioritizeBoundaryQueue(queue,extra).map(r=>r.key),
    ["-1:0","1:1","0:1","1:0"]);
  assert.deepEqual(prioritizeBoundaryQueue(queue,extra,
    key=>key==="-1:0"),queue);
  assert.deepEqual(prioritizeBoundaryQueue(queue,null),queue);
});
