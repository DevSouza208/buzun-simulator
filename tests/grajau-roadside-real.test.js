import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {drapedSections} from "../src/draped-road.js";
import {sidewalkWidth} from "../src/road-corridor.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";

/** No DOM, WebGL or CDN involved: exactly the browser's 2D union logic. */
test("Real Grajaú roadways have one joined walking surface outside asphalt",()=>{
  const data=JSON.parse(readFileSync(new URL("../public/data/grajau-city-roads.json",
    import.meta.url),"utf8"));
  const near=data.roads.filter(road=>road.p?.some(([x,z])=>
    x>-1200&&x<900&&z>-200&&z<800)).slice(0,400);
  assert.ok(near.length>50);
  const roads=[],walks=[];
  for(const road of near){
    const samples=drapedSections(road.p,()=>5,{step:9,radius:0});
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1].p,b=samples[i].p,
        dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
      if(l<.02)continue;
      const nx=-dz/l,nz=dx/l,half=(road.widthMeters||7)/2,
        foot=sidewalkWidth(road);
      const off=(p,d)=>[p[0]+nx*d,p[1]+nz*d];
      const surf=(p,d)=>[p[0]+nx*d,5.072,p[1]+nz*d];
      const meta={id:road.id,t:road.t,layer:road.layer||0,
        widthMeters:road.widthMeters||7,bridge:road.bridge,tunnel:road.tunnel,
        a,b,h0:5,h1:5};
      roads.push({...meta,quad:[surf(a,-half),surf(b,-half),
        surf(b,half),surf(a,half)]});
      for(const side of [-1,1]) {
        const inside=side*half,outside=side*(half+foot);
        walks.push({...meta,curbTop:.18,quad:[
          off(a,inside),off(b,inside),off(b,outside),off(a,outside)]});
      }
    }
  }
  assert.ok(roads.length>800);
  let surfaces=0,walls=0,finite=true;
  const start=performance.now();
  const stats=composeRoadsideMeshes(roads,walks,
    tri=>{surfaces++;for(const point of tri)
      for(const n of point)finite&&=Number.isFinite(n);},
    quad=>{walls++;for(const point of quad)
      for(const n of point)finite&&=Number.isFinite(n);});
  const elapsed=(performance.now()-start)/1000;
  assert.ok(finite);
  assert.ok(surfaces>0&&walls>0);
  assert.equal(stats.curbSegments,walls);
  assert.ok(stats.clipOperations>0,"Real street intersections need clipping");
  // Diagnostic only, keep the same 100s broad bound as real asphalt test.
  assert.ok(elapsed<100,"Roadside geometry too slow: "+elapsed+"s");
  console.log("[grajau-roadside-benchmark]",JSON.stringify({
    roads:near.length,segments:roads.length,sidewalkPatches:walks.length,
    surfaces,walls,elapsedSeconds:+elapsed.toFixed(3),...stats}));
});
