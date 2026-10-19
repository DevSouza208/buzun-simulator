import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleHeight, heightGradient, heightAlongHeading, TERRAIN_MODE } from "../src/terrain.js";
import { FACADE_PRESETS, footprintInfo, planPilot } from "../src/facade-recipe.js";
const load = name => JSON.parse(readFileSync(new URL("../public/data/"+name,import.meta.url),"utf8"));
const data=load("grajau.json"),pilot=load("facade-pilot.json");
test("relief is explicitly approximate and fades into external flat map",()=>{
 assert.equal(TERRAIN_MODE,"preview");
 assert.equal(sampleHeight(0,0),0);
 for(const coords of [[630,0],[0,-900],[4000,200]]) assert.equal(sampleHeight(...coords),0);
 assert.ok(Math.abs(sampleHeight(110,170))>0.1);
});
test("height gradients and vehicle pitch remain gentle and finite",()=>{
 for(let x=-570;x<580;x+=70)for(let z=-570;z<580;z+=70) {
  const g=heightGradient(x,z);
  assert.ok(Number.isFinite(g.dx)&&Number.isFinite(g.dz));
  assert.ok(Math.abs(g.dx)<0.10&&Math.abs(g.dz)<0.10);
  const pitch=heightAlongHeading(x,z,.3);
  assert.ok(Number.isFinite(pitch)&&Math.abs(pitch)<.14);
 }
});
test("three pilot ids are real OSM buildings, not fabricated assets",()=>{
 assert.equal(pilot.buildings.length,3);
 const ids=new Set(pilot.buildings.map(b=>b.osmId));
 assert.equal(ids.size,3);
 const plans=planPilot(data,pilot);
 assert.equal(plans.length,3);
 for(const plan of plans) {
  assert.ok(plan.footprint.area>40);
  assert.ok(plan.footprint.points.length>=3);
  assert.ok(Number.isFinite(plan.footprint.center[0]));
  assert.ok(plan.osmId===plan.building.id);
  assert.ok(plan.label.length>0);
 }
});
test("all presets are supported and documented as demonstrations",()=>{
 assert.deepEqual(pilot.buildings.map(b=>b.preset),["casa_portao","comercio","sobrado"]);
 for(const b of pilot.buildings)assert.ok(FACADE_PRESETS[b.preset]);
 assert.match(pilot.disclaimer,/demonstra/);
 assert.equal(pilot.sources.photos,"nenhuma API de fotografias foi usada");
});
test("footprint ignores zero-area polygons",()=>{
 assert.equal(footprintInfo({p:[[0,0],[1,0],[2,0],[0,0]]}),null);
});
