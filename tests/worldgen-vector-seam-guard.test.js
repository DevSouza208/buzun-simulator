import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createFlatVectorRoadPlan,VECTOR_SEAM_GUARD_METRES,
  vectorTileClipBounds} from "../src/worldgen-flat-vector-roads.js";

const road=(id,p,widthMeters=10)=>({
  id,p,widthMeters,n:"Rua OSM",t:"residential",layer:0
});
function covers(layers,kind,gx,gz,x,z){
  const positions=layers[kind];
  const ox=(gx+.5)*420,oz=(gz+.5)*420;
  const epsilon=1e-7;
  const s=(p,a,b)=>(p[0]-b[0])*(a[1]-b[1])-
    (a[0]-b[0])*(p[1]-b[1]);
  for(let i=0;i<positions.length;i+=9){
    const tri=[
      [positions[i]+ox,positions[i+2]+oz],
      [positions[i+3]+ox,positions[i+5]+oz],
      [positions[i+6]+ox,positions[i+8]+oz]
    ];
    const d=tri.map((a,j)=>s([x,z],a,tri[(j+1)%3]));
    if(Math.min(...d)>=-epsilon||Math.max(...d)<=epsilon)
      return true;
  }
  return false;
}
test("7.3.1: a real 10cm global seam overlap is used on all sides",()=>{
  assert.equal(VECTOR_SEAM_GUARD_METRES,.1);
  assert.deepEqual(vectorTileClipBounds(0,0,420),
    {minX:-.1,maxX:420.1,minZ:-.1,maxZ:420.1});
  assert.deepEqual(vectorTileClipBounds(1,0,420),
    {minX:419.9,maxX:840.1,minZ:-.1,maxZ:420.1});
  const plan=createFlatVectorRoadPlan([road("main",[[380,80],[460,80]])]);
  assert.equal(plan.stats.seamGuardMetres,.1);
  assert.throws(()=>createFlatVectorRoadPlan([],{seamGuardMetres:-.1}),
    /seam guard/);
  assert.throws(()=>createFlatVectorRoadPlan([],{seamGuardMetres:1}),
    /seam guard/);
});
test("7.3.1: both neighbor chunks cover either side of seam in all vector layers",()=>{
  const plan=createFlatVectorRoadPlan([
    road("main",[[380,90],[420,90],[460,90]],12),
    road("cross",[[420,65],[420,115]],9)
  ]);
  for(const quality of ["ultra","balanced","economy"]){
    const west=plan.tileTriangles(0,0,quality);
    const east=plan.tileTriangles(1,0,quality);
    for(const kind of ["asphalt","curb","sidewalk"])
      for(const x of [419.94,419.99,420,420.01,420.06]){
        assert.ok(covers(west.layers,kind,0,0,x,90),
          quality+" west "+kind+" @"+x);
        assert.ok(covers(east.layers,kind,1,0,x,90),
          quality+" east "+kind+" @"+x);
      }
  }
});
test("7.3.1: before-and-after flag disables guard but keeps same 1:1 OSM geometry",()=>{
  const source=road("main",[[380,100],[460,100]],10);
  const before=JSON.stringify(source);
  const guarded=createFlatVectorRoadPlan([source]);
  const old=createFlatVectorRoadPlan([source],{seamGuardMetres:0});
  const rightGuard=guarded.tileTriangles(1,0,"ultra"),
    rightOld=old.tileTriangles(1,0,"ultra");
  assert.ok(covers(rightGuard.layers,"asphalt",1,0,419.95,100));
  assert.equal(covers(rightOld.layers,"asphalt",1,0,419.95,100),false);
  assert.equal(JSON.stringify(source),before);
});
test("7.3.1: seam guard stays a preview-only renderer setting",()=>{
  const city=readFileSync(new URL(
    "../src/city-world-stream.js",import.meta.url),"utf8");
  const world=readFileSync(new URL(
    "../src/world.js",import.meta.url),"utf8");
  const main=readFileSync(new URL(
    "../src/main.js",import.meta.url),"utf8");
  assert.match(city,/seamGuardMetres:vectorSeamGuardMetres/);
  assert.match(world,/vectorSeamGuardMetres:options.vectorSeamGuardMetres/);
  assert.match(main,/get\("seams"\)==="off"\?0:undefined/);
  assert.match(city,/counters\.vectorSeamGuardMetres=flatVectorPlan\.stats\.seamGuardMetres/);
});
