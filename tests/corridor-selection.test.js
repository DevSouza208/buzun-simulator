import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildRoadCorridor,collectSideEntrances,makeBelmiraSelection} from "../src/corridor.js";
const load=name=>JSON.parse(readFileSync(new URL("../public/data/"+name,import.meta.url),"utf8"));
const source=load("belmira-marin.json");
const base=load("grajau.json");
const feeders=load("cocaia-corredores.json");
const selection=load("belmira-selection.json");
const enriched=load("belmira-corridor.json");
const anchors={from:selection.selection.start,to:selection.selection.end};

test("exact street-number endpoints snap onto the real main street",()=>{
 const result=buildRoadCorridor(source.roads,anchors.from,anchors.to,base.origin);
 assert.ok(result.lengthMeters>1100&&result.lengthMeters<1250);
 assert.ok(result.start.snapErrorMeters<4&&result.end.snapErrorMeters<4);
 assert.equal(result.points.length,60);
 const dx=result.points[0][0]-selection.selection.routePoints[0][0];
 const dz=result.points[0][1]-selection.selection.routePoints[0][1];
 assert.ok(Math.hypot(dx,dz)<.1);
 assert.ok(Math.abs(result.lengthMeters-selection.selection.lengthMeters)<.5);
});
test("we saved true lateral street entrances and not invented connections",()=>{
 const all=[...new Map([...base.roads,...source.roads,...feeders.roads].map(w=>[w.id,w])).values()];
 const generated=collectSideEntrances(all,selection.selection.routePoints,50);
 assert.ok(generated.length>=15);
 const real=new Set(all.map(w=>w.id));
 for(const fragment of selection.sideEntrances){
   assert.ok(real.has(fragment.id),String(fragment.id));
   assert.notEqual(fragment.n,"Avenida Dona Belmira Marin");
   assert.ok(fragment.p.length>=2);
 }
 assert.equal(generated.length,selection.sideEntrances.length);
});
test("enriched OSM city blocks remain available and unmodified",()=>{
 assert.ok(enriched.buildings.length>=500);
 assert.ok(enriched.roads.length>=35);
 assert.ok(enriched.landmarks.some(p=>p.key==="mcdonalds"));
 assert.ok(enriched.landmarks.some(p=>p.key==="habibs"));
 assert.equal(selection.facadeStatus,"not_generated");
});
test("real DEM samples are documented but intentionally not applied",()=>{
 assert.equal(selection.elevation.dataset,"SRTM30m");
 assert.equal(selection.elevation.status,"sampled_not_applied");
 assert.ok(selection.elevation.startMeters>selection.elevation.endMeters);
});
test("generator deterministically rebuilds the saved route and intersecting side roads",()=>{
 const all=[...new Map([...base.roads,...source.roads,...feeders.roads].map(w=>[w.id,w])).values()];
 const regenerated=makeBelmiraSelection(all,source.roads,anchors,base.origin);
 assert.equal(regenerated.selection.lengthMeters,selection.selection.lengthMeters);
 assert.equal(regenerated.sideEntrances.length,selection.sideEntrances.length);
 assert.equal(regenerated.selection.routePoints.length,selection.selection.routePoints.length);
});
