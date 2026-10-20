import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {unionAsphaltPatches} from "../src/asphalt-union.js";
import {drapedSections,createRoadSurfaceIndex} from "../src/draped-road.js";

test("The saved Grajaú OSM snapshot can be unified around the Belmira corridor",()=>{
  const raw=JSON.parse(readFileSync(new URL("../public/data/grajau-city-roads.json",
    import.meta.url),"utf8"));
  assert.ok(raw.roads.length>4000);
  const routes=raw.roads.filter(road=>
    road.p?.some(([x,z])=>x>-1900&&x<1700&&z>-400&&z<900));
  assert.ok(routes.length>=15,"Must exercise real neighbouring OSM ways");
  const patches=[],surfaceSegments=[];
  for(const road of routes){
    const samples=drapedSections(road.p,()=>0,{step:8,radius:0});
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i],dx=b.p[0]-a.p[0],
        dz=b.p[1]-a.p[1],length=Math.hypot(dx,dz);
      if(length<.02)continue;
      const half=(road.widthMeters||7)/2,nx=-dz/length,nz=dx/length;
      const quad=[
        [a.p[0]-nx*half,.072,a.p[1]-nz*half],
        [b.p[0]-nx*half,.072,b.p[1]-nz*half],
        [b.p[0]+nx*half,.072,b.p[1]+nz*half],
        [a.p[0]+nx*half,.072,a.p[1]+nz*half]
      ];
      patches.push({...road,a:a.p,b:b.p,h0:0,h1:0,quad});
      surfaceSegments.push({a:a.p,b:b.p,h0:0,h1:0,
        halfWidth:half,walk:1.5,roadId:road.id,priority:10,layer:road.layer||0});
    }
  }
  assert.ok(patches.length>1000);
  let triangles=0;
  const started=Date.now();
  const result=unionAsphaltPatches(patches,tri=>{
    triangles++;
    for(const p of tri)for(const coord of p)
      assert.ok(Number.isFinite(coord));
  });
  const seconds=(Date.now()-started)/1000;
  assert.ok(result.inputTriangles>2000);
  assert.equal(triangles,result.outputTriangles);
  assert.ok(result.outputTriangles>0);
  assert.ok(result.clipped>0,"Local roads must have intersections to resolve");
  // Very broad performance limit to catch accidental quadratic behaviour.
  assert.ok(seconds<100, "City subsection too slow: "+seconds+"s");
});
test("Road altitude samples primary pavement at shared crossing",()=>{
  const ground=createRoadSurfaceIndex([
    {roadId:1,a:[-20,0],b:[20,0],h0:10,h1:10,
      halfWidth:6,walk:2,priority:8000,layer:0},
    {roadId:2,a:[0,-20],b:[0,20],h0:11,h1:11,
      halfWidth:3,walk:1,priority:4000,layer:0}
  ]);
  assert.equal(ground.sample(0,0).roadId,1);
  assert.equal(ground.sample(0,0).height,10);
  assert.equal(ground.sample(0,15).roadId,2);
});
