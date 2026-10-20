import test from "node:test";
import assert from "node:assert/strict";
import { drapedSections, createRoadSurfaceIndex, coordinateKey,
  ROAD_SAMPLE_METRES } from "../src/draped-road.js";

test("Draped asphalt preserves metric distance and holds one continuous row height",()=>{
  const road=[[0,0],[24,0],[48,12]];
  const height=(x,z)=>12+.12*x-.04*z;
  const samples=drapedSections(road,height);
  assert.deepEqual(samples[0].p,road[0]);
  assert.deepEqual(samples.at(-1).p,road.at(-1));
  assert.equal(samples[0].base,height(...road[0]));
  assert.equal(samples.at(-1).base,height(...road.at(-1)));
  for(let i=1;i<samples.length;i++){
    const segment=Math.hypot(samples[i].p[0]-samples[i-1].p[0],
      samples[i].p[1]-samples[i-1].p[1]);
    assert.ok(segment<=ROAD_SAMPLE_METRES+.00001);
    assert.ok(Number.isFinite(samples[i].base));
    assert.ok(Math.abs(samples[i].base-height(...samples[i].p))<=1.101);
  }
  const total=samples.at(-1).distance;
  assert.ok(Math.abs(total-(24+Math.hypot(24,12)))<.00001);
});
test("Road surface holds shared junction elevations instead of separate seam steps",()=>{
  const h=(x,z)=>100+x*.18+z*.09+Math.sin(x*.9)*.7;
  const junction=[12,3];
  const anchors=new Set([coordinateKey(junction)]);
  const a=drapedSections([[0,3],junction,[25,3]],h,{fixedJunctions:anchors});
  const b=drapedSections([[12,-12],junction,[12,15]],h,{fixedJunctions:anchors});
  const onA=a.find(s=>coordinateKey(s.p)===coordinateKey(junction));
  const onB=b.find(s=>coordinateKey(s.p)===coordinateKey(junction));
  assert.equal(onA.base,h(...junction));
  assert.equal(onA.base,onB.base);
  assert.ok(a.some(s=>!s.fixed&&Math.abs(s.base-s.raw)>.0001),
    "local DEM noise should be smoothed into a draped asphalt profile");
});
test("Surface lookup interpolates grade along the sheet and keeps the road width",()=>{
  const surface=createRoadSurfaceIndex([
    {a:[0,0],b:[10,0],h0:30,h1:40,halfWidth:4,walk:1.6}
  ]);
  const found=surface.sample(6,1);
  assert.ok(found);
  assert.ok(Math.abs(found.height-36)<1e-8);
  assert.ok(Math.abs(found.distance-1)<1e-8);
  assert.equal(found.halfWidth,4);
  assert.equal(found.walk,1.6);
  assert.equal(surface.sample(100,100),null);
});
test("Car grade follows one road profile over actual slopes, not crossfall",()=>{
  const center=drapedSections([[0,0],[0,-70]],(_x,z)=>-z*.14);
  const segments=center.slice(1).map((row,i)=>({
    a:center[i].p,b:row.p,h0:center[i].base,h1:row.base,
    halfWidth:5,walk:2
  }));
  const surface=createRoadSurfaceIndex(segments);
  assert.ok(Math.abs(surface.sample(0,-40).height-5.6)<.01);
  assert.ok(Math.abs(surface.sample(4,-40).height-5.6)<.01);
});
