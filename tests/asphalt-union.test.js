import test from "node:test";
import assert from "node:assert/strict";
import {unionAsphaltPatches,subtractConvex,asphaltPriority,physicalLayer}
  from "../src/asphalt-union.js";

const close=(a,b,eps=.0001)=>Math.abs(a-b)<eps;
function area2(points){
  return Math.abs(points.reduce((sum,p,i)=>{
    const q=points[(i+1)%points.length];
    return sum+p[0]*q[1]-q[0]*p[1];
  },0)/2);
}
function quad(id,t,x0,x1,z,half,h0=0,h1=0,layer=0){
  return {id,t,widthMeters:half*2,layer,a:[x0,z],b:[x1,z],
    h0,h1,quad:[[x0,h0+.072,z-half],[x1,h1+.072,z-half],
      [x1,h1+.072,z+half],[x0,h0+.072,z+half]]};
}
function vertical(id,t,z0,z1,x,half,h0=0,h1=0,layer=0){
  return {id,t,widthMeters:half*2,layer,a:[x,z0],b:[x,z1],
    h0,h1,quad:[[x-half,h0+.072,z0],[x-half,h1+.072,z1],
      [x+half,h1+.072,z1],[x+half,h0+.072,z0]]};
}
function run(patches){
  const emitted=[];
  const stats=unionAsphaltPatches(patches,(tri,road)=>emitted.push({tri,id:road.id}));
  const area=emitted.reduce((sum,v)=>sum+area2(v.tri.map(p=>[p[0],p[2]])),0);
  return {emitted,stats,area};
}
test("T-junction: side-road asphalt is subtracted from the dominant avenue",()=>{
  // Main 100m x 12m, side 30m x 6m, overlap at x=0 and z in [-6,0].
  const main=quad(1,"primary",-50,50,0,6,10,10);
  const side=vertical(2,"residential",-35,0,0,3,10,10);
  const {area,emitted,stats}=run([side,main]); // input order must not matter
  assert.ok(close(area,100*12+35*6-6*6));
  assert.ok(stats.clipped>0);
  assert.ok(stats.hiddenTriangles>=0);
  const sideTriangles=emitted.filter(p=>p.id===2);
  for(const {tri} of sideTriangles){
    const centroidZ=tri.reduce((x,p)=>x+p[2],0)/3;
    assert.ok(centroidZ<=-6+.0001,
      "Lower-priority side street must not be drawn under the avenue");
  }
});
test("X-junction produces exactly one pavement footprint without road-on-road overdraw",()=>{
  const first=quad(100,"secondary",-40,40,0,5,5,5);
  const second=vertical(101,"residential",-40,40,0,3,5,5);
  const {area,stats}=run([first,second]);
  assert.ok(close(area,80*10+80*6-10*6));
  assert.ok(stats.clipped>=1);
});
test("Parallel duplicated road ribbons union rather than render twice",()=>{
  const a=quad(1,"primary",0,70,0,6);
  const b=quad(2,"service",0,70,0,6);
  const {area,emitted,stats}=run([a,b]);
  assert.ok(close(area,70*12));
  assert.ok(stats.hiddenTriangles>=2);
  assert.ok(emitted.every(v=>v.id===1));
});
test("Bridge and road below remain separate elevation layers",()=>{
  const bridge=quad(1,"primary",-50,50,0,6,40,40,1);
  const below=vertical(2,"residential",-35,35,0,4,0,0,0);
  const {area,stats}=run([bridge,below]);
  assert.ok(close(area,100*12+70*8));
  assert.equal(stats.clipped,0);
  assert.equal(physicalLayer({...bridge,bridge:true}),1);
  assert.equal(physicalLayer({...below,tunnel:true,layer:0}),-1);
});
test("Priority prevents a residential side street taking over the main road",()=>{
  assert.ok(asphaltPriority({t:"primary",widthMeters:11})>
    asphaltPriority({t:"residential",widthMeters:22}));
});
test("Draped slope geometry stays continuous in metric coordinates",()=>{
  const a=quad(1,"primary",0,100,0,5,0,10);
  const {emitted,area}=run([a]);
  assert.ok(close(area,1000));
  for(const {tri} of emitted)for(const [x,y,z] of tri){
    assert.ok(close(y,.1*x+.072));
    assert.ok(Math.abs(z)<=5+.00001);
  }
});
test("Subtracting one convex polygon leaves disjoint remaining polygons",()=>{
  const subject=[[-10,-4],[10,-4],[10,4],[-10,4]];
  const cutter=[[-2,-5],[2,-5],[2,5],[-2,5]];
  const diff=subtractConvex(subject,cutter);
  const remaining=diff.reduce((acc,p)=>acc+area2(p),0);
  assert.ok(close(remaining,128));
});
