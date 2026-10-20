import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorldSheet,sheetTileVertices,SHEET_TILE_METRES,
  SHEET_GRID_SEGMENTS,SHEET_GRID_STEP_METRES}
  from "../src/worldgen-sheet.js";
import {buildIntersectionGradeModels} from "../src/intersection-grade.js";
import {coordinateKey} from "../src/draped-road.js";

const close=(a,b,eps=1e-7)=>Math.abs(a-b)<eps;
const avenue=(id,p,more={})=>({
  id,p,n:"Avenida Teste",t:"primary",widthMeters:12,layer:0,...more
});
test("6.0: one deterministic global surface across both neighboring sheet chunks",()=>{
  const natural=(x,z)=>80+.04*x+.01*z+
    Math.cos(x/85)*1.4*Math.sin(z/70);
  const road=avenue("avenue",[[350,30],[420,30],[490,30]]);
  const sheet=createWorldSheet([road],natural);
  const a=sheetTileVertices(0,0,sheet.height);
  const b=sheetTileVertices(1,0,sheet.height);
  const n=SHEET_GRID_SEGMENTS+1;
  assert.equal(SHEET_TILE_METRES,420);
  assert.equal(SHEET_GRID_STEP_METRES,7);
  assert.equal(a.length,n*n);
  for(let z=0;z<n;z++){
    const left=a[z*n+(n-1)],right=b[z*n];
    assert.deepEqual(left,right,"height and X/Z must be exactly equal");
  }
  const negative=sheetTileVertices(-1,0,sheet.height);
  const zero=sheetTileVertices(0,0,sheet.height);
  for(let z=0;z<n;z++)
    assert.deepEqual(negative[z*n+(n-1)],zero[z*n]);
});
test("6.0: continuous draped asphalt floats slightly above solid uncut sheet",()=>{
  const natural=(x,z)=>100+x*.035+3*Math.sin(z/18);
  const road=avenue("a",[[0,0],[100,0]]);
  const sheet=createWorldSheet([road],natural);
  const section=sheet.sectionsFor(road);
  assert.ok(section.length>2);
  const at=sheet.roadAt(50,0);
  assert.ok(at);
  assert.equal(at.roadId,"a");
  assert.ok(sheet.height(50,0)<at.base+.072);
  assert.ok(close(sheet.height(50,0),at.base-.34));
  assert.ok(close(sheet.height(50,40),natural(50,40)));
  // One height authority for driving and rendered road positions.
  const matching=section.find(x=>x.p[0]===50);
  if(matching)assert.ok(close(sheet.roadAt(50,0).base,matching.base));
});
test("6.0: road-shaped influence blends into land; no transparent void or lateral cliff",()=>{
  const natural=(x,z)=>20+.1*z;
  const road=avenue("a",[[0,0],[100,0]]);
  const sheet=createWorldSheet([road],natural);
  const heights=[0,2,4,6,8,12,16,20,24].map(z=>sheet.height(50,z));
  assert.ok(heights.every(Number.isFinite));
  assert.ok(close(heights.at(-1),natural(50,24)));
  assert.ok(Math.abs(heights[4]-heights[5])<4);
  assert.ok(Math.abs(heights[5]-heights[6])<4);
  // Independent of the current chunk or background load order.
  assert.equal(sheet.height(50,8),sheet.height(50,8));
});
test("6.0: tunnels and bridges cannot deform the ground underneath",()=>{
  const natural=(x,z)=>10+.01*x;
  const elevated=avenue("bridge",[[0,0],[60,0]],{layer:1,bridge:true});
  const buried=avenue("tunnel",[[0,0],[60,0]],{layer:-1,tunnel:true});
  const sheet=createWorldSheet([elevated,buried],natural);
  assert.equal(sheet.roadAt(30,0),null);
  assert.equal(sheet.height(30,0),natural(30,0));
});
test("6.0: junction grade authority reused between two crossing roads",()=>{
  const natural=(x,z)=>20+.08*x+.02*z;
  const main=avenue("main",[[0,0],[60,0],[120,0]]);
  const side=avenue("side",[[60,-60],[60,0],[60,60]],
    {n:"Rua Lateral",t:"residential",widthMeters:7});
  const junction={point:[60,0],ways:new Set(["main","side"]),
    maxWidth:12};
  const gradeModels=buildIntersectionGradeModels([main,side],[junction],natural);
  const sheet=createWorldSheet([main,side],natural,{
    fixedJunctions:new Set([coordinateKey(junction.point)]),
    gradeModels
  });
  const a=sheet.sectionsFor(main).find(s=>s.p[0]===60);
  const b=sheet.sectionsFor(side).find(s=>s.p[0]===60&&s.p[1]===0);
  assert.ok(a&&b);
  assert.ok(close(a.base,b.base));
  assert.ok(close(sheet.roadAt(60,0).base,a.base));
});
test("6.0: integration remains opt-in and old worldgen unaffected",()=>{
  const world=readFileSync(new URL("../src/world.js",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const mesh=readFileSync(new URL(
    "../src/city-road-mesh.js",import.meta.url),"utf8");
  assert.match(main,/get\("worldgen"\)==="sheet"/);
  assert.match(world,/sheetPreview:options.sheetPreview===true/);
  assert.match(stream,/sheetPreview=false/);
  assert.match(stream,/createSheetTerrain\(scene,worldSheet,bounds\)/);
  assert.match(mesh,/worldSheet.sectionsFor\(road\)/);
  assert.doesNotMatch(terrain,/alphaMap:|alphaTest:|createMask\(/);
});
