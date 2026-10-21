import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  emptyVectorEdits,normalizeVectorEdits,saveVectorEdits,loadVectorEdits,
  withVectorVertexOffset,moveVectorEdge,applyVisualVectorEdits,
  createVectorElevationField
} from "../src/worldgen-vector-edit-model.js";
import {createFlatVectorRoadPlan} from "../src/worldgen-flat-vector-roads.js";
const road=(id,p)=>({id,p,n:"Rua",layer:0,widthMeters:8,t:"residential"});
const original=[
  road("123",[[10,10],[50,10],[100,20]]),
  road("456",[[50,10],[50,100]])
];
test("7.4: editor edits the visual vector, NEVER the OSM original",()=>{
  const snapshot=JSON.stringify(original);
  const edits=withVectorVertexOffset(emptyVectorEdits(),
    original[0],1,3,2,1.5);
  assert.deepEqual(applyVisualVectorEdits(original,edits)[0].p,
    [[10,10],[53,12],[100,20]]);
  assert.deepEqual(applyVisualVectorEdits(original,edits)[1],
    original[1]);
  assert.equal(JSON.stringify(original),snapshot);
});
test("7.4: dragging an edge moves exactly its two vertices, in metres",()=>{
  const old=withVectorVertexOffset(emptyVectorEdits(),
    original[0],1,2,0,.5);
  const next=moveVectorEdge(old,original[0],1,-2,4,1);
  assert.deepEqual(next.ways["123"].vertices["1"],[0,4,1.5]);
  assert.deepEqual(next.ways["123"].vertices["2"],[-2,4,1]);
  assert.equal(next.ways["123"].vertices["0"],undefined);
  assert.throws(()=>moveVectorEdge(old,original[0],9,0,0),
    /Aresta inválida/);
});
test("7.4: JSON edits are sparse, sanitized, versioned and reversible",()=>{
  const store=new Map(),storage={
    getItem:key=>store.get(key)||null,
    setItem:(key,value)=>store.set(key,value)
  };
  const edited=withVectorVertexOffset(emptyVectorEdits(),
    original[0],0,0,1,0);
  saveVectorEdits(edited,storage);
  assert.deepEqual(loadVectorEdits(storage),edited);
  const restored=withVectorVertexOffset(edited,original[0],0,0,0,0);
  assert.deepEqual(restored,emptyVectorEdits());
  assert.deepEqual(normalizeVectorEdits({
    ways:{123:{vertices:{"0":[999,0,0],"1":[1,2,3]}},
      malformed:{vertices:{"3":["bad",1,1]}}}
  }).ways,{"123":{vertices:{"1":[1,2,3]}}});
});
test("7.4: elevation adjustment bends shared ground and road continuously",()=>{
  const anchor=withVectorVertexOffset(emptyVectorEdits(),
    original[0],1,0,0,2);
  const field=createVectorElevationField(
    (x,z)=>10+x*.01,original,anchor);
  assert.equal(field.anchorCount,1);
  assert.ok(Math.abs(field.sample(50,10)-12.5)<1e-8);
  assert.ok(field.sample(54,10)>10.54);
  assert.equal(field.sample(70,10),10.7);
  assert.equal(field.sample(50,29),10.5);
  const model=createFlatVectorRoadPlan(original,{
    sampleHeight:field.sample});
  const tri=model.tileTriangles(0,0,"economy");
  assert.ok(tri.layers.asphalt.some((y,i)=>i%3===1&&y>12));
  assert.equal(model.stats.elevated,true);
});
test("7.4: real relief divides long 1:1 edges into draped sections",()=>{
  const roads=[road("a",[[0,0],[40,0]])];
  const flat=createFlatVectorRoadPlan(roads),
    raised=createFlatVectorRoadPlan(roads,{
      sampleHeight:x=>Math.sin(x*.1)*3,reliefSampleMetres:4});
  assert.equal(flat.stats.segments,1);
  assert.equal(raised.stats.segments,1,
    "OSM segments remain global; only visible LOD is subdivided");
  const ultra=raised.tileTriangles(0,0,"ultra"),
    balanced=raised.tileTriangles(0,0,"balanced"),
    economy=raised.tileTriangles(0,0,"economy");
  assert.ok(ultra.triangles>balanced.triangles);
  assert.ok(balanced.triangles>economy.triangles);
  const positions=economy.layers.asphalt;
  const ys=positions.filter((_,i)=>i%3===1);
  assert.ok(new Set(ys.map(v=>v.toFixed(3))).size>5);
  assert.ok(ys.every(Number.isFinite));
});
test("7.4: terrain, vector and vehicle refer to a single global height source",()=>{
  const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const admin=readFileSync(new URL("../src/road-admin.js",import.meta.url),"utf8");
  assert.match(main,/reliefWorld=flatWorld&&/);
  assert.match(main,/vectorEdits:loadVectorEdits\(\)/);
  assert.match(stream,/const surfaceHeight=elevationField\?\.sample\|\|null/);
  assert.match(stream,/tileSample:surfaceHeight,flatWorld:false/);
  assert.match(stream,/sampleHeight:surfaceHeight/);
  assert.match(stream,/if\(surfaceHeight\)\{/);
  assert.match(terrain,/flatVectorPlan\?52:SHEET_GRID_SEGMENTS/);
  assert.match(html,/data-admin-tool="vertex"/);
  assert.match(html,/data-admin-tool="edge"/);
  assert.match(admin,/e\.shiftKey/);
  assert.match(admin,/withVectorVertexOffset\(drag\.original/);
  assert.match(admin,/moveVectorEdge\(drag\.original/);
  assert.match(admin,/saveVectorEdits\(vectorEdits\)/);
});
