import test from "node:test";
import assert from "node:assert/strict";
import {resolveLanePlan,paintIntervals,MIN_LANE_METRES}
  from "../src/road-lanes.js";
import {waysFromOverpass,ORIGIN} from "../src/grajau-osm.js";
import {readFileSync} from "node:fs";

test("Belmira-sized two-way primary road has two lanes EACH direction",()=>{
  const p=resolveLanePlan({t:"primary",widthMeters:12.6});
  assert.equal(p.total,4);
  assert.equal(p.forward,2);assert.equal(p.backward,2);
  assert.equal(p.oneway,false);
  assert.ok(p.laneWidthMeters>=MIN_LANE_METRES);
  assert.equal(p.markings.filter(m=>m.kind==="lane").length,2);
  assert.equal(p.markings.filter(m=>m.kind==="center").length,2);
  assert.equal(p.markings.filter(m=>m.kind==="edge").length,2);
  assert.ok(p.markings.every(m=>Math.abs(m.offset)<6.3));
});

test("Typical Grajaú residential street uses one lane per direction, no invented double yellow",()=>{
  const p=resolveLanePlan({t:"residential",widthMeters:7});
  assert.deepEqual([p.total,p.forward,p.backward],[2,1,1]);
  assert.equal(p.markings.length,0,"No legal striping should be inferred for local streets");
});
test("Secondary road 10.5m does not invent a third asymmetric lane",()=>{
  const p=resolveLanePlan({t:"secondary",widthMeters:10.5});
  assert.deepEqual([p.forward,p.backward],[1,1]);
  assert.equal(p.total,2);
  assert.equal(p.markings.filter(m=>m.kind==="lane").length,0);
});
test("When there is space, a broad two-way road can grow to three lanes each way",()=>{
  const p=resolveLanePlan({t:"primary",widthMeters:19.2});
  assert.deepEqual([p.forward,p.backward,p.total],[3,3,6]);
  assert.equal(p.markings.filter(m=>m.kind==="lane").length,4);
});
test("One-way 9.4 metre street gets three same-direction lanes and NO opposing yellow",()=>{
  const p=resolveLanePlan({t:"secondary",widthMeters:9.4,o:"yes"});
  assert.deepEqual([p.forward,p.backward,p.total],[3,0,3]);
  assert.equal(p.markings.filter(m=>m.kind==="center").length,0);
  assert.equal(p.markings.filter(m=>m.kind==="lane").length,2);
});
test("Reverse one-way and motorway default direction are recognized",()=>{
  const reverse=resolveLanePlan({t:"residential",widthMeters:6.5,o:"-1"});
  assert.equal(reverse.oneway,true);
  assert.equal(reverse.total,2);
  const motorway=resolveLanePlan({t:"motorway",widthMeters:18,o:""});
  assert.equal(motorway.oneway,true);
  const explicitNo=resolveLanePlan({t:"trunk",widthMeters:13,o:"no"});
  assert.equal(explicitNo.oneway,false);
});
test("OSM explicit symmetric two-lane tags override width inference",()=>{
  const p=resolveLanePlan({t:"primary",widthMeters:13,lanes:2});
  assert.equal(p.total,2);
  assert.equal(p.source,"osm");
});
test("OSM asymmetric 2+1 directions are honored only if both provided and they fit",()=>{
  const p=resolveLanePlan({t:"secondary",widthMeters:10.5,
    lanes:3,lanesForward:2,lanesBackward:1});
  assert.deepEqual([p.forward,p.backward,p.total],[2,1,3]);
  assert.equal(p.source,"osm-directions");
  assert.ok(p.centerOffsetMeters>0);
  assert.equal(p.markings.filter(m=>m.kind==="lane").length,1);
});
test("OSM odd lanes without direction are ambiguous; never invent 2+1",()=>{
  const p=resolveLanePlan({t:"primary",widthMeters:13,lanes:3});
  assert.deepEqual([p.forward,p.backward,p.total],[2,2,4]);
  assert.equal(p.ambiguousOSM,true);
});
test("Tagged six lanes on narrow asphalt never overflow the physical road",()=>{
  const p=resolveLanePlan({t:"secondary",widthMeters:7,lanes:6});
  assert.equal(p.total,2);
  assert.equal(p.limitedByWidth,true);
  assert.ok(p.markings.every(m=>Math.abs(m.offset)+m.width/2<3.5));
});
test("Unrealistic directional OSM tags cannot overflow three lanes on one side",()=>{
  const p=resolveLanePlan({t:"primary",widthMeters:20,
    lanesForward:5,lanesBackward:1});
  assert.deepEqual([p.forward,p.backward],[3,3]);
  assert.equal(p.source,"width-constrained");
});
test("Narrow streets do not get unsafe markings",()=>{
  const p=resolveLanePlan({t:"service",widthMeters:4.8,o:"no"});
  assert.equal(p.markings.length,0);
});
test("Long dash has stable 4.4m paint / 7.6m gaps across 5m segments",()=>{
  const intervals=[];
  let phase=0;
  for(let i=0;i<24;i++){
    for(const [a,b] of paintIntervals(phase,5,"dashed"))
      intervals.push([phase+a*5,phase+b*5]);
    phase+=5;
  }
  assert.ok(Math.abs(intervals.reduce((n,[a,b])=>n+(b-a),0)-44)<1e-7);
  assert.ok(intervals.some(([a,b])=>a===12&&Math.abs(b-16.4)<1e-8));
  assert.deepEqual(paintIntervals(100,3,"solid"),[[0,1]]);
  assert.deepEqual(paintIntervals(0,.001,"dashed"),[]);
});
test("Importer retains asymmetric lanes and infers one-way for OSM roundabouts",()=>{
  const node=(x,z)=>({lat:ORIGIN.lat-z/111132,
    lon:ORIGIN.lon+x/(111320*Math.cos(ORIGIN.lat*Math.PI/180))});
  const imported=waysFromOverpass({elements:[{
    id:9222,type:"way",geometry:[node(0,0),node(20,0)],
    nodes:[100,101],tags:{
      highway:"secondary",lanes:"3","lanes:forward":"2","lanes:backward":"1"
    }
  },{
    id:9223,type:"way",geometry:[node(20,0),node(20,30)],
    nodes:[102,103],tags:{highway:"residential",junction:"roundabout"}
  }]});
  assert.equal(imported[0].lanes,3);
  assert.equal(imported[0].lanesForward,2);
  assert.equal(imported[0].lanesBackward,1);
  assert.equal(imported[1].o,"yes");
});
test("Grajaú source snapshot can be assigned a safe, deterministic lane plan",()=>{
  const raw=JSON.parse(readFileSync(new URL("../public/data/grajau-city-roads.json",
    import.meta.url),"utf8"));
  assert.ok(raw.roads.length>4000);
  const dist={};
  for(const road of raw.roads){
    const p=resolveLanePlan(road);
    assert.ok(p.total>=1&&p.total<=6);
    assert.ok(p.widthMeters>0);
    assert.ok(p.forward>=1);
    assert.ok(p.oneway||p.backward>=1);
    assert.ok(p.markings.every(m=>Number.isFinite(m.offset)&&
      Math.abs(m.offset)+m.width/2<=p.widthMeters/2+1e-8));
    dist[p.total]=(dist[p.total]||0)+1;
  }
  assert.equal(Object.values(dist).reduce((a,b)=>a+b,0),raw.roads.length);
  assert.ok(dist[2]>100);
});
