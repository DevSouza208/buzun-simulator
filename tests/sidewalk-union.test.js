import test from "node:test";
import assert from "node:assert/strict";
import {composeRoadsideMeshes} from "../src/sidewalk-union.js";

const within=(v,a,b)=>v>=a-1e-5&&v<=b+1e-5;
const signed=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-
  (b[1]-a[1])*(c[0]-a[0]);
const containsTriangle=(p,tri)=>{
  const x=tri.map(q=>signed(q,tri[(tri.indexOf(q)+1)%3],p));
  return x.every(v=>v>=-1e-5)||x.every(v=>v<=1e-5);
};
const inQuad=(p,quad)=>{
  const vertices=quad.map(q=>[q[0],q[2]]);
  return containsTriangle(p,[vertices[0],vertices[1],vertices[2]])||
    containsTriangle(p,[vertices[0],vertices[2],vertices[3]]);
};
const quad=(id,type,a,b,half,h0=0,h1=0,layer=0)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],
    len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
  const point=(p,s)=>[p[0]+s*nx,0,p[1]+s*nz];
  return {id,t:type,widthMeters:half*2,a,b,h0,h1,layer,
    quad:[point(a,-half),point(b,-half),point(b,half),point(a,half)]};
};
function sidewalk(road,side,foot=2,curbTop=.18){
  const len=Math.hypot(road.b[0]-road.a[0],road.b[1]-road.a[1]);
  const nx=-(road.b[1]-road.a[1])/len,
    nz=(road.b[0]-road.a[0])/len,
    inside=side*road.widthMeters/2,outside=inside+side*foot,
    point=(p,d)=>[p[0]+nx*d,p[1]+nz*d];
  return {...road,curbTop,quad:[
    point(road.a,inside),point(road.b,inside),
    point(road.b,outside),point(road.a,outside)
  ]};
}
function execute(roads,sidewalks){
  const mesh=[],walls=[];
  const stats=composeRoadsideMeshes(roads,sidewalks,
    (tri,p)=>mesh.push({tri,owner:p.id}),
    (wall,p)=>walls.push({wall,owner:p.id}));
  return {mesh,walls,stats};
}
const horiz=quad(1,"primary",[-35,0],[35,0],6,10,10);
const branch=quad(2,"residential",[0,-24],[0,0],3,10,10);
test("At a T-junction no sidewalk triangles intrude on the unioned asphalt",()=>{
  const roads=[horiz,branch];
  const surfaces=roads.flatMap(r=>[-1,1].map(side=>sidewalk(r,side)));
  const result=execute(roads,surfaces);
  assert.ok(result.mesh.length>5);
  assert.ok(result.stats.droppedAgainstAsphalt>=0);
  for(const {tri} of result.mesh){
    const centroid=tri.reduce((a,p)=>[a[0]+p[0]/3,a[1]+p[2]/3],[0,0]);
    for(const asphalt of roads)
      assert.equal(inQuad(centroid,asphalt.quad),false,
        "Raised pavement lies INSIDE the carriageway at "+centroid);
  }
});
test("Meio-fio only exists where pedestrian space borders ACTUAL asphalt",()=>{
  const {walls}=execute([horiz,branch],
    [horiz,branch].flatMap(r=>[-1,1].map(side=>sidewalk(r,side))));
  assert.ok(walls.length>8,"Need multiple curb segments on corner contours");
  for(const {wall} of walls){
    const midpoint=[(wall[0][0]+wall[1][0])/2,
      (wall[0][2]+wall[1][2])/2];
    const hit=[horiz,branch].some(road=>{
      const dx=wall[1][0]-wall[0][0],dz=wall[1][2]-wall[0][2],
        len=Math.hypot(dx,dz)||1,
        nx=-dz/len,nz=dx/len;
      return [1,-1].some(s=>inQuad([
        midpoint[0]+s*nx*.065,midpoint[1]+s*nz*.065],road.quad));
    });
    assert.equal(hit,true,"Curb wall not touching real asphalt at "+midpoint);
  }
});
test("Main road owns sidewalk polygons where the two road walks overlap",()=>{
  const a=quad(10,"primary",[-20,0],[20,0],5);
  const b=quad(11,"residential",[-20,0],[20,0],5);
  const foot=[sidewalk(a,1,2),sidewalk(b,1,2)];
  const result=execute([a,b],foot);
  assert.ok(result.mesh.length>=2);
  assert.equal(result.mesh.filter(x=>x.owner===11).length,0,
    "Lower priority sidewalk should not duplicate the same pedestrian band");
});
test("Bridge pedestrian surfaces do not clip against ground-level asphalt",()=>{
  const upper=quad(8,"primary",[-30,0],[30,0],6,30,30,1);
  const ground=quad(9,"residential",[0,-30],[0,30],4,0,0,0);
  const upperSidewalk=sidewalk(upper,1,2);
  const {mesh}=execute([upper,ground],[upperSidewalk]);
  assert.ok(mesh.length>0);
  assert.ok(mesh.every(x=>x.tri.every(p=>within(p[1],30.18,30.18))));
});
test("Sidewalk heights follow slope 1:1 and curbs meet same shared grade",()=>{
  const road=quad(1,"residential",[0,0],[20,0],4,10,14);
  const {mesh,walls}=execute([road],[sidewalk(road,1,1.5,.2)]);
  assert.ok(mesh.length>=2);
  assert.ok(walls.length>=1);
  for(const {tri} of mesh)for(const [x,y] of tri)
    assert.ok(Math.abs(y-(10+x*.2+.2))<1e-5);
  for(const {wall} of walls){
    assert.ok(Math.abs(wall[2][1]-wall[1][1]-.16)<1e-5);
    assert.ok(Math.abs(wall[3][1]-wall[0][1]-.16)<1e-5);
  }
});
