import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectOSM,ORIGIN} from "../src/grajau-osm.js";
import {createFlatMapWorldSheet,FLAT_GROUND_HEIGHT,
  FLAT_LAYER_CLEARANCE_METRES,flatRoadBase,flatSampleHeight,
  flatBranchMode} from "../src/worldgen-flat-map.js";
import {SHEET_TILE_METRES,sheetTileVertices} from "../src/worldgen-sheet.js";
const near=(a,b,eps=1e-7)=>Math.abs(a-b)<eps;

test("Flat branch boots 1:1 map by default, with opt-out test modes",()=>{
  assert.equal(flatBranchMode(""),true);
  assert.equal(flatBranchMode("?utm_source=chatgpt.com"),true);
  assert.equal(flatBranchMode("?worldgen=flat&debug=worldgen"),true);
  assert.equal(flatBranchMode("?worldgen=stream"),false);
  assert.equal(flatBranchMode("?worldgen=sheet"),false);
  assert.equal(flatBranchMode("?worldgen=legacy"),false);
});
test("OSM coordinate projection preserves one true horizontal metre",()=>{
  const dLon=100/(111320*Math.cos(ORIGIN.lat*Math.PI/180));
  const dLat=100/111132;
  const center=projectOSM(ORIGIN.lat,ORIGIN.lon,ORIGIN);
  const east=projectOSM(ORIGIN.lat,ORIGIN.lon+dLon,ORIGIN);
  const south=projectOSM(ORIGIN.lat-dLat,ORIGIN.lon,ORIGIN);
  assert.ok(near(center[0],0)&&near(center[1],0));
  assert.ok(near(east[0]-center[0],100,.00001));
  assert.ok(near(south[1]-center[1],100,.00001));
});
test("All original street vertices survive flattening exactly, regardless of layer",()=>{
  const roads=[
    {id:"main",n:"Avenida",t:"primary",layer:0,widthMeters:12,
      p:[[0,0],[30,0],[60,0],[80,15]]},
    {id:"branch",n:"Rua",t:"residential",layer:0,widthMeters:7,
      p:[[30,0],[30,25],[30,60]]},
    {id:"bridge",n:"Ponte",t:"primary",bridge:true,layer:1,
      widthMeters:9,p:[[5,5],[20,5],[50,5]]},
    {id:"tunnel",n:"Túnel",t:"primary",tunnel:true,layer:-1,
      widthMeters:8,p:[[5,7],[20,7],[50,7]]}
  ];
  const original=JSON.stringify(roads);
  const sheet=createFlatMapWorldSheet(roads);
  for(const road of roads){
    const sections=sheet.sectionsFor(road);
    assert.ok(sections.length>=road.p.length);
    for(const p of road.p)
      assert.ok(sections.some(s=>
        near(s.p[0],p[0])&&near(s.p[1],p[1])),
        "OSM nodes must not be moved");
    assert.ok(sections.every(s=>s.base===flatRoadBase(road)));
  }
  assert.equal(sheet.roadAt(10,0).base,0);
  assert.equal(flatSampleHeight(999,-999),FLAT_GROUND_HEIGHT);
  assert.equal(flatRoadBase(roads[2]),FLAT_LAYER_CLEARANCE_METRES);
  assert.equal(flatRoadBase(roads[3]),-FLAT_LAYER_CLEARANCE_METRES);
  assert.equal(JSON.stringify(roads),original);
});
test("Planar terrain covers entire streamed world with exactly equal tile edges",()=>{
  const roads=[{id:"a",n:"Rua",t:"residential",widthMeters:7,layer:0,
    p:[[-30,0],[630,0]]}];
  const sheet=createFlatMapWorldSheet(roads);
  const a=sheetTileVertices(-1,0,sheet.tileSample);
  const b=sheetTileVertices(0,0,sheet.tileSample);
  const stride=Math.sqrt(a.length);
  assert.equal(SHEET_TILE_METRES,420);
  assert.ok(a.every(p=>p[1]===0)&&b.every(p=>p[1]===0));
  for(let z=0;z<stride;z++)
    assert.deepEqual(a[z*stride+stride-1],b[z*stride]);
  assert.equal(sheet.height(30,500),0);
  assert.equal(sheet.meshHeight(12,-200),0);
  assert.equal(sheet.stats.flat,true);
});
test("Flat branch loads the SAME snapshot as minimap and skips DEM and repairs",()=>{
  const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  assert.match(main,/const flatWorld=flatBranchMode\(location\.search\)/);
  assert.match(main,/const authoredRoads=flatWorld\?sourceRoads:/);
  assert.match(main,/const \[imported,tiles\]=await Promise\.all/);
  assert.match(main,/flatWorld&&!reliefWorld\?Promise\.resolve\(null\)/);
  assert.match(main,/world = createWorld\(scene,roadData/);
  assert.match(main,/ctx\.strokeStyle = "#627e7d"/);
  assert.match(stream,/const renderRoads=flatWorld\?map\.roads/);
  assert.match(stream,/flatWorld\?createFlatMapWorldSheet/);
  assert.match(stream,/flatLayerSpacing:flatWorld\?5:0/);
  assert.match(terrain,/const grid=sheet\.flatWorld\?1:\s*flatVectorPlan\?52:SHEET_GRID_SEGMENTS/);
});
test("Published Grajaú city OSM snapshot remains the horizontal source of truth",()=>{
  const snapshot=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  assert.ok(snapshot.roads.length>=4500);
  const ids=new Set(snapshot.roads.map(r=>String(r.id)));
  assert.equal(ids.size,snapshot.roads.length);
  assert.ok(snapshot.roads.every(r=>
    Array.isArray(r.p)&&r.p.length>=2&&r.p.every(p=>
      p.length===2&&p.every(Number.isFinite))));
});
