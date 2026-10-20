import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildIntersectionGradeModels} from "../src/intersection-grade.js";
import {drapedSections,coordinateKey,createRoadSurfaceIndex}
  from "../src/draped-road.js";
import {createRegionRoadIndex,clip3DTriangle,regionBounds}
  from "../src/worldgen-region-stream.js";
import {planPedestrianCrossings,buildZebraBars}
  from "../src/pedestrian-crossings.js";
import {maskedCorridorHalfWidth,TERRAIN_OVERLAP_METRES}
  from "../src/terrain-road-mask.js";

const almost=(a,b,epsilon=1e-8)=>Math.abs(a-b)<epsilon;

test("5.20: canonical road grades are identical on opposite sides of a chunk border",()=>{
  const roads=[
    {id:"through",p:[[790,20],[880,20],[970,20]],widthMeters:10,t:"primary"},
    {id:"side",p:[[880,-25],[880,20],[880,90]],widthMeters:7,t:"residential"}
  ];
  const junction={point:[880,20],ways:new Set(["through","side"]),maxWidth:10};
  const sample=(x,z)=>70+.11*x+.03*z+
    .3*Math.sin(x*.02);
  const globalGrades=buildIntersectionGradeModels(roads,[junction],sample);
  const anchors=new Set([coordinateKey(junction.point)]);
  const index=createRegionRoadIndex(roads);
  const regions=[index.select(0,0),index.select(1,0)];
  assert.ok(regions.every(a=>a.some(r=>r.id==="through")));
  const sections=regions.map(ways=>{
    const road=ways.find(r=>r.id==="through");
    return drapedSections(road.p,sample,{
      step:9,radius:18,adaptive:true,maxSlope:.24,
      fixedJunctions:anchors
    }).map(s=>({...s,base:s.base}));
  });
  for(const rows of sections){
    // Intersection reconciliation is shared, never region-derived.
    const models=globalGrades.byWay.get("through");
    assert.ok(models.length>0);
    const joint=rows.find(row=>coordinateKey(row.p)===coordinateKey(junction.point));
    assert.equal(joint.base,sample(...joint.p));
  }
  assert.deepEqual(sections[0],sections[1]);
  const surface=createRoadSurfaceIndex(sections[0].slice(1).map((s,i)=>({
    a:sections[0][i].p,b:s.p,
    h0:sections[0][i].base,h1:s.base,
    roadId:"through",halfWidth:5,walk:1.65,layer:0
  })));
  const h=surface.sample(880,20);
  assert.ok(h&&Number.isFinite(h.height));
});

test("5.20: adjoining render rectangles cut ONE grade plane without a height seam",()=>{
  const y=(x,z)=>8+.02*x-.013*z;
  const input=[[850,y(850,300),300],
    [920,y(920,310),310],[890,y(890,400),400]];
  const left=clip3DTriangle(input,regionBounds(0,0));
  const right=clip3DTriangle(input,regionBounds(1,0));
  assert.ok(left.length&&right.length);
  for(const p of [...left,...right].flat())
    assert.ok(almost(p[1],y(p[0],p[2])));
  const leftBorder=left.flat().filter(p=>almost(p[0],880));
  const rightBorder=right.flat().filter(p=>almost(p[0],880));
  assert.ok(leftBorder.length&&rightBorder.length);
  assert.ok(leftBorder.some(a=>rightBorder.some(b=>
    almost(a[2],b[2])&&almost(a[1],b[1]))));
});

test("5.20: zebra stripes run along approach and repeat across pavement, not sideways",()=>{
  const road={id:2,t:"residential",layer:0,widthMeters:7,
    p:[[0,-80],[0,0]]};
  const avenue={id:1,t:"primary",layer:0,widthMeters:12.6,
    p:[[-80,0],[0,0],[80,0]]};
  const joint={point:[0,0],maxWidth:12.6,ways:new Set([1,2])};
  const site=planPedestrianCrossings([road,avenue],[joint]).sites[0];
  const surface=createRoadSurfaceIndex([
    {a:[0,-80],b:[0,0],h0:4,h1:4,roadId:2,
      halfWidth:3.5,walk:1.65,priority:4000,layer:0},
    {a:[-80,0],b:[80,0],h0:4,h1:4,roadId:1,
      halfWidth:6.3,walk:2.1,priority:8000,layer:0}
  ]);
  const bars=buildZebraBars(site,surface);
  assert.equal(bars.length,6);
  // In the fixture the arm is north-south: each white rectangle must
  // extend >3m in Z while remaining <1m wide in X.
  const centers=[];
  for(const bar of bars){
    const xs=bar.map(p=>p[0]),zs=bar.map(p=>p[2]);
    assert.ok(Math.max(...zs)-Math.min(...zs)>3.8);
    assert.ok(Math.max(...xs)-Math.min(...xs)<.5);
    centers.push(xs.reduce((sum,x)=>sum+x,0)/4);
  }
  assert.ok(centers.every((x,i)=>i===0||x>centers[i-1]));
});

test("5.20: terrain ends under sidewalks, never opens an outer empty moat",()=>{
  assert.equal(TERRAIN_OVERLAP_METRES,.6);
  const street={halfWidth:3.5,walk:1.65,envelope:5.8};
  const width=maskedCorridorHalfWidth(street);
  assert.ok(almost(width,4.55));
  assert.ok(width<street.halfWidth+street.walk);
  assert.ok(width<street.envelope);
  assert.equal(maskedCorridorHalfWidth({halfWidth:NaN,walk:2}),0);
});

test("5.20: streamed renderer references one city-wide source for all chunks",()=>{
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const mesh=readFileSync(new URL(
    "../src/city-road-mesh.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL(
    "../src/terrain-cutout.js",import.meta.url),"utf8");
  assert.match(stream,/const worldSource=\{globalGrades,globalFixedJunctions,\s*worldSheet,globalAsphaltAtlas\}/);
  assert.match(stream,/backgroundAsphalt:true,\.\.\.worldSource/);
  assert.match(stream,/renderBounds:regionBounds\(rx,rz\),\.\.\.worldSource/);
  assert.match(mesh,/const gradeModels=globalGrades\|\|/);
  assert.match(mesh,/const fixedJunctions=globalFixedJunctions\|\|/);
  assert.match(terrain,/maskedCorridorHalfWidth\(s\)/);
});
