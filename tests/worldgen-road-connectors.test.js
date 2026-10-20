import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSmoothRoadConnectors,connectorHeightAt,MAX_ROAD_JOIN_METRES}
  from "../src/worldgen-road-connectors.js";
import {regionBounds,createRegionRoadIndex}
  from "../src/worldgen-region-stream.js";
import {createRoadCorridors} from "../src/road-corridor.js";

const street=(id,p,opts={})=>({
  id,n:"Avenida Dona Belmira Marin",t:"primary",layer:0,
  widthMeters:10,p,...opts
});
const h=(x,z)=>20+x*.03+z*.015;

test("5.21: small disconnected pieces of SAME named aligned road are joined",()=>{
  const roads=[
    street(1,[[0,0],[20,0]]),
    street(2,[[24,0],[55,0]])
  ];
  const original=JSON.stringify(roads);
  const plan=buildSmoothRoadConnectors(roads,h);
  assert.equal(plan.stats.connected,1);
  const link=plan.connectors[0];
  assert.equal(link.visualConnector,true);
  assert.equal(link.joinGapMetres,4);
  assert.equal(link.widthMeters,10);
  assert.equal(link.n,roads[0].n);
  assert.ok(link.p.length>=5);
  assert.ok(link.p[0][0]<20);
  assert.ok(link.p.at(-1)[0]>24);
  assert.deepEqual(roads,JSON.parse(original),
    "Never mutate imported OSM data");
  const corridor=createRoadCorridors([...roads,...plan.connectors]);
  assert.equal(corridor.covers(22,0),true);
});
test("5.21: negative coordinates and small regional seam both share connector",()=>{
  const roads=[
    street("west",[[-930,0],[-882,0]]),
    street("east",[[-878,0],[-840,0]])
  ];
  const result=buildSmoothRoadConnectors(roads,h);
  assert.equal(result.connectors.length,1);
  const idx=createRegionRoadIndex([...roads,...result.connectors]);
  assert.ok(idx.select(-2,0).some(r=>r.visualConnector));
  assert.ok(idx.select(-1,0).some(r=>r.visualConnector));
  assert.equal(regionBounds(-2,0).maxX,-880);
});
test("5.21: do not invent a road between opposite lanes, perpendicular roads, bridges or different names",()=>{
  const left=street(1,[[0,0],[20,0]]);
  const other=street(2,[[24,0],[50,0]],{n:"Rua Outras"});
  const cross=street(3,[[24,-20],[24,0]]);
  const bridge=street(4,[[24,0],[45,0]],{layer:1,bridge:true});
  const parallel=street(5,[[24,5],[45,5]]);
  const distant=street(6,[[29,0],[55,0]]);
  assert.equal(buildSmoothRoadConnectors([left,other],h).connectors.length,0);
  assert.equal(buildSmoothRoadConnectors([left,cross],h).connectors.length,0);
  assert.equal(buildSmoothRoadConnectors([left,bridge],h).connectors.length,0);
  assert.equal(buildSmoothRoadConnectors([left,parallel],h).connectors.length,0);
  assert.equal(buildSmoothRoadConnectors([left,distant],h).connectors.length,0);
});
test("5.21: do not fabricate a 5m vertical cliff between roadway pieces",()=>{
  const roads=[
    street(1,[[0,0],[20,0]]),
    street(2,[[25,0],[55,0]])
  ];
  const cliff=x=>x<24?30:36;
  const result=buildSmoothRoadConnectors(roads,cliff);
  assert.equal(result.connectors.length,0);
});
test("5.21: closest eligible pair wins and each terminal is used once",()=>{
  const roads=[
    street(1,[[0,0],[20,0]]),
    street(2,[[23,0],[55,0]]),
    street(3,[[26,0],[60,0]])
  ];
  const result=buildSmoothRoadConnectors(roads,h);
  assert.equal(result.connectors.length,1);
  assert.equal(result.connectors[0].joinGapMetres,3);
  assert.equal(MAX_ROAD_JOIN_METRES,8);
});
test("5.21: runtime uses connectors for BOTH mesh and the underlying terrain mask",()=>{
  const content=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  assert.match(content,/const renderRoads=\[\.\.\.map.roads,\.\.\.joinPlan.connectors\]/);
  assert.match(content,/createRegionRoadIndex\(renderRoads\)/);
  assert.match(content,/createRoadCorridors\(renderRoads\)/);
});

test("5.21: connector blends height and entry/exit tangent smoothly",()=>{
  const roads=[
    street("a",[[0,0],[15,0],[20,0]]),
    street("b",[[24,0],[29,0],[40,0]])
  ];
  const height=(x)=>3+x*.08+.001*x*x;
  const {connectors}=buildSmoothRoadConnectors(roads,height);
  assert.equal(connectors.length,1);
  const link=connectors[0];
  const a=connectorHeightAt(link,20,0,height);
  const b=connectorHeightAt(link,24,0,height);
  assert.ok(Math.abs(a-height(20))<1e-8);
  assert.ok(Math.abs(b-height(24))<1e-8);
  for(let x=20.05;x<24;x+=.12){
    const left=connectorHeightAt(link,x-.025,0,height);
    const right=connectorHeightAt(link,x+.025,0,height);
    assert.ok((right-left)/.05<.32);
    assert.ok((right-left)/.05>-.32);
  }
  const epsilon=.0001;
  const slopeAt=(x)=>
    (connectorHeightAt(link,x+epsilon,0,height)-
     connectorHeightAt(link,x-epsilon,0,height))/(2*epsilon);
  assert.ok(Math.abs(slopeAt(20)-link.joinProfile.grade0)<.002);
  assert.ok(Math.abs(slopeAt(24)-link.joinProfile.grade1)<.002);
  assert.equal(connectorHeightAt({},5,5,()=>42),42);
});
