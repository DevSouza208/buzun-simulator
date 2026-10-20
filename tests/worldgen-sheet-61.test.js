import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorldSheet,SHEET_GRID_SEGMENTS,SHEET_GRID_STEP_METRES}
  from "../src/worldgen-sheet.js";

const near=(a,b,epsilon=.0001)=>Math.abs(a-b)<=epsilon;
const road=(id,points,width=12)=>({
  id,p:points,n:"Via Teste",t:"primary",widthMeters:width,layer:0
});

test("6.1: ground passes continuously from asphalt into walkway and grass",()=>{
  const height=(x,z)=>24+.025*z;
  const way=road("main",[[0,0],[120,0]]);
  const sheet=createWorldSheet([way],height);
  const here=z=>sheet.height(60,z),base=sheet.roadAt(60,0).base;
  const outer=6+2.1;
  assert.ok(near(here(0),base-.16));
  assert.ok(near(here(6),base-.16));
  assert.ok(near(here(outer),base+.18-.045));
  assert.ok(near(here(outer+9),height(60,outer+9)));
  for(const edge of [6,outer,outer+9]){
    assert.ok(Math.abs(here(edge-.0001)-here(edge+.0001))<.002,
      "Terrain must not jump at "+edge+"m");
  }
  for(let d=0;d<20;d+=.2)assert.ok(Number.isFinite(here(d)));
});
test("6.1: at a confirmed junction both ground-level arms support the same sheet",()=>{
  const height=()=>20;
  const main=road("main",[[0,0],[60,0],[120,0]]);
  const side=road("side",[[60,-60],[60,0],[60,60]],7);
  const junction={point:[60,0],ways:new Set(["main","side"])};
  const connected=createWorldSheet([main,side],height,{
    junctions:[junction]
  });
  const withoutJunction=createWorldSheet([main,side],height);
  const x=67,z=5.5;
  const hits=connected.roadHits(x,z);
  assert.equal(hits.length,2);
  assert.ok(connected.height(x,z)>withoutJunction.height(x,z)+.01,
    "Shared OSM junction should reconcile both slope envelopes");
  assert.ok(connected.height(x,z)<=20-.12+.00001,
    "Averaging sidewalks must not lift the ground through the asphalt");
});
test("6.1: near parallel roads do NOT fuse without actual OSM junction",()=>{
  const a=road("main",[[0,0],[120,0]]);
  const b=road("parallel",[[0,9],[120,9]]);
  const natural=()=>20;
  const combined=createWorldSheet([a,b],natural);
  const primary=createWorldSheet([a],natural);
  assert.equal(combined.roadHits(60,4).length,2);
  assert.ok(near(combined.height(60,4),primary.height(60,4)));
  assert.equal(combined.roadAt(60,4).roadId,"main");
});
test("6.1: identical 5m tile borders and reduced active tile budget",()=>{
  assert.equal(SHEET_GRID_SEGMENTS,84);
  assert.equal(SHEET_GRID_STEP_METRES,5);
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const city=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  assert.match(terrain,/visibilityRadius=900,maxActive=32/);
  assert.match(city,/junctions:globalJunctions/);
});
