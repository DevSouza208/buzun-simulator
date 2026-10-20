import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildIntersectionGradeModels,reconcileRoadGrade}
  from "../src/intersection-grade.js";
import {drapedSections,coordinateKey} from "../src/draped-road.js";

test("Real Grajaú streets reconcile grade only near shared topology",()=>{
  const raw=JSON.parse(readFileSync(new URL(
    "../public/data/grajau-city-roads.json",import.meta.url),"utf8"));
  const roads=raw.roads;
  assert.ok(roads.length>4000);
  const groups=new Map();
  for(const road of roads){
    for(let i=0;i<road.p.length;i++){
      const id=road.nodeIds?.[i]!=null?
        "osm:"+road.nodeIds[i]:
        "xy:"+coordinateKey(road.p[i])+":"+(road.layer||0);
      if(!groups.has(id))groups.set(id,{point:road.p[i],
        ways:new Set(),maxWidth:0});
      const node=groups.get(id);
      node.ways.add(road.id);
      node.maxWidth=Math.max(node.maxWidth,road.widthMeters||7);
    }
  }
  const junctions=[...groups.values()].filter(j=>j.ways.size>1);
  const height=(x,z)=>125+.03*x-.025*z+
    .2*Math.sin(x*.07)+.3*Math.sin(z*.11);
  const models=buildIntersectionGradeModels(roads,junctions,height);
  assert.ok(junctions.length>15);
  assert.ok(models.models.length>5,"There should be shared local junctions");
  const fixed=new Set(junctions.map(j=>coordinateKey(j.point)));
  let checked=0,changed=0;
  for(const road of roads){
    if(!models.byWay.has(String(road.id)))continue;
    const samples=drapedSections(road.p,height,{fixedJunctions:fixed});
    const updated=reconcileRoadGrade(samples,models.byWay.get(String(road.id)));
    for(let i=0;i<samples.length;i++){
      assert.deepEqual(updated[i].p,samples[i].p);
      assert.ok(Number.isFinite(updated[i].base));
      const delta=Math.abs(updated[i].base-samples[i].base);
      assert.ok(delta<=.8+1e-7,"Junction grading cannot excavate hill > 0.8m");
      if(delta>1e-8)changed++;
      checked++;
    }
  }
  assert.ok(checked>300);
  assert.ok(changed>0,"City-grade blend should affect real near-junction samples");
  console.log("[buzun-intersection-grade]",JSON.stringify({
    roads:roads.length,junctions:junctions.length,
    gradeAnchors:models.models.length,checked,changed}));
});
