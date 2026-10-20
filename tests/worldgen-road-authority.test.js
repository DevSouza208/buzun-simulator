import test from "node:test";
import assert from "node:assert/strict";
import {
  CURB_RISE,TERRAIN_MARGIN,sidewalkWidth,roadHalfWidth,
  distanceToSegment,createRoadCorridors,subtractRoadFromPolygon,
  clipSidewalkPolygon
} from "../src/road-corridor.js";

test("Every drivable road receives two raised sidewalk margins",()=>{
  const types=["motorway","trunk","primary","secondary","tertiary",
    "residential","service","living_street","unclassified"];
  for(const t of types){
    assert.ok(sidewalkWidth({t})>0,t+" missing sidewalk");
    assert.ok(CURB_RISE>.1);
    assert.ok(TERRAIN_MARGIN>.4);
  }
  assert.equal(roadHalfWidth({widthMeters:8}),4);
});
test("Ground exclusion covers the ENTIRE asphalt+curb+sidewalk corridor",()=>{
  const road={id:9,t:"residential",widthMeters:8,p:[[0,0],[80,0]]};
  const mask=createRoadCorridors([road]);
  const walk=sidewalkWidth(road);
  for(const x of [0,1,15,35,55,79,80]){
    for(const side of [-1,1]){
      assert.equal(mask.covers(x,side*(4+walk-.15)),true,
        "Ground must be removed under sidewalk at "+x);
      assert.equal(mask.covers(x,side*(4+walk+TERRAIN_MARGIN+1.2)),false);
    }
  }
  assert.equal(mask.covers(30,0),true);
  assert.equal(mask.covers(30,18),false);
});
test("Inside-city road space is 1:1; never applies horizontal scaling",()=>{
  const s={a:[0,0],b:[100,0]};
  assert.ok(Math.abs(distanceToSegment(37,8,s).distance-8)<1e-9);
  assert.ok(Math.abs(distanceToSegment(37,8,s).t-.37)<1e-9);
});
test("At a cross street cut exactly the crossing footprint, NOT whole sidewalk strips",()=>{
  const own={id:1,layer:0};
  const other={id:2,layer:0,a:[0,-20],b:[0,20],halfWidth:3.5};
  const polygon=[[-12,4],[12,4],[12,5.5],[-12,5.5]];
  const parts=clipSidewalkPolygon(polygon,own,[other]);
  assert.equal(parts.length,2,"Need BOTH connected sidewalk approaches to the crossing");
  const area=parts.reduce((a,p)=>a+Math.abs(p.reduce((s,q,i)=>{
    const r=p[(i+1)%p.length];return s+q[0]*r[1]-r[0]*q[1];
  },0))/2,0);
  assert.ok(area>15 && area<32,"Road-crossing part must be cut, not entire sidewalk");
  assert.ok(parts.every(poly=>poly.length>=3));
});
test("No sidewalk removed merely because a crossing has a different layer",()=>{
  const poly=[[-8,4],[8,4],[8,5],[-8,5]];
  const bridge={id:2,layer:1,a:[0,-12],b:[0,12],halfWidth:4};
  const parts=clipSidewalkPolygon(poly,{id:1,layer:0},[bridge]);
  assert.deepEqual(parts,[poly]);
});
test("Road corridor mask and sidewalk clip keep distinct neighbouring roads",()=>{
  const roads=[
    {id:1,t:"primary",widthMeters:12,p:[[-35,0],[35,0]]},
    {id:2,t:"residential",widthMeters:7,p:[[0,-35],[0,35]]}
  ];
  const corridor=createRoadCorridors(roads);
  assert.equal(corridor.query(-5,-5,5,5).length,4);
  assert.ok(corridor.covers(0,0));
  assert.ok(corridor.covers(12,7));
  assert.ok(!corridor.covers(33,33));
  const poly=[[-20,6], [20,6],[20,8],[-20,8]];
  const segments=corridor.query(-22,4,22,10);
  const parts=clipSidewalkPolygon(poly,roads[0],segments);
  assert.equal(parts.length,2);
});
