import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sealMeshSeams} from "../src/mesh-seams.js";
import {findSeparatedCarriagewayMedians} from "../src/median-islands.js";
import {unionAsphaltPatches} from "../src/asphalt-union.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";

const near=(a,b,eps=1e-5)=>Math.abs(a-b)<eps;
test("Vertices at independent clipped triangles are snapped to one millimetre grid",()=>{
  const buffer=[
    0.00021,10,0, 10.00024,10,0, 0,10,5,
    .00031,10.02,0, 10.00021,10.02,0, 0,10.02,-5
  ];
  const stats=sealMeshSeams(buffer);
  assert.equal(stats.vertices,6);
  assert.ok(stats.sharedVertices>=2);
  assert.ok(near(buffer[0],buffer[9]));
  assert.ok(near(buffer[3],buffer[12]));
  assert.ok(near(buffer[1],buffer[10]));
  assert.equal(stats.degenerateTriangles,0);
});
test("Bridge heights stay separate and intentional curb bevels keep height tiers",()=>{
  const b=[0,10,0, 10,10,0, 0,10,3,
    0,30,0, 10,30,0, 0,30,-3];
  const s=sealMeshSeams(b);
  assert.equal(b[1],10);
  assert.equal(b[10],30);
  assert.ok(s.independentLevels>0);
  const curb=[0,.04,0, 0,.13,0, 3,.13,0,
    0,.13,0, 0,.18,0, 3,.18,0];
  sealMeshSeams(curb,{heightTolerance:1e-6});
  assert.equal(curb[1],.04);
  assert.equal(curb[4],.13);
  assert.equal(curb[13],.18);
});
test("All original OSM way segments must union even if duplicated under same ID",()=>{
  const quad=(offset=0)=>({id:1234,t:"residential",
    widthMeters:8,layer:0,a:[0,offset],b:[20,offset],
    h0:0,h1:0,quad:[[0,.072,offset-4],[20,.072,offset-4],
      [20,.072,offset+4],[0,.072,offset+4]]});
  const triangles=[];
  const res=unionAsphaltPatches([quad(0),quad(0)],tri=>triangles.push(tri));
  const area=triangles.reduce((sum,tri)=>{
    const a=tri[0],b=tri[1],c=tri[2];
    return sum+Math.abs((b[0]-a[0])*(c[2]-a[2])-
      (b[2]-a[2])*(c[0]-a[0]))/2;
  },0);
  assert.ok(near(area,160));
  assert.ok(res.hiddenTriangles>=2);
});
const east={id:1,t:"primary",o:"yes",widthMeters:8,
  layer:0,p:[[0,0],[80,0]]};
const west={id:2,t:"primary",o:"yes",widthMeters:8,
  layer:0,p:[[80,13],[0,13]]};
test("Two separated, opposite-direction one-way carriageways produce a central green median",()=>{
  const result=findSeparatedCarriagewayMedians([east,west],()=>10);
  assert.ok(result.patches.length>=1);
  const p=result.patches[0];
  assert.equal(p.isMedian,true);
  assert.equal(p.curbTop,.24);
  assert.ok(p.quad.every(([x,z])=>x>=0&&x<=80&&z>=3.99&&z<=9.01));
  assert.ok(p.gapMeters>=4.9);
});
test("No fake island for same-direction, two-way, bridge crossing or intersecting strips",()=>{
  assert.equal(findSeparatedCarriagewayMedians([east,
    {...west,id:3,p:[[0,13],[80,13]]}],()=>10).patches.length,0);
  assert.equal(findSeparatedCarriagewayMedians([
    {...east,o:""},west],()=>10).patches.length,0);
  assert.equal(findSeparatedCarriagewayMedians([east,
    {...west,layer:1}],()=>10).patches.length,0);
  assert.equal(findSeparatedCarriagewayMedians([east,
    {...west,p:[[80,4],[0,4]]}],()=>10).patches.length,0);
});
test("Median passes through same asphalt/sidewalk clipping and is not laid on crossing road",()=>{
  const crossing={id:30,t:"residential",layer:0,widthMeters:6,
    a:[40,0],b:[40,13],h0:10,h1:10,
    quad:[[37,10.072,0],[43,10.072,0],[43,10.072,13],[37,10.072,13]]};
  const asphalt=[
    {...east,a:[0,0],b:[80,0],h0:10,h1:10,
      quad:[[0,10.072,-4],[80,10.072,-4],[80,10.072,4],[0,10.072,4]]},
    {...west,a:[80,13],b:[0,13],h0:10,h1:10,
      quad:[[80,10.072,9],[0,10.072,9],[0,10.072,17],[80,10.072,17]]},
    crossing
  ];
  const medians=findSeparatedCarriagewayMedians([east,west],()=>10).patches;
  const rendered=[];
  composeRoadsideMeshes(asphalt,medians,(tri,patch)=>{
    assert.equal(patch.isMedian,true);
    rendered.push(tri);
  },()=>{});
  assert.ok(rendered.length>0);
  for(const tri of rendered){
    const middle=tri.reduce((acc,p)=>[acc[0]+p[0]/3,
      acc[1]+p[2]/3],[0,0]);
    assert.ok(!(middle[0]>37+.001&&middle[0]<43-.001),
      "Median must not paint over the cross street");
  }
});
test("Full Grajaú snapshot: diagnose evidence for physical medians, never guess",()=>{
  const raw=JSON.parse(readFileSync(new URL("../public/data/grajau-city-roads.json",
    import.meta.url),"utf8"));
  const began=performance.now();
  const res=findSeparatedCarriagewayMedians(raw.roads,()=>5);
  const seconds=(performance.now()-began)/1000;
  assert.ok(raw.roads.length>4000);
  assert.ok(res.patches.length<=res.stats.oneWaySegments);
  assert.ok(res.patches.every(p=>p.isMedian&&p.gapMeters>=.85&&
    p.gapMeters<=5.5));
  assert.ok(seconds<20);
  console.log("[buzun-median-audit]",JSON.stringify({
    ...res.stats,seconds:+seconds.toFixed(3)}));
});
