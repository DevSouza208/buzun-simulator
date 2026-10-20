import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { facadeRoadSpawns } from "../src/spawn.js";
import { pointInPolygon } from "../src/geo.js";
import { planPilot } from "../src/facade-recipe.js";
const read=name=>JSON.parse(readFileSync(new URL("../public/data/"+name,import.meta.url),"utf8"));
const base=read("grajau.json");
const spine=read("belmira-marin.json");
const feeders=read("cocaia-corredores.json");
const pilot=read("facade-pilot.json");
const allRoads=[...new Map([...base.roads,...spine.roads,...feeders.roads].map(r=>[r.id,r])).values()];
const segments=allRoads.flatMap(road=>road.p.slice(1).map((p,i)=>({a:road.p[i],b:p,name:road.n,type:road.t})));
const areas=base.buildings.map(b=>b.p.slice(0,-1)).filter(p=>p.length>=3&&p.length<=48);
function collides(x,z) {
  return areas.some(poly=>pointInPolygon(x,z,poly));
}
const footprints=planPilot(base,pilot).map(b=>({
  osmId:b.osmId,label:b.label,preset:b.preset,
  frontMid:b.footprint.center,
}));
test("each of the three mapped facades has a safe road spawn",()=>{
  const spawns=facadeRoadSpawns(footprints,segments,collides);
  assert.equal(spawns.length,3,"All pilot constructions need a nearby road");
  for(const spawn of spawns) {
    assert.ok(!collides(spawn.x,spawn.z), "Spawn must not be inside a mapped building");
    assert.ok(spawn.distanceToFacade>=3.8 && spawn.distanceToFacade<60);
    assert.ok(Number.isFinite(spawn.angle)&&Number.isFinite(spawn.cameraOrbit));
    assert.ok(Math.abs(spawn.cameraOrbit)<=1.5);
  }
});
test("opening street-preview spawns at the Belmira and nearby side streets",()=>{
  const spawns=facadeRoadSpawns(footprints,segments,collides);
  assert.ok(spawns.some(s=>s.street==="Avenida Dona Belmira Marin"));
  assert.ok(spawns.every(s=>Math.abs(s.x)<530&&Math.abs(s.z)<530));
});
test("version label has a parsable increasing patch number",()=>{
  const version=read("version.json");
  assert.match(version.version,/^0\.1\.\d+$/);
  assert.equal(Number(version.version.split(".")[2]),version.patch);
  const page=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  for(const id of ["brand-version","landing-version","footer-version","facade-choice","next-facade"])
    assert.ok(page.includes('id="'+id+'"'),id);
});
