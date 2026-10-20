import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { sidewalkWidth, CURB_RISE, createRoadCorridors,
  clipSidewalkPolygon } from "./road-corridor.js";

/**
 * A single joined cross-section per sampled centreline.
 * No disconnected quads at OSM polyline bends: miter joins are capped.
 * Each cross-section is in game metres.
 */
export const STREET_PALETTE=Object.freeze({
  asphalt:"#364250",walk:"#d6d0c6",curb:"#eee1cf",shoulder:"#a5b89d",
  white:"#eee8dc",yellow:"#e9c86c",ground:"#a5b89d"
});
const SPACING=7; // metre-to-metre tessellation; no coordinate scaling
function lerp(a,b,t){return a+(b-a)*t;}
function addTri(buffer,a,b,c){
  buffer.push(...a,...b,...c);
}
function addQuad(buffer,a,b,c,d){
  addTri(buffer,a,b,c);addTri(buffer,a,c,d);
}
function samplePolyline(raw,spacing=SPACING) {
  if(!Array.isArray(raw)||raw.length<2)return [];
  const out=[[...raw[0]]];
  for(let i=1;i<raw.length;i++){
    const a=raw[i-1],b=raw[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(len<.02)continue;
    const count=Math.max(1,Math.ceil(len/spacing));
    for(let j=1;j<=count;j++)out.push([lerp(a[0],b[0],j/count),lerp(a[1],b[1],j/count)]);
  }
  return out;
}
function normalAt(points,i) {
  const prev=points[Math.max(0,i-1)],p=points[i],next=points[Math.min(points.length-1,i+1)];
  const ax=p[0]-prev[0],az=p[1]-prev[1],bx=next[0]-p[0],bz=next[1]-p[1];
  const al=Math.hypot(ax,az),bl=Math.hypot(bx,bz);
  const tx=(al>.02?ax/al:bx/(bl||1)),tz=(al>.02?az/al:bz/(bl||1));
  const ux=(bl>.02?bx/bl:tx),uz=(bl>.02?bz/bl:tz);
  const nx=-tz,nz=tx;
  const mx=-(tz+uz),mz=tx+ux,ml=Math.hypot(mx,mz);
  if(ml<.25)return [nx,nz];
  const mX=mx/ml,mZ=mz/ml,dot=Math.max(.86,mX*nx+mZ*nz);
  return [mX/dot,mZ/dot];
}
function getSections(path,sampleHeight){
  return path.map((p,i)=>({p,normal:normalAt(path,i),
    base:sampleHeight(...p)}));
}
function point(section,offset,up,sampleHeight) {
  const x=section.p[0]+section.normal[0]*offset;
  const z=section.p[1]+section.normal[1]*offset;
  // The carriageway and sidewalk are level ACROSS a road section.
  // DEM changes apply along its centreline, not as jagged cross-slope noise.
  return [x,(Number.isFinite(section.base)?section.base:sampleHeight(x,z))+up,z];
}
export function joinedRoadSections(points,halfWidth,sampleHeight=()=>0,spacing=SPACING) {
  const path=samplePolyline(points,spacing);
  return getSections(path,sampleHeight).map(s=>({
    center:s.p,
    left:point(s,-halfWidth,.042,sampleHeight),
    right:point(s,halfWidth,.042,sampleHeight),
    normal:s.normal
  }));
}
function faceBand(target,sections,from,to,heightAt,level){
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1],b=sections[i];
    addQuad(target,point(a,from,level,heightAt),point(b,from,level,heightAt),
      point(b,to,level,heightAt),point(a,to,level,heightAt));
  }
}
function curbWall(target,sections,offset,heightAt){
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1],b=sections[i];
    addQuad(target,point(a,offset,.04,heightAt),point(b,offset,.04,heightAt),
      point(b,offset,.17,heightAt),point(a,offset,.17,heightAt));
  }
}
function paintedDash(target,sections,offset,heightAt) {
  let accumulated=0;
  for(let i=1;i<sections.length;i++){
    const a=sections[i-1],b=sections[i],dist=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);
    const cycle=13,visible=4.5;
    let d=0;
    while(d<dist-.01) {
      const phase=(accumulated+d)%cycle;
      const delta=Math.min(dist-d,phase<visible?visible-phase:cycle-phase);
      if(phase<visible-.001&&delta>.025){
        const at=t=>({
          p:[lerp(a.p[0],b.p[0],t),lerp(a.p[1],b.p[1],t)],
          normal:[lerp(a.normal[0],b.normal[0],t),lerp(a.normal[1],b.normal[1],t)]
        });
        const c=at(d/dist),e=at((d+delta)/dist);
        addQuad(target,point(c,offset-.085,.082,heightAt),point(e,offset-.085,.082,heightAt),
          point(e,offset+.085,.082,heightAt),point(c,offset+.085,.082,heightAt));
      }
      d+=Math.max(.001,delta);
    }
    accumulated+=dist;
  }
}
function meshFrom(points,color,lambert=false) {
  if(!points.length)return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
  g.computeVertexNormals();
  const mat=lambert
    ? new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide,flatShading:true})
    : new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide});
  const obj=new THREE.Mesh(g,mat);
  obj.frustumCulled=false;
  return obj;
}
function chunkKey(p,size=440){
  return Math.floor(p[0]/size)+":"+Math.floor(p[1]/size);
}
function emptyChunk(x,z){
  return {x,z,asphalt:[],walk:[],curb:[],white:[],yellow:[],caps:[],shoulder:[]};
}
function streetNodeKey(p){
  return p.map(v=>Math.round(v*10)).join(":");
}
export function getJunctions(roads){
  const touches=new Map();
  for(const road of roads) {
    for(let i=0;i<road.p.length;i++){
      const key=road.nodeIds?.[i]!=null?"osm:"+road.nodeIds[i]:streetNodeKey(road.p[i]);
      if(!touches.has(key))touches.set(key,{point:road.p[i],ways:new Set(),maxWidth:0});
      const t=touches.get(key);
      t.ways.add(road.id);
      t.maxWidth=Math.max(t.maxWidth,road.widthMeters||7);
    }
  }
  return [...touches.values()].filter(j=>j.ways.size>1);
}
export function createRoadScene(scene,roads,sampleHeight) {
  const chunks=new Map();
  const chunkFor=p=>{
    const key=chunkKey(p);
    if(!chunks.has(key)){
      const [x,z]=key.split(":").map(Number);
      chunks.set(key,emptyChunk(x,z));
    }
    return chunks.get(key);
  };
  const segments=[];
  const corridors=createRoadCorridors(roads);
  const joints=getJunctions(roads);
  const junctionCells=new Map();
  const cellSize=40;
  const put=(x,z,item)=>{
    const key=x+":"+z;if(!junctionCells.has(key))junctionCells.set(key,[]);
    junctionCells.get(key).push(item);
  };
  for(const j of joints)put(Math.floor(j.point[0]/cellSize),Math.floor(j.point[1]/cellSize),j);
  const nearJunction=(p,clearance=0)=>{
    const cx=Math.floor(p[0]/cellSize),cz=Math.floor(p[1]/cellSize);
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)
      for(const j of junctionCells.get(x+":"+z)||[])
        if(Math.hypot(j.point[0]-p[0],j.point[1]-p[1])<j.maxWidth/2+1.1+clearance)return true;
    return false;
  };
  for(const road of roads){
    if(!road.p?.length)continue;
    const width=road.widthMeters||7,half=width/2,
      foot=sidewalkWidth(road);
    const sections=getSections(samplePolyline(road.p),sampleHeight);
    if(sections.length<2)continue;
    // Exact sampled OSM centreline, physically separate raised sidewalks.
    for(let i=1;i<sections.length;i++){
      const a=sections[i-1],b=sections[i],buffer=chunkFor([
        (a.p[0]+b.p[0])/2,(a.p[1]+b.p[1])/2
      ]);
      addQuad(buffer.asphalt,point(a,-half,.042,sampleHeight),
        point(b,-half,.042,sampleHeight),point(b,half,.042,sampleHeight),
        point(a,half,.042,sampleHeight));
      const middle=[(a.p[0]+b.p[0])/2,(a.p[1]+b.p[1])/2];
      // A sidewalk must end at a junction; never extend as a raised strip
      // through an intersecting asphalt carriageway.
      const intersection=nearJunction(middle);
      for(const side of [-1,1]) {
        const inner=side*half,outer=side*(half+foot);
        const square=[
          [a.p[0]+a.normal[0]*inner,a.p[1]+a.normal[1]*inner],
          [b.p[0]+b.normal[0]*inner,b.p[1]+b.normal[1]*inner],
          [b.p[0]+b.normal[0]*outer,b.p[1]+b.normal[1]*outer],
          [a.p[0]+a.normal[0]*outer,a.p[1]+a.normal[1]*outer]
        ];
        // Sidewalks are always generated on BOTH sides of EVERY road.
        // At junctions subtract only the intersecting street's pavement:
        // never erase a full sidewalk strip because its midpoint is nearby.
        const x0=Math.min(...square.map(p=>p[0])),x1=Math.max(...square.map(p=>p[0]));
        const z0=Math.min(...square.map(p=>p[1])),z1=Math.max(...square.map(p=>p[1]));
        const near=intersection||nearJunction(middle,foot+2)
          ? corridors.query(x0-.3,z0-.3,x1+.3,z1+.3) : [];
        const pieces=near.length?clipSidewalkPolygon(square,road,near):[square];
        const ddx=b.p[0]-a.p[0],ddz=b.p[1]-a.p[1],ll=ddx*ddx+ddz*ddz;
        const atHeight=(x,z)=>{
          const t=ll?Math.max(0,Math.min(1,((x-a.p[0])*ddx+(z-a.p[1])*ddz)/ll)):0;
          return a.base+(b.base-a.base)*t;
        };
        for(const poly of pieces) {
          if(poly.length<3)continue;
          const first=[poly[0][0],atHeight(...poly[0])+.18,poly[0][1]];
          for(let k=1;k<poly.length-1;k++){
            const p=poly[k],q=poly[k+1];
            addTri(buffer.walk,first,[p[0],atHeight(...p)+.18,p[1]],
              [q[0],atHeight(...q)+.18,q[1]]);
          }
        }
        // Break curbs where the intersection actually crosses this
        // pavement edge. Sidewalk polygons on the corners remain closed.
        const edgeMid=[(square[0][0]+square[1][0])/2,
          (square[0][1]+square[1][1])/2];
        const crossed=near.some(s=>String(s.id)!==String(road.id) &&
          (s.layer||0)===(road.layer||0) &&
          (()=>{const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=dx*dx+dz*dz;
            if(len<.01)return false;
            const t=Math.max(0,Math.min(1,
              ((edgeMid[0]-s.a[0])*dx+(edgeMid[1]-s.a[1])*dz)/(len*len)));
            return Math.hypot(edgeMid[0]-s.a[0]-dx*t,
              edgeMid[1]-s.a[1]-dz*t)<s.halfWidth+.1;})());
        if(!crossed) addQuad(buffer.curb,point(a,inner,.04,sampleHeight),
          point(b,inner,.04,sampleHeight),point(b,inner,.18,sampleHeight),
          point(a,inner,.18,sampleHeight));
        // Short grass/soil apron bridges the edge of the terrain mask and
        // makes the walking surface meet natural ground without a black gap.
        const apron=side*(half+foot+.95);
        addQuad(buffer.shoulder,point(a,outer,.16,sampleHeight),
          point(b,outer,.16,sampleHeight),
          [b.p[0]+b.normal[0]*apron,
            sampleHeight(b.p[0]+b.normal[0]*apron,b.p[1]+b.normal[1]*apron)-.05,
            b.p[1]+b.normal[1]*apron],
          [a.p[0]+a.normal[0]*apron,
            sampleHeight(a.p[0]+a.normal[0]*apron,a.p[1]+a.normal[1]*apron)-.05,
            a.p[1]+a.normal[1]*apron]);
      }
      // Painting is topology-aware: no invented centre double yellow on
      // one-way carriageways or residential side streets.
      const isAvenue=["primary","secondary","tertiary"].includes(road.t);
      if(isAvenue && !intersection) {
        for(const side of [-1,1]){
          const off=side*(half-.24);
          addQuad(buffer.white,point(a,off-.06,.09,sampleHeight),
            point(b,off-.06,.09,sampleHeight),point(b,off+.06,.09,sampleHeight),
            point(a,off+.06,.09,sampleHeight));
        }
        if(!["yes","-1","true","1"].includes(String(road.o))){
          for(const off of [-.19,.19])
            addQuad(buffer.yellow,point(a,off-.055,.09,sampleHeight),
              point(b,off-.055,.09,sampleHeight),point(b,off+.055,.09,sampleHeight),
              point(a,off+.055,.09,sampleHeight));
        }
      }
    }
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i];
      if(Math.hypot(b[0]-a[0],b[1]-a[1])>.04)
        segments.push({a,b,width,name:road.n,type:road.t,id:road.id,
          oneway:road.o,widthSource:road.widthSource});
    }
  }
  // Junction caps: cover overlaps between asphalt ribbons and continuous
  // sidewalk strips. Caps only at true shared OSM nodes, not false crossings.
  for(const j of joints) {
    const center=j.point,r=Math.max(2.8,j.maxWidth/2+.38),
      b=chunkFor(center);
    const c=[center[0],sampleHeight(...center)+.065,center[1]];
    const count=12;
    for(let i=0;i<count;i++){
      const t1=i*Math.PI*2/count,t2=(i+1)*Math.PI*2/count;
      const a=[center[0]+r*Math.cos(t1),center[1]+r*Math.sin(t1)];
      const d=[center[0]+r*Math.cos(t2),center[1]+r*Math.sin(t2)];
      addTri(b.caps,c,[a[0],sampleHeight(...a)+.065,a[1]],
        [d[0],sampleHeight(...d)+.065,d[1]]);
    }
  }
  const tiles=[];
  const hues=[
    ["asphalt",STREET_PALETTE.asphalt],
    ["walk",STREET_PALETTE.walk],
    ["curb",STREET_PALETTE.curb],
    ["caps",STREET_PALETTE.asphalt],
    ["white",STREET_PALETTE.white],
    ["yellow",STREET_PALETTE.yellow],
    ["shoulder",STREET_PALETTE.shoulder]
  ];
  for(const ch of chunks.values()){
    const group=new THREE.Group();
    group.name="Buzun_RoadTile_"+ch.x+"_"+ch.z;
    for(const [key,color] of hues){
      const m=meshFrom(ch[key],color,key==="walk"||key==="curb");
      if(m)group.add(m);
      ch[key].length=0;
    }
    scene.add(group);
    tiles.push({x:ch.x,z:ch.z,group});
  }
  return {
    segments,tiles,junctions:joints.length,junctionPoints:joints,corridors,
    // Spatial tile visibility keeps the full-city scene playable in-browser.
    updateVisibility(x,z,radius=850) {
      for(const tile of tiles)
        tile.group.visible=Math.abs(tile.x*440+220-x)<radius+440&&
          Math.abs(tile.z*440+220-z)<radius+440;
    }
  };
}
