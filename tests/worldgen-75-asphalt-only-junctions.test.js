import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createFlatVectorRoadPlan}
  from "../src/worldgen-flat-vector-roads.js";
import {unionVectorAsphaltTriangles}
  from "../src/worldgen-vector-asphalt-union.js";
import {createWorldSheet} from "../src/worldgen-sheet.js";
const road=(id,p,widthMeters=8,extra={})=>
  ({id,p,widthMeters,n:"OSM",t:"residential",layer:0,...extra});
function triangleArea(a,b,c){
  return Math.abs((b[0]-a[0])*(c[2]-a[2])-
    (b[2]-a[2])*(c[0]-a[0]))/2;
}
function surfaceArea(positions){
  let sum=0;
  for(let i=0;i<positions.length;i+=9){
    const a=positions.slice(i,i+3),
      b=positions.slice(i+3,i+6),
      c=positions.slice(i+6,i+9);
    sum+=triangleArea(a,b,c);
  }
  return sum;
}
test("7.5: roads no longer render any sidewalk or curb polygons",()=>{
  const ways=[
    road("a",[[10,80],[110,80]],11),
    road("b",[[65,30],[65,130]],7)
  ];
  const plan=createFlatVectorRoadPlan(ways,{asphaltOnly:true});
  for(const detail of ["ultra","balanced","economy"]){
    const result=plan.tileTriangles(0,0,detail);
    assert.equal(result.layers.sidewalk.length,0);
    assert.equal(result.layers.curb.length,0);
    assert.ok(result.layers.asphalt.length>0);
    assert.ok(result.unionStats.inputTriangles>0);
    assert.ok(result.unionStats.overlaps>0);
    assert.equal(result.triangles,
      result.layers.asphalt.length/9);
  }
  assert.equal(plan.stats.asphaltOnly,true);
});
test("7.5: boolean subtraction yields exactly ONE painted footprint at crossing",()=>{
  const patches=[
    {roadId:"north-south",priority:40,vertices:[
      [0,.075,0],[10,.075,0],[0,.075,10]
    ]},
    {roadId:"east-west",priority:30,vertices:[
      [0,.075,0],[10,.075,0],[10,.075,10]
    ]}
  ];
  const result=unionVectorAsphaltTriangles(patches);
  assert.equal(result.stats.inputTriangles,2);
  assert.ok(Math.abs(surfaceArea(result.positions)-75)<1e-6,
    "Two triangles overlap by 25m²; their union covers 75m²");
  assert.ok(result.stats.overlaps>0);
  const original=unionVectorAsphaltTriangles([patches[0]]);
  assert.ok(Math.abs(surfaceArea(original.positions)-50)<1e-6);
});
test("7.5: T junction samples one shared elevation field even after booleans",()=>{
  const ways=[
    road("main",[[5,50],[105,50]],10),
    road("side",[[55,50],[55,115]],7)
  ],sampleHeight=(x,z)=>.02*x+.03*z;
  const plan=createFlatVectorRoadPlan(ways,{
    asphaltOnly:true,sampleHeight
  });
  const positions=plan.tileTriangles(0,0,"economy").layers.asphalt;
  assert.ok(positions.length>0);
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i]+210,z=positions[i+2]+210;
    const expect=sampleHeight(x,z)+.22;
    assert.ok(Math.abs(positions[i+1]-expect)<.002,
      "The crossing has no independently sampled road elevation");
  }
});
test("7.5: no sidewalks in sheet height support or regional compositor",()=>{
  const ways=[road("a",[[0,0],[150,0]])];
  const sheet=createWorldSheet(ways,()=>0,{
    asphaltOnly:true,blendMetres:10
  });
  const near=sheet.roadAt(30,0);
  assert.ok(near);
  assert.equal(near.walk,0);
  const game=readFileSync(new URL("../src/city-world-stream.js",import.meta.url),"utf8");
  const mesh=readFileSync(new URL("../src/city-road-mesh.js",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
  assert.match(game,/asphaltOnly\s*\}/);
  assert.match(game,/noSidewalks:asphaltOnly/);
  assert.match(mesh,/if\(!noSidewalks&&/);
  assert.match(mesh,/const roadsideInput=noSidewalks\?\[\]:/);
  assert.match(main,/get\("sidewalks"\)!=="on"/);
});
test("7.5: normal 7.4 mode still available for comparison",()=>{
  const ways=[road("a",[[0,30],[100,30]])];
  const old=createFlatVectorRoadPlan(ways);
  const legacy=old.tileTriangles(0,0);
  assert.ok(legacy.layers.sidewalk.length>0);
  assert.ok(legacy.layers.curb.length>0);
  assert.equal(legacy.unionStats,null);
  assert.equal(old.stats.asphaltOnly,false);
});
