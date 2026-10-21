import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {cutTerrainByAsphalt,createAsphaltCutoutMask}
  from "../src/worldgen-vector-terrain-cutout.js";

const triArea=(a,b,c)=>Math.abs(
  (b[0]-a[0])*(c[2]-a[2])-
  (b[2]-a[2])*(c[0]-a[0]))/2;
const surfaceArea=coords=>{
  let a=0;
  for(let i=0;i<coords.length;i+=9){
    a+=triArea(coords.slice(i,i+3),coords.slice(i+3,i+6),
      coords.slice(i+6,i+9));
  }
  return a;
};
const square=(x0,z0,x1,z1,y=0)=>[
  x0,y,z0, x0,y,z1, x1,y,z1,
  x0,y,z0, x1,y,z1, x1,y,z0
];
const inside=(x,z,a,b,c)=>{
  const cross=(u,v,p)=>
    (v[0]-u[0])*(p[1]-u[1])-
    (v[1]-u[1])*(p[0]-u[0]);
  const n=[cross(a,b,[x,z]),cross(b,c,[x,z]),
    cross(c,a,[x,z])];
  return Math.min(...n)>=-1e-7||Math.max(...n)<=1e-7;
};
const onGround=(verts,x,z)=>{
  for(let i=0;i<verts.length;i+=9){
    const t=[
      [verts[i],verts[i+2]],
      [verts[i+3],verts[i+5]],
      [verts[i+6],verts[i+8]]
    ];
    if(inside(x,z,...t))return true;
  }
  return false;
};

test("7.6: exact asphalt mask cuts a 2x2 metre hole in 3D ground",()=>{
  const ground=square(0,0,10,10);
  const asphalt=square(4,4,6,6,.22);
  const {positions,stats}=cutTerrainByAsphalt(ground,null,asphalt);
  assert.equal(stats.asphaltMaskTriangles,2);
  assert.equal(stats.originalTriangles,2);
  assert.ok(Math.abs(stats.maskedArea-4)<1e-5,
    "The mask must erase exactly 4m², not hide it by depth");
  assert.ok(Math.abs(surfaceArea(positions)-96)<1e-5);
  assert.equal(onGround(positions,5,5),false,
    "Grass must not exist underneath pavement");
  assert.equal(onGround(positions,2,2),true);
  assert.equal(onGround(positions,8,8),true);
});
test("7.6: mask consumes fully covered triangles without generating ghosts",()=>{
  const ground=square(0,0,10,10);
  const same=square(-.2,-.2,10.2,10.2);
  const {positions,stats}=cutTerrainByAsphalt(ground,null,same);
  assert.equal(positions.length,0);
  assert.equal(stats.maskedTriangles,2);
  assert.ok(Math.abs(stats.maskedArea-100)<1e-4);
});
test("7.6: hills remain continuous and cut geometry keeps ground winding",()=>{
  // Ground y=x*.1+z*.2 is exactly planar, so every new vertex must
  // interpolate onto that same plane (never inherit asphalt height).
  const xy=(x,z)=>[x,x*.1+z*.2,z];
  const points=[
    ...xy(0,0),...xy(0,10),...xy(10,10),
    ...xy(0,0),...xy(10,10),...xy(10,0)
  ];
  const asphalt=square(3,3,7,7,55);
  const {positions}=cutTerrainByAsphalt(points,null,asphalt);
  const originalSigns=[Math.sign(-50),Math.sign(-50)];
  for(let i=0;i<positions.length;i+=9){
    const a=positions.slice(i,i+3),b=positions.slice(i+3,i+6),
      c=positions.slice(i+6,i+9);
    assert.ok(Math.abs(a[1]-(a[0]*.1+a[2]*.2))<1e-5);
    assert.ok(Math.abs(b[1]-(b[0]*.1+b[2]*.2))<1e-5);
    assert.ok(Math.abs(c[1]-(c[0]*.1+c[2]*.2))<1e-5);
    const signed=(b[0]-a[0])*(c[2]-a[2])-
      (b[2]-a[2])*(c[0]-a[0]);
    assert.ok(signed<0,"Never flip the terrain winding after cut");
  }
  assert.ok(Math.abs(surfaceArea(positions)-84)<1e-4);
});
test("7.6: ground triangles indexed like THREE.PlaneGeometry also get clipped",()=>{
  const p=[...square(0,0,10,10).slice(0,9),
    10,0,0];
  // Four corners with shared vertices: 0=0/0 1=0/10
  // 2=10/10 3=10/0, two indexed triangles.
  const vertices=[0,0,0,0,0,10,10,0,10,10,0,0];
  const indices=[0,1,2,0,2,3];
  const {positions}=cutTerrainByAsphalt(vertices,indices,
    square(2,2,8,8));
  assert.ok(Math.abs(surfaceArea(positions)-64)<1e-5);
});
test("7.6: a road crossing two ground chunks leaves the same void at the boundary",()=>{
  const road=square(9,3,11,7,.22);
  const a=cutTerrainByAsphalt(square(0,0,10,10),null,road);
  const b=cutTerrainByAsphalt(square(10,0,20,10),null,road);
  assert.ok(Math.abs(a.stats.maskedArea-4)<1e-4);
  assert.ok(Math.abs(b.stats.maskedArea-4)<1e-4);
  assert.ok(Math.abs(surfaceArea(a.positions)+
    surfaceArea(b.positions)-192)<1e-4);
  assert.equal(onGround(a.positions,9.5,5),false);
  assert.equal(onGround(b.positions,10.5,5),false);
});
test("7.6: empty asphalt chunks remain untouched without a GPU reupload",()=>{
  const road=createAsphaltCutoutMask([]);
  assert.equal(road.triangleCount,0);
  assert.equal(road.occupiedCells,0);
  const original=square(0,0,420,420);
  const clipped=cutTerrainByAsphalt(original,null,[]);
  assert.deepEqual(clipped.positions,original);
  assert.equal(clipped.stats.maskedArea,0);
});
test("7.6: the preview uses the same final LOD asphalt for terrain holes",()=>{
  const code=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const city=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const main=readFileSync(new URL(
    "../src/main.js",import.meta.url),"utf8");
  assert.match(code,/cutTerrainByAsphalt\(/);
  assert.match(code,/source\.index\?\.array\|\|null,layers\.asphalt/);
  assert.match(code,/baseTerrainGeometry=geometry/);
  assert.match(code,/oldGround\.dispose\(\)/);
  assert.match(code,/get terrainMaskedArea\(\)/);
  assert.match(city,/terrainCutout:asphaltOnly&&terrainCutout/);
  assert.match(main,/get\("cutout"\)!=="off"/);
});
