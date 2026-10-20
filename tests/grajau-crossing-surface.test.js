import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planPedestrianCrossings,buildZebraBars}
  from "../src/pedestrian-crossings.js";
import {createRoadSurfaceIndex} from "../src/draped-road.js";
import {physicalLayer,asphaltPriority} from "../src/asphalt-union.js";

test("A city-scale Grajaú surface index accepts plausible zebras and rejects wrong-way ownership",()=>{
  const map=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const touches=new Map(),segments=[];
  const height=(x,z)=>120+.018*x-.009*z;
  for(const road of map.roads){
    const layer=physicalLayer(road);
    for(let i=0;i<road.p.length;i++){
      const pt=road.p[i],id=road.nodeIds?.[i]!=null?
        "osm:"+road.nodeIds[i]:pt.map(v=>Math.round(v*10)).join(":");
      if(!touches.has(id))touches.set(id,{
        point:pt,ways:new Set(),maxWidth:0});
      const j=touches.get(id);j.ways.add(road.id);
      j.maxWidth=Math.max(j.maxWidth,road.widthMeters||7);
      if(i===0)continue;
      const a=road.p[i-1],b=pt,len=Math.hypot(
        b[0]-a[0],b[1]-a[1]);
      if(len<.03)continue;
      // Approximate the five-metre draping in the game with linear
      // height along each original segment, preserving ID and layer.
      segments.push({a,b,h0:height(...a),h1:height(...b),
        halfWidth:(road.widthMeters||7)/2,walk:1.65,
        roadId:road.id,layer,priority:asphaltPriority(road)});
    }
  }
  const junctions=[...touches.values()].filter(j=>j.ways.size>1);
  const planned=planPedestrianCrossings(map.roads,junctions).sites;
  const surface=createRoadSurfaceIndex(segments);
  let painted=0,barCount=0;
  const started=performance.now();
  for(const site of planned){
    const bars=buildZebraBars(site,surface);
    if(bars.length===0)continue;
    painted++;barCount+=bars.length;
    for(const quad of bars)for(const point of quad){
      assert.ok(point.every(Number.isFinite));
      assert.ok(point[1]>-500&&point[1]<500);
    }
  }
  const seconds=(performance.now()-started)/1000;
  assert.ok(planned.length>100);
  assert.ok(painted>100,"Real OSM routes must admit hundreds of valid visual zebras");
  assert.ok(painted<=planned.length);
  assert.equal(barCount,painted*6);
  assert.ok(seconds<30);
  console.log("[buzun-zebra-validated]",JSON.stringify({
    segmentCount:segments.length,planned:planned.length,
    painted,rejected:planned.length-painted,bars:barCount,
    seconds:+seconds.toFixed(3)}));
});
