import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {conservativeGroundSupport} from "../src/worldgen-sheet-safety.js";
import {createWorldSheet,SHEET_GRID_STEP_METRES,
  sheetTileVertices} from "../src/worldgen-sheet.js";

const almost=(a,b,eps=.0001)=>Math.abs(a-b)<=eps;
const route=(id,p,widthMeters=7)=>({
  id,p,widthMeters,t:"residential",n:"Rua Teste",layer:0
});

test("6.2: triangle safety collar extends at least one full cell diagonal",()=>{
  const hit={base:28,distance:0,halfWidth:3.5};
  const fullDiagonal=Math.SQRT2*4;
  for(const d of [0,3.5,3.5+fullDiagonal]){
    assert.ok(almost(conservativeGroundSupport(34,
      [{...hit,distance:d}],{step:4}),27.72));
  }
  const release=3.5+fullDiagonal+.35+5.5;
  assert.ok(almost(conservativeGroundSupport(34,
    [{...hit,distance:release}],{step:4}),34));
  assert.equal(conservativeGroundSupport(34,[],{step:4}),34);
});

test("6.2: no 4m raster corner can interpolate a terrain spike through narrow asphalt",()=>{
  const narrow=route("narrow",[[8,1.5],[92,1.5]],3.4);
  const height=()=>30;
  const sheet=createWorldSheet([narrow],height);
  assert.equal(SHEET_GRID_STEP_METRES,4);
  const asphalt=sheet.roadAt(20,1.5).base+.072;
  const fourCorners=[[20,0],[24,0],[20,4],[24,4]]
    .map(([x,z])=>sheet.tileSample(x,z));
  assert.ok(fourCorners.every(h=>h<asphalt-.1));
  // Any barycentric mix of these four heights stays beneath asphalt.
  assert.ok(Math.max(...fourCorners)<asphalt-.1);
  assert.ok(sheet.tileSample(20,26)===height(20,26));
});

test("6.2: land at a real 2-road crossing stays beneath all pavement, not just owner",()=>{
  const a=route("a",[[-40,0],[40,0]],5);
  const b=route("b",[[0,-40],[0,40]],7);
  const elevation=(x,z)=>15+.05*x+.03*z;
  const sheet=createWorldSheet([a,b],elevation);
  const samples=[
    [0,0],[1,1],[2,2],[2,4],[4,2]
  ];
  for(const [x,z]of samples){
    const hits=sheet.roadHits(x,z,Infinity);
    const paved=hits.filter(s=>s.distance<s.halfWidth);
    assert.ok(paved.length,"Point must be within road footprint");
    const minimum=Math.min(...paved.map(s=>s.base+.072));
    assert.ok(sheet.tileSample(x,z)<=minimum-.1,
      "Terrain below every footprint at "+x+","+z);
  }
});

test("6.2: sheet border vertices remain identical with protected raster support",()=>{
  const road=route("border",[[388,0],[450,0]],6);
  const sheet=createWorldSheet([road],(x,z)=>20+.14*z);
  const a=sheetTileVertices(0,0,sheet.tileSample);
  const b=sheetTileVertices(1,0,sheet.tileSample);
  const n=106;
  assert.equal(a.length,n*n);
  for(let j=0;j<n;j++)
    assert.deepEqual(a[j*n+n-1],b[j*n]);
});

test("6.2: physics and render ground sample the same safe field, but not the stable mode",()=>{
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  assert.match(terrain,/sheet\.tileSample\(x,z\)/);
  assert.match(stream,/return worldSheet\.meshHeight\(x,z\)/);
  assert.match(stream,/sheetPreview\?/);
  assert.match(stream,/createCarvedTerrain/);
});
