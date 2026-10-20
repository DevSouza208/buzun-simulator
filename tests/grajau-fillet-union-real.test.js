import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {drapedSections} from "../src/draped-road.js";
import {sidewalkWidth} from "../src/road-corridor.js";
import {unionAsphaltPatches} from "../src/asphalt-union.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";
import {buildJunctionFillets} from "../src/junction-fillets.js";

test("OSM 250-way sample: curved road asphalt and sidewalk union stay tractable",()=>{
  const data=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=data.roads.filter(r=>r.p?.some(([x,z])=>
    x>-1200&&x<900&&z>-200&&z<800)).slice(0,250);
  const nodes=new Map();
  for(const r of roads)for(let i=0;i<r.p.length;i++){
    const id=r.nodeIds?.[i]!=null?"osm:"+r.nodeIds[i]:
      r.p[i].map(n=>n.toFixed(1)).join(":")+":"+(r.layer||0);
    if(!nodes.has(id))nodes.set(id,{point:r.p[i],ways:new Set(),
      maxWidth:0});
    const j=nodes.get(id);
    j.ways.add(r.id);j.maxWidth=Math.max(j.maxWidth,r.widthMeters||7);
  }
  const joints=[...nodes.values()].filter(j=>j.ways.size>1);
  const asphalt=[],walks=[];
  for(const r of roads){
    const section=drapedSections(r.p,()=>5,{step:9,radius:0});
    for(let i=1;i<section.length;i++){
      const a=section[i-1].p,b=section[i].p;
      const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      if(len<.02)continue;
      const nx=-dz/len,nz=dx/len,half=(r.widthMeters||7)/2,
        foot=sidewalkWidth(r);
      const off=(p,m)=>[p[0]+nx*m,p[1]+nz*m];
      const xyz=(p,m)=>[p[0]+nx*m,5.072,p[1]+nz*m];
      const common={id:r.id,t:r.t,layer:r.layer||0,
        widthMeters:r.widthMeters||7,bridge:r.bridge,tunnel:r.tunnel,
        a,b,h0:5,h1:5};
      asphalt.push({...common,quad:[xyz(a,-half),xyz(b,-half),
        xyz(b,half),xyz(a,half)]});
      for(const side of [-1,1]){
        walks.push({...common,curbTop:.18,
          quad:[off(a,side*half),off(b,side*half),
            off(b,side*(half+foot)),off(a,side*(half+foot))]});
      }
    }
  }
  const curves=buildJunctionFillets(roads,joints,()=>5);
  assert.ok(curves.patches.length>0);
  const all=[...asphalt,...curves.patches];
  let triangles=0,walkTriangles=0,curbs=0;
  const start=performance.now();
  const asphaltStats=unionAsphaltPatches(all,tri=>{
    triangles++;
    assert.ok(tri.every(v=>v.every(Number.isFinite)));
  });
  const sidewalkStats=composeRoadsideMeshes(all,walks,tri=>{
    walkTriangles++;assert.ok(tri.every(v=>v.every(Number.isFinite)));
  },wall=>{
    curbs++;assert.ok(wall.every(v=>v.every(Number.isFinite)));
  },{junctions:joints});
  const duration=(performance.now()-start)/1000;
  assert.equal(triangles,asphaltStats.outputTriangles);
  assert.equal(curbs,sidewalkStats.curbSegments);
  assert.ok(walkTriangles>100&&curbs>100);
  assert.ok(duration<35, "Curved asphalt and sidewalk too expensive "+duration);
  console.log("[buzun-corner-integration]",JSON.stringify({
    ways:roads.length,rawAsphaltSegments:asphalt.length,
    cornerPatches:curves.patches.length,
    triangles,walkTriangles,curbs,
    seconds:+duration.toFixed(3)}));
});
