import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  createFlatAsphaltPlan,flatAsphaltUv,
  FLAT_ASPHALT_TILE_METRES,FLAT_ASPHALT_TEXTURE_PIXELS,
  FLAT_ASPHALT_GUTTER_PIXELS
} from "../src/worldgen-flat-asphalt-surface.js";

const road=(id,p,widthMeters=8,more={})=>({
  id,p,widthMeters,n:"Rua Teste",t:"residential",layer:0,...more
});
function paintSpy(){
  const paths=[],ctx={
    fillStyle:"",strokeStyle:"",lineJoin:"",lineCap:"",
    lineWidth:0,_path:[],
    fillRect(){},
    beginPath(){this._path=[]},
    moveTo(x,y){this._path.push([x,y])},
    lineTo(x,y){this._path.push([x,y])},
    stroke(){paths.push({points:this._path.map(p=>[...p]),
      width:this.lineWidth,color:this.strokeStyle,
      join:this.lineJoin,cap:this.lineCap})}
  };
  return {ctx,paths};
}
const close=(a,b)=>Math.abs(a-b)<1e-7;

test("7.0: all real ground OSM roads enter one shared flat-surface atlas",()=>{
  const roads=[
    road("avenue",[[-45,0],[0,0],[30,0]],12),
    road("cross",[[0,-50],[0,0],[0,60]],8),
    road("private",[[130,40],[140,40]],3),
    road("bridge",[[0,0],[30,0]],9,{layer:1,bridge:true}),
    road("tunnel",[[0,0],[30,0]],9,{layer:-1,tunnel:true})
  ];
  const before=JSON.stringify(roads);
  const plan=createFlatAsphaltPlan(roads);
  assert.equal(plan.stats.sourceWays,5);
  assert.equal(plan.stats.flatGroundWays,3);
  const selected=plan.waysForTile(0,0).map(x=>x.id);
  assert.deepEqual(selected,["avenue","cross","private"]);
  assert.equal(JSON.stringify(roads),before);
  const {ctx,paths}=paintSpy();
  const result=plan.drawTile(ctx,0,0);
  assert.equal(result.painted,3);
  assert.ok(paths.every(x=>x.join==="round"&&x.cap==="round"));
  assert.equal(paths.length,9);
  assert.ok(paths.slice(0,3).every(x=>x.color==="#ccc4b6"));
  assert.ok(paths.slice(3,6).every(x=>x.color==="#eee1cf"));
  assert.ok(paths.slice(6,9).every(x=>x.color==="#3f484e"));
  assert.equal(result.footwaysPainted,3);
  assert.equal(FLAT_ASPHALT_TILE_METRES,420);
  assert.equal(FLAT_ASPHALT_TEXTURE_PIXELS,768);
});

test("7.0: a 1:1 12m street has exactly 12m of world-space width",()=>{
  const plan=createFlatAsphaltPlan([
    road("avenue",[[0,0],[100,0]],12)
  ]);
  const {ctx,paths}=paintSpy();
  plan.drawTile(ctx,0,0);
  const scale=FLAT_ASPHALT_TEXTURE_PIXELS/420;
  assert.ok(close(paths.at(-1).width/scale,12));
  const start=paths.at(-1).points[0],end=paths.at(-1).points[1];
  assert.ok(close((end[0]-start[0])/scale,100));
  assert.ok(close(start[1],FLAT_ASPHALT_GUTTER_PIXELS));
});

test("7.0: both tiles render the exact same global point at their mutual edge",()=>{
  const ways=[
    road("one",[[390,24],[420,24],[450,24]],8),
    road("cross",[[420,5],[420,70]],8)
  ];
  const atlas=createFlatAsphaltPlan(ways);
  const a=paintSpy(),b=paintSpy();
  atlas.drawTile(a.ctx,0,0);
  atlas.drawTile(b.ctx,1,0);
  const scale=768/420,gutter=2;
  for(let i=0;i<2;i++){
    const global=ways[i].p.find(p=>close(p[0],420));
    assert.ok(global);
    const left=a.paths[i].points.find(p=>close(p[0],768+gutter));
    const right=b.paths[i].points.find(p=>close(p[0],gutter));
    assert.ok(left&&right);
    assert.ok(close(left[1],right[1]));
    assert.ok(close(left[1],gutter+global[1]*scale));
  }
  const uv0=flatAsphaltUv(0,1),uv1=flatAsphaltUv(1,0);
  assert.ok(uv0[0]>0&&uv1[0]<1);
  assert.ok(uv0[1]<1&&uv1[1]>0);
});

test("7.0: OSM gaps and parallel lanes are NOT joined by a synthetic connector",()=>{
  const plan=createFlatAsphaltPlan([
    road("first",[[0,0],[30,0]]),
    road("second",[[90,0],[120,0]]),
    road("parallel",[[0,15],[30,15]])
  ]);
  const {ctx,paths}=paintSpy();
  plan.drawTile(ctx,0,0);
  assert.equal(paths.length,9);
  assert.ok(paths.every(path=>path.points.length===2));
});

test("7.0: flat mode is opt-in by branch and can compare old geometry",()=>{
  const world=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const main=readFileSync(new URL(
    "../src/main.js",import.meta.url),"utf8");
  assert.match(world,/flatAsphaltPlan=flatWorld&&flatPaintedRoads/);
  assert.match(world,/flatPaintedRoadside:flatAnyRoad/);
  assert.match(world,/renderRoads.filter\(road=>physicalLayer\(road\)!==0\)/);
  assert.match(world,/createSheetTerrain\(scene,worldSheet,bounds,\{\s*flatAsphaltPlan,flatVectorPlan,flatTextureQuality,\s*vectorDetail\s*\}\)/);
  assert.match(terrain,/new THREE\.CanvasTexture\(canvas\)/);
  assert.match(terrain,/mesh\.material\.map\?\.dispose\(\)/);
  assert.match(main,/get\("roads"\)!=="geometry"/);
});
