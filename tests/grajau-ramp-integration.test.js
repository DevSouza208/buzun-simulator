import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {drapedSections,createRoadSurfaceIndex} from "../src/draped-road.js";
import {asphaltPriority} from "../src/asphalt-union.js";
import {sidewalkWidth} from "../src/road-corridor.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";
import {planPedestrianCrossings,buildZebraBars}
  from "../src/pedestrian-crossings.js";
import {buildCurbRampZones,createRampIndex} from "../src/curb-ramps.js";

test("250 real Grajaú ways: paired curb cuts join unioned sidewalks and road collision",()=>{
  const json=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=json.roads.filter(r=>r.p?.some(([x,z])=>
    x>-1200&&x<900&&z>-200&&z<800)).slice(0,250);
  const nodes=new Map(),asphalt=[],walks=[],surfaceSegments=[];
  assert.equal(roads.length,250);
  for(const road of roads){
    for(let i=0;i<road.p.length;i++){
      const point=road.p[i],key=road.nodeIds?.[i]!=null?
        "osm:"+road.nodeIds[i]:
        point.map(n=>Math.round(n*10)).join(":");
      if(!nodes.has(key))nodes.set(key,{point,ways:new Set(),maxWidth:0});
      const j=nodes.get(key);
      j.ways.add(road.id);j.maxWidth=Math.max(j.maxWidth,road.widthMeters||7);
    }
    const sections=drapedSections(road.p,(x,z)=>10+.008*x-.006*z,
      {step:9,radius:0});
    for(let i=1;i<sections.length;i++){
      const a=sections[i-1],b=sections[i],dx=b.p[0]-a.p[0],
        dz=b.p[1]-a.p[1],len=Math.hypot(dx,dz);
      if(len<.02)continue;
      const nx=-dz/len,nz=dx/len,half=(road.widthMeters||7)/2,
        foot=sidewalkWidth(road),curbTop=.18;
      const off=(p,d)=>[p[0]+nx*d,p[1]+nz*d];
      const xyz=(p,d,h)=>[
        p[0]+nx*d,h+.072,p[1]+nz*d];
      const meta={id:road.id,t:road.t,layer:road.layer||0,
        widthMeters:road.widthMeters||7,bridge:road.bridge,
        tunnel:road.tunnel,a:a.p,b:b.p,h0:a.base,h1:b.base};
      asphalt.push({...meta,quad:[
        xyz(a.p,-half,a.base),xyz(b.p,-half,b.base),
        xyz(b.p,half,b.base),xyz(a.p,half,a.base)]});
      surfaceSegments.push({a:a.p,b:b.p,h0:a.base,h1:b.base,
        halfWidth:half,walk:foot,curbTop,roadId:road.id,
        layer:road.layer||0,priority:asphaltPriority(road)});
      for(const side of [-1,1])
        walks.push({...meta,curbTop,quad:[
          off(a.p,side*half),off(b.p,side*half),
          off(b.p,side*(half+foot)),off(a.p,side*(half+foot))
        ]});
    }
  }
  const joints=[...nodes.values()].filter(j=>j.ways.size>1);
  const planned=planPedestrianCrossings(roads,joints);
  const surface=createRoadSurfaceIndex(surfaceSegments);
  const sites=planned.sites.filter(s=>buildZebraBars(s,surface).length);
  assert.ok(sites.length>1);
  const tris=[],walls=[];
  const start=performance.now();
  const stats=composeRoadsideMeshes(asphalt,walks,
    tri=>{tris.push(tri);
      assert.ok(tri.every(v=>v.every(Number.isFinite)));},
    wall=>{walls.push(wall);
      assert.ok(wall.every(v=>v.every(Number.isFinite)));},
    {junctions:joints,bevelCurbs:true,rampSites:sites});
  const seconds=(performance.now()-start)/1000;
  const zones=buildCurbRampZones(sites);
  const index=createRampIndex(zones.zones);
  const first=sites[0];
  const point=[
    first.point[0]+first.normal[0]*
      (first.widthMeters/2+zones.zones[0].depth*.25),
    first.point[1]+first.normal[1]*
      (first.widthMeters/2+zones.zones[0].depth*.25)
  ];
  const computed=index.heightAt(...point,surface);
  assert.ok(computed===null||Number.isFinite(computed));
  assert.ok(stats.rampCells>0);
  assert.ok(stats.rampTriangles>stats.rampCells);
  assert.equal(stats.rampSites,sites.length);
  assert.ok(stats.loweredCurbSegments>0);
  assert.ok(seconds<30);
  console.log("[buzun-ramp-integration]",JSON.stringify({
    ways:roads.length,sampledAsphalt:asphalt.length,
    planned:planned.sites.length,painted:sites.length,
    rampSides:stats.rampSides,rampCells:stats.rampCells,
    rampTriangles:stats.rampTriangles,
    loweredCurbSegments:stats.loweredCurbSegments,
    seconds:+seconds.toFixed(3)}));
});
