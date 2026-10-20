import test from "node:test";
import assert from "node:assert/strict";
import {buildCurbRampZones,createRampIndex,intersectConvex,
  rampTopOffset,rampCoordinates,splitCurbEdge,curbHeightAt}
  from "../src/curb-ramps.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";
import {createRoadSurfaceIndex} from "../src/draped-road.js";
import {planPedestrianCrossings,buildZebraBars}
  from "../src/pedestrian-crossings.js";

const main={id:1,t:"primary",widthMeters:12.6,layer:0,
  p:[[-80,0],[0,0],[80,0]]};
const local={id:2,t:"residential",widthMeters:7,layer:0,
  p:[[0,-80],[0,0]]};
const node={point:[0,0],maxWidth:12.6,ways:new Set([1,2])};
const surface=createRoadSurfaceIndex([
  {roadId:1,a:[-80,0],b:[80,0],h0:10,h1:10,halfWidth:6.3,
    walk:2.1,curbTop:.18,priority:8000,layer:0},
  {roadId:2,a:[0,-80],b:[0,0],h0:10,h1:10,halfWidth:3.5,
    walk:1.65,curbTop:.18,priority:4000,layer:0}
]);
const site=planPedestrianCrossings([main,local],[node]).sites[0];
const crosswalk=buildZebraBars(site,surface);
const patches=[
  {id:2,t:"residential",widthMeters:7,layer:0,
    a:[0,-80],b:[0,0],h0:10,h1:10,
    quad:[[-3.5,10.072,-80],[-3.5,10.072,0],
      [3.5,10.072,0],[3.5,10.072,-80]]},
  {id:1,t:"primary",widthMeters:12.6,layer:0,
    a:[-80,0],b:[80,0],h0:10,h1:10,
    quad:[[-80,10.072,-6.3],[80,10.072,-6.3],
      [80,10.072,6.3],[-80,10.072,6.3]]}
];
const walk=[
  {id:2,t:"residential",widthMeters:7,layer:0,
    a:[0,-80],b:[0,0],h0:10,h1:10,curbTop:.18,
    quad:[[-3.5,-80],[-3.5,0],[-5.15,0],[-5.15,-80]]},
  {id:2,t:"residential",widthMeters:7,layer:0,
    a:[0,-80],b:[0,0],h0:10,h1:10,curbTop:.18,
    quad:[[3.5,-80],[3.5,0],[5.15,0],[5.15,-80]]}
];
const close=(a,b,tol=1e-5)=>Math.abs(a-b)<tol;
test("Only a real painted zebra receives TWO paired ramp zones",()=>{
  assert.equal(crosswalk.length,6);
  const {zones,stats}=buildCurbRampZones([site]);
  assert.equal(stats.crossings,1);
  assert.equal(stats.rampSides,2);
  assert.equal(zones.length,2);
  assert.ok(zones.every(z=>z.cells.length===8));
  assert.ok(zones.every(z=>z.depth<=site.sidewalkMeters));
  assert.equal(buildCurbRampZones([]).stats.rampSides,0);
});
test("Ramp lip meets road with small kerb rise, sidewalk edge retains old height",()=>{
  const zone=buildCurbRampZones([site]).zones[0];
  const p=(t,d)=>[
    site.point[0]+site.axis[0]*t+
      site.normal[0]*zone.side*(site.widthMeters/2+d),
    site.point[1]+site.axis[1]*t+
      site.normal[1]*zone.side*(site.widthMeters/2+d)
  ];
  assert.ok(close(rampTopOffset(zone,p(0,0),.18),.084));
  assert.ok(close(rampTopOffset(zone,p(0,zone.depth),.18),.18));
  assert.ok(close(rampTopOffset(zone,p(zone.outerHalf,0),.18),.18));
  assert.ok(rampTopOffset(zone,p(zone.flatHalf+.3,0),.18)>.084);
  const center=rampCoordinates(zone,p(0,.25));
  assert.ok(close(center.into,.25));
  const index=createRampIndex([zone]);
  assert.ok(close(index.heightAt(...p(0,0.25),surface),
    10+rampTopOffset(zone,p(0,.25),.18)));
  assert.equal(index.heightAt(...p(0,zone.depth+1),surface),null);
});
test("Convex cutter accepts reversed road sidewalk winding and excludes nonintersections",()=>{
  const {zones}=buildCurbRampZones([site]);
  const poly=zones[0].polygon;
  assert.ok(intersectConvex([...poly].reverse(),poly).length>=3);
  assert.deepEqual(intersectConvex([[200,200],[202,200],[202,202],[200,202]],poly),[]);
});
test("Curb side opening is split at flat and flared edges",()=>{
  const zone=buildCurbRampZones([site]).zones[0];
  const a=[
    site.point[0]-site.axis[0]*5+
      site.normal[0]*zone.side*site.widthMeters/2,
    site.point[1]-site.axis[1]*5+
      site.normal[1]*zone.side*site.widthMeters/2
  ];
  const b=[
    site.point[0]+site.axis[0]*5+
      site.normal[0]*zone.side*site.widthMeters/2,
    site.point[1]+site.axis[1]*5+
      site.normal[1]*zone.side*site.widthMeters/2
  ];
  const parts=splitCurbEdge(a,b,zone);
  assert.equal(parts.length,5);
  assert.ok(close(curbHeightAt(site.point,.18,[zone]),.18));
  const center=parts[2][0].map((v,i)=>(v+parts[2][1][i])/2);
  assert.ok(close(curbHeightAt(center,.18,[zone]),.084));
});
test("The old elevated slab is CUT OUT and the two ramps are genuinely re-tessellated",()=>{
  const tris=[],curbs=[];
  const stats=composeRoadsideMeshes(patches,walk,
    (tri)=>tris.push(tri),
    (q)=>curbs.push(q),{rampSites:[site],junctions:[node]});
  assert.equal(stats.rampSides,2);
  assert.ok(stats.rampCells>=8);
  assert.ok(stats.rampTriangles>20);
  assert.ok(stats.loweredCurbSegments>=2);
  assert.ok(tris.some(t=>t.some(p=>p[1]<10.12)),
    "Ramp must lower actual sidewalk mesh, not overlay the old top");
  assert.ok(tris.some(t=>t.some(p=>close(p[1],10.18))),
    "Sidewalk outer edge and unmodified sections must remain high");
  assert.ok(curbs.some(q=>q[2][1]<10.14),
    "Curb opening must drop near the zebra rather than leave a 14cm wall");
  assert.ok(tris.every(t=>t.every(p=>p.every(Number.isFinite))));
});
test("A road not owning this zebra gets no ramp cuts",()=>{
  const foreignSite={...site,roadId:91,id:"foreign"};
  const stats=composeRoadsideMeshes(patches,walk,()=>{},()=>{},
    {rampSites:[foreignSite]});
  assert.equal(stats.rampCells,0);
  assert.equal(stats.loweredCurbSegments,0);
});
test("Ramp widths shrink with editor-set narrow sidewalks, or skip if too narrow",()=>{
  const small=buildCurbRampZones([{...site,sidewalkMeters:.65}]);
  assert.equal(small.zones.length,2);
  assert.ok(small.zones[0].depth<.65);
  const invalid=buildCurbRampZones([{...site,sidewalkMeters:.5}]);
  assert.equal(invalid.zones.length,0);
  assert.equal(invalid.stats.skippedNarrow,1);
});
