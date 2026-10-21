import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createFlatVectorRoadPlan,VECTOR_ROAD_HEIGHTS}
  from "../src/worldgen-flat-vector-roads.js";
import {sidewalkWidth} from "../src/road-corridor.js";

const road=(id,p,widthMeters=10,props={})=>
  ({id,p,widthMeters,n:"OSM",t:"residential",layer:0,...props});
const close=(a,b,eps=1e-5)=>Math.abs(a-b)<=eps;
const localTriangles=(positions,tx=0,tz=0)=>{
  const list=[];
  for(let i=0;i<positions.length;i+=9)
    list.push([
      [positions[i]+tx,positions[i+1],positions[i+2]+tz],
      [positions[i+3]+tx,positions[i+4],positions[i+5]+tz],
      [positions[i+6]+tx,positions[i+7],positions[i+8]+tz]
    ]);
  return list;
};
function covered(tris,x,z){
  const sign=(p,a,b)=>
    (p[0]-b[0])*(a[2]-b[2])-(a[0]-b[0])*(p[1]-b[2]);
  return tris.some(t=>{
    const a=sign([x,z],t[0],t[1]),
      b=sign([x,z],t[1],t[2]),
      c=sign([x,z],t[2],t[0]);
    return !(Math.min(a,b,c)<-1e-5&&Math.max(a,b,c)>1e-5);
  });
}
test("7.2: an actual metric-vector strip replaces texture resolution",()=>{
  const source=road("a",[[20,50],[120,50]],10);
  const plan=createFlatVectorRoadPlan([source]);
  assert.equal(plan.stats.flatGroundWays,1);
  const {layers,triangles}=plan.tileTriangles(0,0);
  assert.ok(triangles>0);
  const t=localTriangles(layers.asphalt,210,210);
  assert.ok(covered(t,50,50));
  assert.ok(covered(t,50,54));
  assert.ok(!covered(t,50,56));
  const sidewalks=localTriangles(layers.sidewalk,210,210);
  assert.ok(covered(sidewalks,50,56));
  assert.ok(!covered(sidewalks,50,60));
  assert.ok(layers.asphalt.every((v,i)=>i%3!==1||
    close(v,VECTOR_ROAD_HEIGHTS.asphalt)));
  assert.ok(layers.asphalt.every(Number.isFinite));
});
test("7.2: X/Z and road width preserve the real OSM geometry at 1:1",()=>{
  const source=road("a",[[30,20],[130,20]],12,{t:"primary"});
  const saved=JSON.stringify(source);
  const {layers}=createFlatVectorRoadPlan([source]).tileTriangles(0,0);
  const t=localTriangles(layers.asphalt,210,210);
  assert.ok(covered(t,78,25.9));
  assert.ok(!covered(t,78,26.1));
  const walk=localTriangles(layers.sidewalk,210,210);
  assert.ok(covered(walk,78,6+20+sidewalkWidth(source)-.01));
  assert.ok(!covered(walk,78,6+20+sidewalkWidth(source)+.1));
  assert.equal(JSON.stringify(source),saved);
});
test("7.2: clipped vector border has identical world coordinates on both tiles",()=>{
  const plan=createFlatVectorRoadPlan([
    road("seam",[[385,40],[420,40],[455,40]],11),
    road("intersect",[[420,20],[420,40],[420,75]],8)
  ]);
  const west=plan.tileTriangles(0,0),east=plan.tileTriangles(1,0);
  for(const kind of ["sidewalk","curb","asphalt"]){
    const boundary=(item,gx)=>{
      const coords=[];
      for(const tri of localTriangles(item.layers[kind],
        (gx+.5)*420,210))
        for(const p of tri)
          if(close(p[0],420))
            coords.push([Math.round(p[2]*1e4)/1e4,
              Math.round(p[1]*1e4)/1e4]);
      return new Set(coords.map(p=>p.join(":")));
    };
    const a=boundary(west,0),b=boundary(east,1);
    assert.ok(a.size>0&&b.size>0);
    assert.deepEqual([...a].sort(),[...b].sort(),
      "Clipping the exact same OSM triangles must seal tile "+kind);
  }
});
test("7.2: round joins do not connect unrelated OSM streets",()=>{
  const plan=createFlatVectorRoadPlan([
    road("left",[[10,25],[40,25]],8),
    road("right",[[110,25],[140,25]],8),
    road("parallel",[[10,45],[40,45]],8)
  ]);
  const mesh=plan.tileTriangles(0,0);
  const asphalt=localTriangles(mesh.layers.asphalt,210,210);
  assert.ok(covered(asphalt,25,25));
  assert.ok(covered(asphalt,125,25));
  assert.ok(!covered(asphalt,75,25));
  assert.ok(!covered(asphalt,25,35));
});
test("7.2: bridges and tunnels do not get painted onto the surface",()=>{
  const plan=createFlatVectorRoadPlan([
    road("ground",[[0,0],[80,0]]),
    road("upper",[[0,0],[80,0]],10,{bridge:true,layer:1}),
    road("lower",[[0,0],[80,0]],10,{tunnel:true,layer:-1})
  ]);
  assert.equal(plan.stats.flatGroundWays,1);
  assert.equal(plan.stats.segments,1);
});
test("7.2: road mesh remains GPU vectors, not 768-pixel canvas raster",()=>{
  const terrain=readFileSync(new URL(
    "../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const city=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const main=readFileSync(new URL(
    "../src/main.js",import.meta.url),"utf8");
  assert.match(terrain,/flatVectorPlan\.tileTriangles\(gx,gz\)/);
  assert.match(terrain,/new THREE\.Float32BufferAttribute\(vertices,3\)/);
  assert.match(terrain,/mesh\.add\(overlay\)/);
  assert.match(terrain,/part\.geometry\.dispose\(\)/);
  assert.match(city,/flatVectorPlan=flatWorld&&flatPaintedRoads/);
  assert.match(city,/flatPaintedRoadside:flatAnyRoad/);
  assert.match(main,/get\("roads"\)==="vector"\?"vector":"raster"/);
});
