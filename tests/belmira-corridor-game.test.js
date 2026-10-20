import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {configureTerrain,sampleHeight,getTerrainMode} from "../src/terrain.js";
import {segmentProjection} from "../src/geo.js";
const load=name=>JSON.parse(readFileSync(new URL("../public/data/"+name,import.meta.url),"utf8"));
const corridor=load("belmira-corridor.json"),dem=load("belmira-elevation.json");

test("corridor uses two verified address landmarks and authentic OSM Habibs footprint",()=>{
  const mc=corridor.landmarks.find(l=>l.key==="mcdonalds");
  const hb=corridor.landmarks.find(l=>l.key==="habibs");
  assert.ok(mc&&hb);
  assert.equal(mc.buildingId,null,"Do not invent exact McDonalds building match");
  assert.equal(hb.buildingId,619054945);
  assert.ok(corridor.buildings.some(b=>b.id===hb.buildingId&&b.n==="Habib's"));
  assert.ok(corridor.routeLengthMeters>900&&corridor.routeLengthMeters<1600);
});
test("real mapped sidewalks, corners and side-road entries are present",()=>{
  assert.ok(corridor.roads.length>=35);
  assert.ok(corridor.buildings.length>=500);
  const main=corridor.roads.filter(r=>r.n==="Avenida Dona Belmira Marin");
  const lateral=corridor.roads.filter(r=>r.n!=="Avenida Dona Belmira Marin");
  assert.ok(main.length>=8);
  assert.ok(lateral.length>=10);
  assert.ok(lateral.some(r=>r.n));
  const all=corridor.roads.flatMap(r=>r.p);
  assert.ok(all.every(p=>p.length===2 && p.every(Number.isFinite)));
});
test("baked SRTM grid has valid geometry and higher McDonald's than Habib's",()=>{
  assert.equal(dem.dataset,"srtm30m");
  assert.equal(dem.heights.length,dem.grid.nx*dem.grid.nz);
  configureTerrain(dem);
  assert.equal(getTerrainMode(),"srtm30m");
  const mc=corridor.landmarks.find(l=>l.key==="mcdonalds");
  const hb=corridor.landmarks.find(l=>l.key==="habibs");
  const m=sampleHeight(...mc.xy),h=sampleHeight(...hb.xy);
  assert.ok(Number.isFinite(m)&&Number.isFinite(h));
  assert.ok(m-h>25 && m-h<75,"McDonalds-to-Habibs must descend according to SRTM");
  assert.equal(sampleHeight(3000,3000),0,"Outside the DEM zone remains flat");
  configureTerrain(null);
});
test("each site geocodes near the modeled street, never on an invented line",()=>{
  const avenues=corridor.roads.filter(r=>r.n==="Avenida Dona Belmira Marin");
  for(const loc of corridor.landmarks){
    const distance=Math.min(...avenues.flatMap(r=>r.p.slice(1).map((b,i)=>segmentProjection(...loc.xy,r.p[i],b).distance)));
    assert.ok(distance<8,loc.key+" is too far from OSM avenue");
  }
});
