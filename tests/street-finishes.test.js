import test from "node:test";
import assert from "node:assert/strict";
import {streetTexturePixels,streetUv,streetMaterialSpec}
  from "../src/street-materials.js";
import {tactilePaversForZone,boundsOverlap}
  from "../src/tactile-paving.js";
import {buildCurbRampZones,rampTopOffset}
  from "../src/curb-ramps.js";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";

test("Three 64px textures are deterministic, opaque and have bounded palettes",()=>{
  for(const kind of ["asphalt","sidewalk","median"]){
    const tex=streetTexturePixels(kind);
    assert.equal(tex.size,64);
    assert.equal(tex.data.length,64*64*4);
    assert.deepEqual([...tex.data], [...streetTexturePixels(kind).data]);
    assert.ok(tex.low>=0&&tex.high<=255&&tex.high>tex.low);
    assert.ok(tex.tileMetres>1&&tex.tileMetres<10);
    for(let i=3;i<tex.data.length;i+=4)
      assert.equal(tex.data[i],255);
  }
});
test("Asphalt has subtle grain without fake painted lane markings",()=>{
  const tex=streetTexturePixels("asphalt");
  assert.ok(tex.high-tex.low<36);
  assert.equal(tex.seamPixels,0);
});
test("Concrete paving has small joints while grass looks mottled",()=>{
  const sidewalk=streetTexturePixels("sidewalk");
  const median=streetTexturePixels("median");
  assert.ok(sidewalk.seamPixels>=64);
  const red=(x,z)=>(z*64+x)*4;
  assert.ok(sidewalk.data[red(0,32)]<sidewalk.data[red(17,32)]-8);
  assert.ok(median.high-median.low>13);
});
test("UVs are in game metres and do not restart after polygon clipping",()=>{
  const a=streetUv(-12.5,37.9,"sidewalk");
  const b=streetUv(-12.5,37.9,"sidewalk");
  const c=streetUv(-12.5+2.4,37.9,"sidewalk");
  assert.deepEqual(a,b);
  assert.ok(Math.abs(c[0]-a[0]-1)<1e-10);
  assert.throws(()=>streetMaterialSpec("water"));
  assert.throws(()=>streetTexturePixels("asphalt",5));
});
const site={id:"test:1",roadId:2,widthMeters:7,
  point:[0,-19],axis:[0,1],normal:[-1,0],sidewalkMeters:1.65};
function setup(){
  const zones=buildCurbRampZones([site]).zones;
  const roads=[{id:2,t:"residential",layer:0,widthMeters:7,
    a:[0,-80],b:[0,0],h0:10,h1:10,
    quad:[[-3.5,10.072,-80],[-3.5,10.072,0],
      [3.5,10.072,0],[3.5,10.072,-80]]}];
  const walks=[
    {id:2,t:"residential",layer:0,widthMeters:7,
      a:[0,-80],b:[0,0],h0:10,h1:10,curbTop:.18,
      quad:[[-3.5,-80],[-3.5,0],[-5.15,0],[-5.15,-80]]},
    {id:2,t:"residential",layer:0,widthMeters:7,
      a:[0,-80],b:[0,0],h0:10,h1:10,curbTop:.18,
      quad:[[3.5,-80],[3.5,0],[5.15,0],[5.15,-80]]}
  ];
  return {zones,roads,walks};
}
test("Tactile tiles are enclosed in the real verified ramp, not asphalt",()=>{
  for(const zone of setup().zones){
    const tiles=tactilePaversForZone(zone);
    assert.equal(tiles.length,14);
    assert.ok(tiles.every(tile=>tile.elevation>0&&tile.elevation<.02));
    for(const tile of tiles)for(const p of tile.polygon){
      const axis=(p[0]-zone.point[0])*zone.axis[0]+
        (p[1]-zone.point[1])*zone.axis[1];
      const inside=((p[0]-zone.point[0])*zone.normal[0]+
        (p[1]-zone.point[1])*zone.normal[1])*zone.side-
        zone.widthMeters/2;
      assert.ok(Math.abs(axis)<=zone.flatHalf);
      assert.ok(inside>0&&inside<zone.depth);
    }
  }
});
test("Tactile markers are emitted ONLY from accepted sidewalk ramp fragments",()=>{
  const {roads,walks}=setup();
  const material=[],walk=[];
  const stats=composeRoadsideMeshes(roads,walks,
    tri=>walk.push(tri),()=>{},
    {rampSites:[site],onTactile:tri=>material.push(tri)});
  assert.equal(stats.rampSides,2);
  assert.ok(stats.tactileFragments>=10);
  assert.equal(stats.tactileTriangles,material.length);
  assert.ok(stats.tactileTriangles>0);
  assert.ok(material.length<300,"Limited pavement detail for GPU efficiency");
  for(const tri of material)for(const p of tri){
    assert.ok(p.every(Number.isFinite));
    assert.ok(Math.abs(p[0])>=3.5+.02,"Tactile marking must be on sidewalk");
    assert.ok(p[1]>10.08&&p[1]<10.21);
  }
  const original=composeRoadsideMeshes(roads,walks,()=>{},()=>{},
    {rampSites:[site]});
  assert.equal(original.tactileTriangles,0);
  assert.equal(original.rampTriangles,stats.rampTriangles);
});
test("Tactile markings do not appear without ramps or on a different way",()=>{
  const {roads,walks}=setup();
  let drawn=0;
  const none=composeRoadsideMeshes(roads,walks,()=>{},()=>{},
    {onTactile:()=>drawn++});
  assert.equal(none.tactileTriangles,0);
  assert.equal(drawn,0);
  const other=composeRoadsideMeshes(roads,walks,()=>{},()=>{},
    {rampSites:[{...site,roadId:99}],onTactile:()=>drawn++});
  assert.equal(other.tactileTriangles,0);
  assert.equal(drawn,0);
});
test("Tactile zones clip to accepted polygon fragment bounds",()=>{
  const zone=setup().zones[0];
  const tile=tactilePaversForZone(zone)[0];
  assert.ok(boundsOverlap(tile.box,tile.box));
  assert.equal(boundsOverlap(tile.box,{
    minX:100,maxX:102,minZ:100,maxZ:102}),false);
  const mid=tile.polygon[0];
  const elevation=rampTopOffset(zone,mid,.18)+tile.elevation;
  assert.ok(elevation>.08&&elevation<.2);
});

test("Browser world materials asphalt/walk/median all resolve to their texture and UV",()=>{
  // Production city-road-mesh.js uses "walk", while earlier texture tests
  // checked only the synonym "sidewalk": that mismatch caused a fatal
  // world initialization error in v0.1.59 and v0.1.60.
  for(const kind of ["asphalt","walk","median"]){
    assert.doesNotThrow(()=>streetMaterialSpec(kind));
    const uv=streetUv(124.5,-382.75,kind);
    assert.ok(uv.every(Number.isFinite));
    const tex=streetTexturePixels(kind);
    assert.equal(tex.data.length,64*64*4);
  }
  const a=streetTexturePixels("walk"),b=streetTexturePixels("sidewalk");
  assert.equal(a.tileMetres,b.tileMetres);
  assert.equal(a.seamPixels,b.seamPixels);
  assert.deepEqual([...a.data],[...b.data]);
  assert.deepEqual(streetUv(1.3,-6.8,"walk"),
    streetUv(1.3,-6.8,"sidewalk"));
});
