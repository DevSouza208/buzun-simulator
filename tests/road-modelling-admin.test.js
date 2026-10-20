import test from "node:test";
import assert from "node:assert/strict";
import {emptyEdits,withWidth,withMeshProfile,applyRoadEdits,normalizeEdits,
  withoutWayEdits,meshEditCount} from "../src/road-editor-model.js";
import {visibleCurbIntervals,sidewalkWidth} from "../src/road-corridor.js";

const road={id:321,t:"residential",n:"Rua modelo",widthMeters:7,
  nodeIds:[10,11],p:[[0,0],[12,0]]};
test("3D model overrides preserve the original OSM centerline and geometry IDs",()=>{
  let edits=withWidth(emptyEdits(),321,8.8,2.2);
  edits=withMeshProfile(edits,321,.09,1.5);
  const [out]=applyRoadEdits([road],edits);
  assert.deepEqual(out.p,road.p);
  assert.deepEqual(out.nodeIds,road.nodeIds);
  assert.equal(road.widthMeters,7);
  assert.equal(out.widthMeters,8.8);
  assert.equal(sidewalkWidth(out),2.2);
  assert.equal(out.curbHeightMeters,.09);
  assert.equal(out.cornerClearanceMeters,1.5);
  assert.equal(meshEditCount(edits),2);
});
test("Corner recess trims curb ends more aggressively without deleting whole curb",()=>{
  const cross={id:888,layer:0,a:[0,-20],b:[0,20],halfWidth:3.5};
  const base=visibleCurbIntervals([-12,4],[12,4],road,[cross]);
  const edited=visibleCurbIntervals([-12,4],[12,4],
    {...road,cornerClearanceMeters:2},[cross]);
  assert.equal(base.length,2);
  assert.equal(edited.length,2);
  assert.ok(edited[0][1]<base[0][1]);
  assert.ok(edited[1][0]>base[1][0]);
});
test("Restore model parameters without deleting original OSM points",()=>{
  let edits=withWidth(emptyEdits(),321,9,3);
  edits=withMeshProfile(edits,321,.2,2);
  edits=withoutWayEdits(edits,road);
  const [restored]=applyRoadEdits([road],edits);
  assert.equal(restored,road);
  assert.equal(meshEditCount(edits),0);
});
test("Old patch JSON remains backward compatible with 3D editor",()=>{
  const old={version:1,widths:{"321":{widthMeters:8,sidewalkMeters:1.8}},
    nodes:{},localNodes:{}};
  const normalized=normalizeEdits(old);
  assert.deepEqual(normalized.profiles,{});
  assert.equal(applyRoadEdits([road],normalized)[0].widthMeters,8);
});
test("Reject unsafe 3D modelling parameters in imported editor patches",()=>{
  let normalized=normalizeEdits({version:1,widths:{},nodes:{},localNodes:{},
    profiles:{"321":{curbHeightMeters:100,cornerClearanceMeters:200}}});
  assert.deepEqual(normalized.profiles,{});
  assert.throws(()=>withMeshProfile(emptyEdits(),321,3,.1));
  assert.throws(()=>withMeshProfile(emptyEdits(),321,.1,-1));
});
