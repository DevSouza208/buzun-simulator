import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorldSheet} from "../src/worldgen-sheet.js";
import {createGlobalAsphaltAtlas,ASPHALT_ATLAS_CELL_METRES}
  from "../src/worldgen-global-asphalt.js";

const way=(id,p,widthMeters=8,extra={})=>({
  id,p,widthMeters,t:"residential",n:"Rua Real",
  layer:0,...extra
});
const base=()=>25;
const inside=(p,t)=>{
  const sign=(a,b,c)=>
    (a[0]-c[0])*(b[2]-c[2])-(b[0]-c[0])*(a[2]-c[2]);
  const [a,b,c]=t;
  const d1=sign(p,a,b),d2=sign(p,b,c),d3=sign(p,c,a);
  const hasNegative=d1< -1e-7||d2< -1e-7||d3< -1e-7;
  const hasPositive=d1>1e-7||d2>1e-7||d3>1e-7;
  return !(hasNegative&&hasPositive);
};
const polygonCount=(result,p)=>{
  let count=0;
  for(let i=0;i<result.positions.length;i+=9){
    const t=[
      result.positions.slice(i,i+3),
      result.positions.slice(i+3,i+6),
      result.positions.slice(i+6,i+9)
    ];
    if(inside(p,t))count++;
  }
  return count;
};

test("6.3: one atlas covers multiple connected OSM roads and crossing footprints",()=>{
  const roads=[
    way("main",[[-110,0],[0,0],[110,0]],12,
      {t:"primary",n:"Avenida Real"}),
    way("side",[[0,-110],[0,0],[0,110]],7)
  ];
  const junctions=[{point:[0,0],maxWidth:12,
    ways:new Set(["main","side"])}];
  const sheet=createWorldSheet(roads,base,{junctions});
  const atlas=createGlobalAsphaltAtlas(roads,sheet,{junctions,
    naturalHeight:base});
  const left=atlas.composeCell(-1,0),
    right=atlas.composeCell(0,0);
  assert.ok(left.positions.length>0&&right.positions.length>0);
  assert.equal(polygonCount(left,[-5,0,1]),1);
  assert.equal(polygonCount(right,[5,0,1]),1);
  assert.equal(polygonCount(right,[1,0,8]),1);
  assert.equal(polygonCount(right,[14,0,14]),0);
  assert.equal(atlas.stats.sourceWays,2);
  assert.equal(ASPHALT_ATLAS_CELL_METRES,220);
});

test("6.3: canonical cells are cached and repeat EXACTLY across regions",()=>{
  const roads=[way("cross",[[-55,0],[55,0]],9)];
  const sheet=createWorldSheet(roads,base);
  const atlas=createGlobalAsphaltAtlas(roads,sheet,{naturalHeight:base});
  const first=atlas.composeCell(0,0);
  const again=atlas.composeCell(0,0);
  assert.strictEqual(first,again);
  assert.equal(atlas.stats.cacheHits,1);
  const emitA=[],emitB=[];
  const run=(bounds,out)=>{
    const gen=atlas.composeRegionSteps(bounds,tri=>out.push(tri));
    let next=gen.next(),steps=0;
    while(!next.done){steps++;next=gen.next();}
    assert.ok(steps>0);
    return next.value;
  };
  const left={minX:-220,maxX:0,minZ:-220,maxZ:220};
  const right={minX:0,maxX:220,minZ:-220,maxZ:220};
  run(left,emitA);run(right,emitB);
  assert.ok(emitA.length>0&&emitB.length>0);
  const shared=(tris)=>tris.flat().filter(p=>Math.abs(p[0])<1e-7)
    .map(p=>[Number(p[2].toFixed(5)),Number(p[1].toFixed(5))]);
  assert.ok(shared(emitA).some(a=>shared(emitB).some(b=>
    Math.abs(a[0]-b[0])<1e-5&&Math.abs(a[1]-b[1])<1e-5)));
});

test("6.3: atlas never fabricates a strip across a real OSM gap",()=>{
  const roads=[
    way("a",[[5,5],[30,5]]),
    way("island",[[90,5],[110,5]])
  ];
  const atlas=createGlobalAsphaltAtlas(roads,
    createWorldSheet(roads,base),{naturalHeight:base});
  const tiles=atlas.composeCell(0,0);
  assert.equal(polygonCount(tiles,[17.43,0,5.67]),1);
  assert.equal(polygonCount(tiles,[80,0,5]),0);
  assert.equal(polygonCount(tiles,[101.41,0,5.64]),1);
});

test("6.3: sheets keep physical bridge/tunnel polygon layers distinct",()=>{
  const roads=[
    way("ground",[[10,0],[80,0]],7),
    way("flyover",[[10,0],[80,0]],7,{bridge:true,layer:1})
  ];
  const atlas=createGlobalAsphaltAtlas(roads,
    createWorldSheet(roads,base),{naturalHeight:base});
  assert.equal(polygonCount(atlas.composeCell(0,0),[25,0,1]),2,
    "Separate layers must not cut each other's footprints");
});

test("6.3: only the opt-in sheet compositor uses citywide asphalt atlas",()=>{
  const stream=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const compositor=readFileSync(new URL(
    "../src/city-road-mesh.js",import.meta.url),"utf8");
  assert.match(stream,/worldSheet\?createGlobalAsphaltAtlas/);
  assert.match(stream,/worldSheet,globalAsphaltAtlas/);
  assert.match(compositor,/if\(globalAsphaltAtlas&&renderBounds\)/);
  assert.match(compositor,/globalAsphaltAtlas\.composeRegionSteps/);
  assert.match(compositor,/else try\{/);
});
