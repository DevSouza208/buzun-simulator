import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildJunctionFillets,createFilletSurfaceIndex}
  from "../src/junction-fillets.js";
import {unionAsphaltPatches} from "../src/asphalt-union.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";

const main={id:1,t:"primary",widthMeters:12,
  p:[[-40,0],[0,0],[40,0]],layer:0};
const side={id:2,t:"residential",widthMeters:7,
  p:[[0,-40],[0,0]],layer:0};
const joint={point:[0,0],maxWidth:12,ways:new Set([1,2])};
const area=tri=>Math.abs(tri.reduce((sum,p,i)=>{
  const q=tri[(i+1)%tri.length];
  return sum+p[0]*q[1]-q[0]*p[1];
},0)/2);
const point=(p,d)=>[p[0],0,p[1]+d];
const roadQuads=[
 {id:1,t:"primary",widthMeters:12,layer:0,
   a:[-40,0],b:[40,0],h0:15,h1:15,
   quad:[point([-40,0],-6),point([40,0],-6),
     point([40,0],6),point([-40,0],6)]},
 {id:2,t:"residential",widthMeters:7,layer:0,
   a:[0,-40],b:[0,0],h0:15,h1:15,
   quad:[[-3.5,15.072,-40],[-3.5,15.072,0],
     [3.5,15.072,0],[3.5,15.072,-40]]}
];

test("T crossing rounds exactly the two sidewalk corners, not the straight continuation",()=>{
  const {patches,stats}=buildJunctionFillets([main,side],[joint],()=>15);
  assert.equal(stats.cornersRounded,2);
  assert.equal(patches.length,2);
  assert.ok(patches.every(p=>p.isFillet));
  assert.ok(patches.every(p=>p.radius>=.65&&p.radius<=4));
  assert.ok(patches.every(p=>p.polygons.length>=3));
  for(const patch of patches){
    assert.ok(patch.polygons.reduce((sum,p)=>sum+area(p),0)>0);
    assert.ok(Math.abs(patch.corner[1]+6)<1e-6);
    assert.ok(Math.abs(patch.corner[0])<4);
    for(const tri of patch.polygons){
      assert.ok(tri.every(p=>Math.abs(p[0])<12&&p[1]<=-5.99&&p[1]>=-15));
    }
  }
});
test("Corner fill joins asphalt union without overlapping a principal carriageway",()=>{
  const curves=buildJunctionFillets([main,side],[joint],()=>15);
  let ownedArea=0,filletCount=0;
  const stats=unionAsphaltPatches([...roadQuads,...curves.patches],
    (tri,patch)=>{
      if(patch.isFillet){
        filletCount++;
        ownedArea+=area(tri.map(v=>[v[0],v[2]]));
      }
    });
  assert.ok(stats.outputTriangles>4);
  assert.ok(filletCount>0&&ownedArea>0);
  assert.ok(stats.clipped>0);
});
test("Corner fill follows grade plane in game metres and can be driven on",()=>{
  const h=(x,z)=>30+.12*x;
  const {patches}=buildJunctionFillets([main,side],[joint],h);
  const index=createFilletSurfaceIndex(patches);
  for(const patch of patches){
    const triangle=patch.polygons[0],centroid=[
      triangle.reduce((s,p)=>s+p[0],0)/3,
      triangle.reduce((s,p)=>s+p[1],0)/3
    ];
    const y=index.sample(...centroid);
    assert.ok(y!==null);
    assert.ok(Math.abs(y-(30+centroid[0]*.12+.072))<1e-7);
    assert.equal(index.sample(...centroid,1),null);
  }
});
test("Bridges and overpasses do not create ground-level crossing arcs",()=>{
  const bridge={...main,id:55,layer:1};
  const {patches}=buildJunctionFillets([bridge,side],[{
    point:[0,0],maxWidth:12,ways:new Set([55,2])
  }],()=>30);
  assert.equal(patches.length,0);
});
test("The final sidewalk subtraction respects the curved asphalt addition",()=>{
  const {patches}=buildJunctionFillets([main,side],[joint],()=>15);
  const walks=[
    {...roadQuads[0],curbTop:15.18,
      quad:[[-40,-6],[40,-6],[40,-8],[-40,-8]]},
    {...roadQuads[1],curbTop:15.18,
      quad:[[-3.5,-40],[-3.5,0],[-5.15,0],[-5.15,-40]]}
  ].map(p=>({...p,curbTop:.18}));
  let triangles=0,curbs=0;
  const results=composeRoadsideMeshes([...roadQuads,...patches],walks,
    (tri)=>{triangles++;
      for(const v of tri)assert.ok(v.every(Number.isFinite));},
    ()=>curbs++);
  assert.ok(results.clipOperations>0);
  assert.ok(triangles>0&&curbs>0);
});
test("Curved corners can be inferred from the complete real Grajaú snapshot",()=>{
  const raw=JSON.parse(readFileSync(new URL("../public/data/grajau-city-roads.json",
    import.meta.url),"utf8"));
  const nodes=new Map();
  for(const road of raw.roads){
    for(let i=0;i<road.p.length;i++){
      const k=road.nodeIds?.[i]!=null?
        "osm:"+road.nodeIds[i]:
        road.p[i].map(n=>n.toFixed(1)).join(":")+":"+(road.layer||0);
      if(!nodes.has(k))nodes.set(k,{point:road.p[i],
        maxWidth:0,ways:new Set()});
      const j=nodes.get(k);
      j.maxWidth=Math.max(j.maxWidth,road.widthMeters||7);
      j.ways.add(road.id);
    }
  }
  const joints=[...nodes.values()].filter(n=>n.ways.size>1);
  const start=performance.now();
  const {patches,stats}=buildJunctionFillets(raw.roads,joints,
    (x,z)=>40+x*.012-z*.015);
  const elapsed=(performance.now()-start)/1000;
  assert.ok(joints.length>100);
  assert.ok(stats.cornersRounded>0);
  assert.equal(patches.length,stats.cornersRounded);
  assert.ok(patches.every(p=>p.polygons.length>=3&&p.radius>=.65));
  assert.ok(elapsed<25,"Junction analysis too slow "+elapsed);
  console.log("[buzun-curved-corners]",JSON.stringify({
    ways:raw.roads.length,junctions:joints.length,
    seconds:+elapsed.toFixed(3),...stats}));
});
