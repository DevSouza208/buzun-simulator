import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createFlatVectorRoadPlan} from "../src/worldgen-flat-vector-roads.js";
import {
  ROAD_DETAIL_PRESETS,ROAD_DETAIL_DEFAULT,ROAD_DETAIL_STORAGE_KEY,
  resolveRoadDetail,arcStepsForRoadRadius,isRoadDetail
} from "../src/vector-road-quality.js";

const road=(id,p,widthMeters=12)=>({
  id,p,widthMeters,n:"Avenida Grajaú",t:"primary",layer:0
});
const count=(plan,level,gx=0,gz=0)=>plan.tileTriangles(gx,gz,level).triangles;

test("7.3: ultra is default and query setting overrides stored preference",()=>{
  assert.equal(ROAD_DETAIL_DEFAULT,"ultra");
  assert.equal(resolveRoadDetail(""),"ultra");
  assert.equal(resolveRoadDetail("?utm_source=chatgpt.com",""),"ultra");
  assert.equal(resolveRoadDetail("","economy"),"economy");
  assert.equal(resolveRoadDetail("?detail=balanced","economy"),"balanced");
  assert.equal(resolveRoadDetail("?detail=nope","balanced"),"balanced");
  assert.equal(resolveRoadDetail("?detail=nope","nope"),"ultra");
  assert.equal(isRoadDetail("toString"),false);
  assert.equal(ROAD_DETAIL_STORAGE_KEY,"buzun-road-vector-detail-v1");
  assert.deepEqual(Object.keys(ROAD_DETAIL_PRESETS),
    ["ultra","balanced","economy"]);
});

test("7.3: arc resolutions are strictly ordered for a physically identical curve",()=>{
  for(const radius of [2,5,9]){
    const high=arcStepsForRoadRadius(radius,"ultra"),
      mid=arcStepsForRoadRadius(radius,"balanced"),
      low=arcStepsForRoadRadius(radius,"economy");
    assert.ok(high>mid&&mid>low,JSON.stringify({radius,high,mid,low}));
  }
  assert.equal(arcStepsForRoadRadius(5,"invalid"),
    arcStepsForRoadRadius(5,"ultra"));
});

test("7.3: one city atlas produces three GPU geometries without moving a single OSM point",()=>{
  const source=[
    road("main",[[25,30],[60,30],[60,75]],12),
    road("secondary",[[60,75],[120,75],[140,105]],8)
  ];
  const original=JSON.stringify(source);
  const plan=createFlatVectorRoadPlan(source);
  const ultra=count(plan,"ultra"),
    balanced=count(plan,"balanced"),
    economy=count(plan,"economy");
  assert.ok(ultra>balanced&&balanced>economy,
    JSON.stringify({ultra,balanced,economy}));
  assert.equal(JSON.stringify(source),original);
  assert.equal(plan.stats.sourceWays,2);
  const expected=plan.tileTriangles(0,0,"ultra");
  assert.deepEqual(expected,plan.tileTriangles(0,0));
  assert.equal(expected.layers.asphalt.length%9,0);
  assert.ok(expected.layers.asphalt.every(Number.isFinite));
});

test("7.3: the three mesh representations keep the exact same cross-tile road edges",()=>{
  const plan=createFlatVectorRoadPlan([
    road("shared",[[390,80],[420,80],[450,80]],9)
  ]);
  for(const level of Object.keys(ROAD_DETAIL_PRESETS)){
    const left=plan.tileTriangles(0,0,level),
      right=plan.tileTriangles(1,0,level);
    const seam=(tile,gx)=>{
      const points=tile.layers.asphalt,found=[];
      for(let i=0;i<points.length;i+=3){
        const x=points[i]+(gx+.5)*420,
          z=points[i+2]+210;
        if(Math.abs(x-420)<1e-6)
          found.push(z.toFixed(5));
      }
      return [...new Set(found)].sort();
    };
    assert.deepEqual(seam(left,0),seam(right,1));
    assert.ok(seam(left,0).length>0);
  }
});

test("7.3: UI offers all 3 profiles, persists changes, and streams only selected geometry",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  for(const level of Object.keys(ROAD_DETAIL_PRESETS))
    assert.match(html,new RegExp('name="road-detail" value="'+level+'"'));
  assert.match(html,/id="graphics-button"/);
  assert.match(html,/id="graphics-status"/);
  assert.match(main,/resolveRoadDetail\(location\.search,readSavedRoadDetail\(\)\)/);
  assert.match(main,/localStorage\.setItem\(ROAD_DETAIL_STORAGE_KEY,detail\)/);
  assert.match(main,/world\?\.setRoadDetailLevel\?\.\(detail\)/);
  assert.match(main,/vectorDetail:roadDetailLevel/);
  assert.match(terrain,/tileTriangles\(\s*gx,gz,currentVectorDetail\)/);
  assert.match(terrain,/pendingVectorTiles\.add\(id\)/);
  assert.match(terrain,/rebuildVectorTile\(tiles\.get\(id\),gx,gz\)/);
  assert.match(terrain,/child\.geometry\.dispose\(\)/);
  assert.match(stream,/setRoadDetailLevel:level=>/);
  assert.match(stream,/counters\.vectorPendingTiles=ground\.vectorPendingTiles/);
  assert.match(main,/get\("roads"\)==="raster"\?"raster":"vector"/);
});
