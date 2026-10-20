import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planPedestrianCrossings,buildZebraBars}
  from "../src/pedestrian-crossings.js";
import {createRoadSurfaceIndex} from "../src/draped-road.js";

const avenue={id:1,t:"primary",widthMeters:12.6,layer:0,
  p:[[-80,0],[0,0],[80,0]]};
const secondary={id:2,t:"residential",widthMeters:7,layer:0,
  p:[[0,-80],[0,0]]};
const joint={point:[0,0],maxWidth:12.6,ways:new Set([1,2])};
const surface=createRoadSurfaceIndex([
  {roadId:1,a:[-80,0],b:[80,0],h0:9,h1:9,halfWidth:6.3,
    walk:2.1,priority:8000,layer:0},
  {roadId:2,a:[0,-80],b:[0,0],h0:9,h1:9,halfWidth:3.5,
    walk:1.65,priority:4000,layer:0}
]);

test("A true T junction suggests one zebra on the side street, not the main avenue",()=>{
  const result=planPedestrianCrossings([avenue,secondary],[joint]);
  assert.equal(result.stats.crossingsPlanned,1);
  assert.equal(result.sites[0].roadId,2);
  assert.ok(result.sites[0].point[1]<-9);
  assert.equal(result.sites[0].source,"inferred-osm-junction");
  assert.deepEqual(planPedestrianCrossings([secondary,avenue],[joint]).sites,
    result.sites,"OSM input ordering does not change generated markings");
});
test("Six road-surface validated zebra bars have finite metric coordinates",()=>{
  const {sites}=planPedestrianCrossings([avenue,secondary],[joint]);
  const bars=buildZebraBars(sites[0],surface);
  assert.equal(bars.length,6);
  for(const bar of bars){
    assert.equal(bar.length,4);
    for(const [x,y,z] of bar){
      assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
      assert.ok(x>=-3.5&&x<=3.5);
      assert.ok(z< -6.3);
      assert.ok(Math.abs(y-9.112)<1e-7);
    }
  }
});
test("A two-lane X junction may suggest at most two approaches",()=>{
  const fourth={id:3,t:"residential",widthMeters:7,layer:0,
    p:[[0,0],[0,80]]};
  const {sites,stats}=planPedestrianCrossings(
    [avenue,secondary,fourth],
    [{point:[0,0],maxWidth:12.6,ways:new Set([1,2,3])}]);
  assert.equal(sites.length,2);
  assert.ok(sites.every(s=>s.roadId!==1));
  assert.equal(stats.crossingsPlanned,2);
});
test("No stripes at a road that only passes near another without shared topology",()=>{
  const result=planPedestrianCrossings([avenue,secondary],[
    {point:[0,0],maxWidth:12.6,ways:new Set([1])}
  ]);
  assert.equal(result.sites.length,0);
});
test("Do not infer markings from grade separated roads or expressways",()=>{
  const bridge={...secondary,layer:1};
  assert.equal(planPedestrianCrossings([avenue,bridge],[joint]).sites.length,0);
  const freeway={...avenue,t:"motorway"};
  assert.equal(planPedestrianCrossings([freeway,secondary],[joint]).sites.length,0);
  const tunnel={...avenue,t:"primary",tunnel:true,layer:0};
  assert.equal(planPedestrianCrossings([tunnel,secondary],[joint]).sites.length,0);
});
test("Short branches, narrow service roads and collinear joins stay unsigned",()=>{
  const short={...secondary,p:[[0,-8],[0,0]]};
  assert.equal(planPedestrianCrossings([avenue,short],[joint]).sites.length,0);
  const narrow={...secondary,widthMeters:4.1};
  assert.equal(planPedestrianCrossings([avenue,narrow],[joint]).sites.length,0);
  const service={...secondary,t:"service"};
  assert.equal(planPedestrianCrossings([avenue,service],[joint]).sites.length,0);
  const continuous={...secondary,p:[[0,0],[80,0]]};
  assert.equal(planPedestrianCrossings([avenue,continuous],[joint]).sites.length,0);
});
test("Reject paint over a competing asphalt road or outside the known carriageway",()=>{
  const [site]=planPedestrianCrossings([avenue,secondary],[joint]).sites;
  const competitor=createRoadSurfaceIndex([
    {roadId:99,a:[0,-30],b:[0,0],h0:9,h1:9,
      halfWidth:4,walk:2,priority:9999,layer:0}
  ]);
  assert.deepEqual(buildZebraBars(site,competitor),[]);
  assert.deepEqual(buildZebraBars(
    {...site,widthMeters:27},surface),[]);
});
test("Validate crossing density on the real Grajaú OSM snapshot without falsely claiming legal markings",()=>{
  const raw=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const touches=new Map();
  for(const road of raw.roads){
    for(let i=0;i<road.p.length;i++){
      const key=road.nodeIds?.[i]!=null?"osm:"+road.nodeIds[i]:
        road.p[i].map(n=>Math.round(n*10)).join(":");
      if(!touches.has(key))touches.set(key,{
        point:road.p[i],ways:new Set(),maxWidth:0});
      const entry=touches.get(key);
      entry.ways.add(road.id);
      entry.maxWidth=Math.max(entry.maxWidth,road.widthMeters||7);
    }
  }
  const junctions=[...touches.values()].filter(j=>j.ways.size>1);
  const started=performance.now();
  const result=planPedestrianCrossings(raw.roads,junctions);
  const seconds=(performance.now()-started)/1000;
  assert.ok(raw.roads.length>4000);
  assert.ok(result.stats.suitableJunctions>10);
  assert.ok(result.sites.length>5);
  assert.ok(result.sites.length<=2*junctions.length);
  assert.ok(result.sites.every(s=>s.layer===0&&s.offset>=7.5&&
    s.widthMeters>=5.2));
  assert.ok(seconds<25);
  console.log("[buzun-zebra-planning]",JSON.stringify({
    roads:raw.roads.length,junctions:junctions.length,
    seconds:+seconds.toFixed(3),...result.stats}));
});
