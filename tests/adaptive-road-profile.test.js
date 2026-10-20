import test from "node:test";
import assert from "node:assert/strict";
import {adaptiveRoadStep,drapedSections,coordinateKey}
  from "../src/draped-road.js";
import {ROAD_RENDER_PROFILE} from "../src/worldgen-render-profile.js";

test("Adaptive tessellation spends no additional vertices on straight flat roads",()=>{
  const points=[[0,0],[90,0]];
  const sections=drapedSections(points,()=>10,{
    step:9,adaptive:true,radius:18,maxSlope:.24
  });
  assert.equal(adaptiveRoadStep(points,1,()=>10,9),9);
  assert.equal(sections.length,11);
});
test("Steep roads and sharp OSM bends automatically refine to 3m",()=>{
  const steep=[[0,0],[60,0]],slope=x=>x*.18;
  assert.equal(adaptiveRoadStep(steep,1,slope,9),3);
  const samples=drapedSections(steep,slope,{
    step:9,adaptive:true,radius:18,maxSlope:.24
  });
  assert.equal(samples.length,21);
  assert.equal(samples[0].base,0);
  assert.ok(Math.abs(samples.at(-1).base-10.8)<1e-8);
  const winding=[[0,0],[25,0],[25,25]];
  const rows=drapedSections(winding,()=>0,{
    step:9,adaptive:true
  });
  assert.ok(rows.length>=17);
  for(const p of winding)assert.ok(
    rows.some(s=>coordinateKey(s.p)===coordinateKey(p)));
});
test("Adaptive grade stabilization suppresses fake DEM cliffs but keeps anchors",()=>{
  const road=[[0,0],[60,0]];
  const altitude=(x)=>x*.05+4*Math.exp(-(((x-30)/4)**2));
  const samples=drapedSections(road,altitude,{
    step:9,adaptive:true,radius:18,maxSlope:.24
  });
  assert.ok(Math.abs(samples[0].base-altitude(0))<1e-10);
  assert.ok(Math.abs(samples.at(-1).base-altitude(60))<1e-10);
  for(let i=1;i<samples.length;i++){
    const prev=samples[i-1],next=samples[i];
    const length=next.distance-prev.distance;
    assert.ok(Math.abs(next.base-prev.base)<=.24*length+.021,
      "Unexpected artificial road cliff near "+next.distance+"m");
  }
});
test("Streaming world keeps the low-poly budget outside complicated spots",()=>{
  const profile=ROAD_RENDER_PROFILE.streaming;
  assert.equal(profile.adaptiveSampling,true);
  assert.equal(profile.sampleMetres,9);
  assert.equal(profile.maxRoadSlope,.24);
  assert.equal(ROAD_RENDER_PROFILE.complete.adaptiveSampling,undefined);
});
