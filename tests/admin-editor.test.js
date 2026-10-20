import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyEdits,normalizeEdits,applyRoadEdits,withWidth,withNode,
  withoutWayEdits,saveEdits,readSavedEdits,editStats,EDITS_STORAGE_KEY
} from "../src/road-editor-model.js";
import {sidewalkWidth} from "../src/road-corridor.js";

const streets=[
  {id:12,n:"Rua A",t:"residential",widthMeters:7,nodeIds:[100,101,102],
    p:[[0,0],[10,0],[20,0]]},
  {id:24,n:"Rua B",t:"residential",widthMeters:7,nodeIds:[101,200],
    p:[[10,0],[10,10]]},
  {id:50,n:"Rua sem IDs",t:"service",widthMeters:5,
    p:[[50,0],[60,0]]}
];

test("editor starts with original OSM geography and shared junctions intact",()=>{
  const output=applyRoadEdits(streets,emptyEdits());
  assert.equal(output[0],streets[0]);
  assert.equal(output[1],streets[1]);
  assert.deepEqual(output[0].p[1],output[1].p[0]);
});
test("changing asphalt width and sidewalk overrides world generation on selected way",()=>{
  const edits=withWidth(emptyEdits(),12,10.4,2.3);
  const output=applyRoadEdits(streets,edits);
  assert.equal(output[0].widthMeters,10.4);
  assert.equal(output[0].widthSource,"buzun:editor");
  assert.equal(sidewalkWidth(output[0]),2.3);
  assert.equal(output[1],streets[1]);
  assert.equal(streets[0].widthMeters,7);
  assert.deepEqual(editStats(edits),{widths:1,nodes:0});
});
test("moving common OSM node updates both roads and never mutates raw snapshot",()=>{
  const edits=withNode(emptyEdits(),streets[0],1,[12.5,-2.1]);
  const out=applyRoadEdits(streets,edits);
  assert.deepEqual(out[0].p[1],[12.5,-2.1]);
  assert.deepEqual(out[1].p[0],[12.5,-2.1]);
  assert.deepEqual(streets[0].p[1],[10,0]);
  assert.equal(editStats(edits).nodes,1);
});
test("legacy ways without shared OSM IDs use way-scoped vertex overrides",()=>{
  const edits=withNode(emptyEdits(),streets[2],1,[64,2]);
  assert.deepEqual(applyRoadEdits(streets,edits)[2].p[1],[64,2]);
  assert.equal(edits.localNodes["50:1"][0],64);
});
test("reverting a way removes the selected way override and corresponding node edits",()=>{
  let edits=withWidth(emptyEdits(),12,12,2.5);
  edits=withNode(edits,streets[0],1,[9,2]);
  edits=withoutWayEdits(edits,streets[0]);
  assert.deepEqual(editStats(edits),{widths:0,nodes:0});
  assert.equal(applyRoadEdits(streets,edits)[0],streets[0]);
});
test("import rejects unsafe or malformed JSON data",()=>{
  assert.throws(()=>normalizeEdits({version:3,widths:{},nodes:{}}));
  assert.throws(()=>withWidth(emptyEdits(),12,100,2));
  assert.throws(()=>withWidth(emptyEdits(),12,10,0));
  assert.throws(()=>withNode(emptyEdits(),streets[0],1,[Infinity,0]));
  const normalized=normalizeEdits({version:1,widths:{"12":{widthMeters:8.2,sidewalkMeters:1.7},
      naughty:{widthMeters:900}},nodes:{"101":[5,6],"bad":[1,2]},
      localNodes:{"50:1":[60,2]},unexpected:"ignored"});
  assert.equal(Object.keys(normalized.widths).length,1);
  assert.equal(Object.keys(normalized.nodes).length,1);
  assert.equal(Object.keys(normalized.localNodes).length,1);
  assert.equal(normalized.unexpected,undefined);
});
test("edits save and reload on browser-like localStorage without network access",()=>{
  const storage=new Map();
  const fake={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  const edits=withWidth(emptyEdits(),12,6.2,1.4);
  saveEdits(edits,fake);
  assert.ok(storage.has(EDITS_STORAGE_KEY));
  assert.deepEqual(readSavedEdits(fake),edits);
});
