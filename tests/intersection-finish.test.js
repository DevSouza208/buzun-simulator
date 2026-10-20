import test from "node:test";
import assert from "node:assert/strict";
import {buildIntersectionGradeModels,reconcileRoadGrade}
  from "../src/intersection-grade.js";
import {drapedSections} from "../src/draped-road.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";

const main={id:1,t:"primary",widthMeters:12,p:[[-30,0],[0,0],[30,0]]};
const side={id:2,t:"residential",widthMeters:7,p:[[0,-30],[0,0]]};
const junction={point:[0,0],maxWidth:12,ways:new Set([1,2])};
const demoHeight=(x,z)=>10+x*.1+.03*z+.35*Math.sin(z*.6);

test("Main avenue owns slope plane at real shared OSM junction",()=>{
  const result=buildIntersectionGradeModels([main,side],[junction],demoHeight);
  assert.equal(result.models.length,1);
  const model=result.models[0];
  assert.equal(model.ownerId,1);
  assert.equal(model.centerHeight,10);
  assert.ok(Math.abs(model.grade-.1)<1e-8);
  assert.deepEqual(result.byWay.get("1"),[model]);
  assert.deepEqual(result.byWay.get("2"),[model]);
  assert.ok(model.radius>=8);
});
test("Side road grades blend into primary junction, with no change outside radius",()=>{
  const {byWay}=buildIntersectionGradeModels([main,side],[junction],demoHeight);
  const raw=drapedSections(side.p,demoHeight);
  const settled=reconcileRoadGrade(raw,byWay.get("2"));
  const near=raw.findIndex(s=>Math.abs(s.p[1]+5)<.05);
  const target=10;
  assert.ok(near>=0);
  assert.ok(Math.abs(settled[near].base-target)<
    Math.abs(raw[near].base-target));
  assert.ok(Math.abs(settled[near].base-raw[near].base)<=.8+1e-8);
  assert.equal(settled[0].base,raw[0].base,
    "Natural grade must remain unmodified outside the intersection");
  assert.equal(settled.at(-1).base,10,"Shared OSM junction stays level");
  assert.deepEqual(settled.map(x=>x.p),raw.map(x=>x.p),
    "Horizontal coordinates remain 1:1");
});
test("Grade reconciliation is bounded, deterministic and does not flatten hillside",()=>{
  const {models}=buildIntersectionGradeModels([main,side],[junction],demoHeight);
  const samples=[{p:[0,0],base:8},{p:[0,-4],base:14},
    {p:[0,-80],base:33}];
  const result=reconcileRoadGrade(samples,models);
  assert.ok(Math.abs(result[0].base-8)<=.8+1e-8);
  assert.ok(Math.abs(result[1].base-14)<=.8+1e-8);
  assert.equal(result[2],samples[2]);
  assert.deepEqual(reconcileRoadGrade(samples,models),result);
});
test("Grade blending does not merge bridge level with street under it",()=>{
  const bridge={id:11,t:"primary",layer:1,widthMeters:12,
    p:[[-30,0],[0,0],[30,0]]};
  const street={id:12,t:"residential",layer:0,widthMeters:7,
    p:[[0,-30],[0,0]]};
  const grades=buildIntersectionGradeModels([bridge,street],[
    {point:[0,0],maxWidth:12,ways:new Set([11,12])}],demoHeight);
  assert.equal(grades.models.length,0);
  assert.equal(grades.byWay.size,0);
});
function quad(road,half){
  const [a,b]=road.p;
  return {...road,a,b,h0:10,h1:10,quad:[
    [a[0],10.072,-half],[b[0],10.072,-half],
    [b[0],10.072,half],[a[0],10.072,half]]};
}
test("Soft curb creates three strips, stays on sidewalk side of asphalt",()=>{
  const road=quad({id:30,t:"residential",widthMeters:8,
    p:[[0,0],[20,0]]},4);
  const walk={...road,curbTop:.18,quad:[
    [0,4],[20,4],[20,6],[0,6]]};
  const faces=[];
  const junctions=[{point:[10,0],ways:new Set([30]),maxWidth:8}];
  const stats=composeRoadsideMeshes([road],[walk],()=>{},
    (wall)=>faces.push(wall),{bevelCurbs:true,junctions});
  assert.ok(stats.curbSegments>=1);
  assert.equal(stats.curbFaces,stats.curbSegments*3);
  assert.equal(stats.curbFaces,faces.length);
  assert.ok(faces.every(w=>w.every(p=>p[2]>=4-1e-7)),
    "Beveled top must never invade the asphalt z<4");
  assert.ok(faces.some(w=>w.some(p=>p[2]>4.07)),
    "Round-over ends a few centimetres INSIDE the sidewalk");
  assert.ok(faces.every(w=>w.every(p=>p.every(Number.isFinite))));
});

test("Straight curb miles away from junctions remain one inexpensive wall",()=>{
  const road=quad({id:31,t:"residential",widthMeters:8,
    p:[[0,0],[20,0]]},4);
  const walk={...road,curbTop:.18,quad:[
    [0,4],[20,4],[20,6],[0,6]]};
  let faces=0;
  const stats=composeRoadsideMeshes([road],[walk],()=>{},()=>faces++,
    {bevelCurbs:true,junctions:[]});
  assert.equal(faces,stats.curbSegments);
  assert.equal(stats.curbFaces,stats.curbSegments);
});
