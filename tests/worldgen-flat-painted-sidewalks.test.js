import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createFlatAsphaltPlan,
  FLAT_ASPHALT_COLOR,FLAT_SIDEWALK_COLOR,FLAT_CURB_COLOR,
  FLAT_CURB_BORDER_METRES}
  from "../src/worldgen-flat-asphalt-surface.js";
import {sidewalkWidth} from "../src/road-corridor.js";

const way=(id,p,widthMeters=8,other={})=>
  ({id,p,widthMeters,t:"residential",n:"Rua OSM",layer:0,...other});
const makeSpy=()=>{
  const strokes=[];
  const ctx={lineJoin:"",lineCap:"",lineWidth:0,strokeStyle:"",
    beginPath(){this.path=[]},
    moveTo(x,z){this.path.push([x,z])},
    lineTo(x,z){this.path.push([x,z])},
    stroke(){strokes.push({color:this.strokeStyle,
      width:this.lineWidth,points:this.path})},
    fillRect(){}};
  return {ctx,strokes};
};
test("7.1.1: sidewalks, curb ring, THEN full asphalt across entire junction",()=>{
  const avenue=way("a",[[0,0],[60,0]],12,{t:"primary"});
  const transverse=way("b",[[30,-30],[30,0],[30,30]],7);
  const plan=createFlatAsphaltPlan([avenue,transverse]);
  const {ctx,strokes}=makeSpy();
  const res=plan.drawTile(ctx,0,0);
  assert.equal(res.painted,2);
  assert.equal(res.footwaysPainted,2);
  assert.equal(strokes.length,6);
  assert.deepEqual(strokes.map(s=>s.color),[
    FLAT_SIDEWALK_COLOR,FLAT_SIDEWALK_COLOR,
    FLAT_CURB_COLOR,FLAT_CURB_COLOR,
    FLAT_ASPHALT_COLOR,FLAT_ASPHALT_COLOR
  ]);
  const scale=768/420;
  assert.equal(strokes[0].width/scale,12+2*sidewalkWidth(avenue));
  assert.equal(strokes[1].width/scale,7+2*sidewalkWidth(transverse));
  assert.equal(strokes[2].width/scale,12+2*FLAT_CURB_BORDER_METRES);
  assert.equal(strokes[4].width/scale,12);
  assert.equal(strokes[5].width/scale,7);
});
test("7.1.1: index includes sidewalk width across a 420m texture boundary",()=>{
  // Asphalt begins after x=420 but sidewalk extends into previous tile.
  const r=way("edge",[[425,40],[425,100]],7);
  const plan=createFlatAsphaltPlan([r]);
  assert.deepEqual(plan.waysForTile(0,0).map(x=>x.id),["edge"]);
  assert.deepEqual(plan.waysForTile(1,0).map(x=>x.id),["edge"]);
  const a=makeSpy(),b=makeSpy();
  plan.drawTile(a.ctx,0,0);
  plan.drawTile(b.ctx,1,0);
  assert.equal(a.strokes.length,3);
  assert.equal(b.strokes.length,3);
  // Identical global way points on both sides; only tile origin differs.
  assert.equal(a.strokes[0].points[0][0]-
    b.strokes[0].points[0][0],768);
});
test("7.1.1: the huge 3D sidewalk wedges cannot be emitted at ground level",()=>{
  const scene=readFileSync(new URL("../src/city-road-mesh.js",import.meta.url),"utf8");
  const source=readFileSync(new URL("../src/city-world-stream.js",import.meta.url),"utf8");
  assert.match(source,/flatPaintedRoadside:flatAnyRoad/);
  assert.match(scene,/if\\(!noSidewalks&&\\s*\\(!flatPaintedRoadside\\|\\|physicalLayer\\(road\\)!==0\\)\\)/);
  assert.match(scene,/flatSkipRoadside=noSidewalks\|\|\s*\(flatPaintedRoadside&&roadsideInput\.length===0\)/);
  assert.match(scene,/if\(flatSkipRoadside\)\{/);
  assert.match(scene,/roadsideStats=\{rampCells:0/);
  assert.match(scene,/roadsideJob=!flatSkipRoadside&&backgroundRoadside/);
});
test("7.1.1: elevated layers are never painted into ground sidewalks",()=>{
  const plan=createFlatAsphaltPlan([
    way("real",[[5,5],[45,5]],9),
    way("bridge",[[5,5],[45,5]],9,{bridge:true,layer:1}),
    way("tunnel",[[5,5],[45,5]],9,{tunnel:true,layer:-1})
  ]);
  assert.equal(plan.stats.flatGroundWays,1);
  const spy=makeSpy();
  plan.drawTile(spy.ctx,0,0);
  assert.equal(spy.strokes.length,3);
});
