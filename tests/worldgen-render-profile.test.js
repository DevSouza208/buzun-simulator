import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderProfile,renderBatchForPoint,ROAD_RENDER_PROFILE}
  from "../src/worldgen-render-profile.js";
import {drapedSections,coordinateKey} from "../src/draped-road.js";
import {streetUv} from "../src/street-materials.js";
import {tactilePaversForZone} from "../src/tactile-paving.js";
import {buildCurbRampZones} from "../src/curb-ramps.js";
import {distanceToRoadBounds,applyRoadTileLOD,geometryBudget}
  from "../src/worldgen-diagnostics.js";

const bounds={minX:-880,maxX:0,minZ:880,maxZ:1760};
test("Legacy full-city render profile remains EXACTLY as before",()=>{
  const normal=renderProfile(null);
  assert.equal(normal,ROAD_RENDER_PROFILE.complete);
  assert.equal(normal.sampleMetres,5);
  assert.equal(normal.tactileColumns,7);
  assert.equal(normal.tactileRows,2);
  assert.equal(normal.mergeByRegion,false);
});
test("Streaming profile reduces interpolated geometry and tiny tactile dots",()=>{
  const stream=renderProfile(bounds);
  assert.equal(stream,ROAD_RENDER_PROFILE.streaming);
  assert.equal(stream.sampleMetres,9);
  assert.equal(stream.tactileColumns,3);
  assert.equal(stream.tactileRows,1);
  assert.equal(stream.mergeByRegion,true);
});
test("Streaming polygon batches are one 880m rectangle no matter which quarter receives triangles",()=>{
  const top=renderBatchForPoint([-835,900],bounds);
  assert.deepEqual(top,{x:-2,z:2,bounds});
  const far=renderBatchForPoint([-10,1745],bounds);
  assert.deepEqual(far,top);
  const legacy=renderBatchForPoint([-10,1745],null);
  assert.deepEqual(legacy,{x:-1,z:3,bounds:null});
  assert.notDeepEqual(legacy,top);
  assert.equal(legacy.bounds,null);
});
test("LOD distance uses full streaming footprint not mistaken 440m subchunk",()=>{
  assert.equal(distanceToRoadBounds(-200,1500,bounds),0);
  assert.equal(distanceToRoadBounds(-5,1759,bounds),0);
  assert.equal(distanceToRoadBounds(25,1500,bounds,0),25);
  assert.equal(distanceToRoadBounds(200,1500,bounds,25),175);
  const group={visible:true};
  const meshes={asphalt:{visible:true},walk:{visible:true},
    tactile:{visible:true}};
  const budget=geometryBudget({
    asphalt:Array(90).fill(0),walk:Array(90).fill(0),
    tactile:Array(90).fill(0)
  });
  const tile={x:-2,z:2,bounds,group,meshes,budget};
  const nearby=applyRoadTileLOD([tile],-3,1740,{hysteresis:0});
  assert.equal(nearby.visibleTiles,1);
  assert.equal(meshes.asphalt.visible,true);
  assert.equal(meshes.walk.visible,true);
  assert.equal(meshes.tactile.visible,true);
  applyRoadTileLOD([tile],200,1500,{hysteresis:0});
  assert.equal(meshes.asphalt.visible,true);
  assert.equal(meshes.walk.visible,true);
  assert.equal(meshes.tactile.visible,false);
});
test("Both render samplings retain every original OSM centerline coordinate",()=>{
  const roads=[
    [[-36,30],[0,0],[35,15],[39,35]],
    [[-20,-20],[-6,-9],[-3,-9],[8,15],[70,18]]
  ];
  const grade=(x,z)=>22+x*.035-z*.04;
  for(const points of roads){
    const full=drapedSections(points,grade,{step:5,radius:10});
    const stream=drapedSections(points,grade,{step:9,radius:10});
    assert.ok(stream.length<=full.length);
    const keys=new Set(stream.map(s=>coordinateKey(s.p)));
    for(const p of points)
      assert.ok(keys.has(coordinateKey(p)),
        "Every original OSM vertex must survive visual detail reduction");
    for(const s of stream){
      assert.ok(Number.isFinite(s.base));
      assert.ok(Math.abs(s.base-grade(...s.p))<.11);
    }
  }
});
test("Reduced tactile pavers remain inside the verified ramp footprint",()=>{
  const site={id:"demo",roadId:"main",point:[0,0],
    axis:[0,1],normal:[-1,0],widthMeters:8,sidewalkMeters:2.1};
  const zone=buildCurbRampZones([site]).zones[0];
  const full=tactilePaversForZone(zone);
  const light=tactilePaversForZone(zone,{
    countAcross:3,rows:1
  });
  assert.equal(full.length,14);
  assert.equal(light.length,3);
  for(const tile of light)for(const p of tile.polygon){
    const v=[p[0]-site.point[0],p[1]-site.point[1]];
    const along=v[0]*site.axis[0]+v[1]*site.axis[1];
    const into=zone.side*(v[0]*site.normal[0]+
      v[1]*site.normal[1])-site.widthMeters/2;
    assert.ok(Math.abs(along)<zone.flatHalf);
    assert.ok(into>0&&into<zone.depth);
  }
  assert.ok(light.length<full.length/3);
});
test("Real Grajaú: streamer tessellates fewer intervals but retains exact OSM nodes",()=>{
  const raw=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=raw.roads.slice(0,350);
  const grade=(x,z)=>145+x*.013+z*.023+
    .05*Math.sin(x*.025)+.04*Math.cos(z*.016);
  let full=0,stream=0;
  for(const road of roads){
    if(road.p.length<2)continue;
    const fullSections=drapedSections(road.p,grade,{step:5});
    const reducedSections=drapedSections(road.p,grade,{step:9});
    full+=fullSections.length;
    stream+=reducedSections.length;
    const keys=new Set(reducedSections.map(s=>coordinateKey(s.p)));
    for(const p of road.p)
      if(road.p.length>1)assert.ok(keys.has(coordinateKey(p)));
    for(const s of reducedSections)assert.ok(Number.isFinite(s.base));
  }
  assert.ok(stream<full*.8,
    "Regional 9m profile must produce measurably fewer road polygons");
  console.log("[buzun-stream-detail]",JSON.stringify({
    ways:roads.length,baselineSamples:full,
    streamingSamples:stream,
    reductionPercent:+((1-stream/full)*100).toFixed(1)
  }));
});
