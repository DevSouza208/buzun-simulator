import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

/**
 * A single joined cross-section per sampled centreline.
 * No disconnected quads at OSM polyline bends: miter joins are capped.
 * Each cross-section is in game metres.
 */
export const STREET_PALETTE=Object.freeze({
  asphalt:"#364250",walk:"#d6d0c6",curb:"#eee1cf",
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
  const mX=mx/ml,mZ=mz/ml,dot=Math.max(.55,mX*nx+mZ*nz);
  return [mX/dot,mZ/dot];
}
function getSections(path,sampleHeight){
  return path.map((p,i)=>{
    const normal=normalAt(path,i);
    return {p,normal,base:sampleHeight(...p)};
  });
}
function point(section,offset,up,sampleHeight) {
  const x=section.p[0]+section.normal[0]*offset;
  const z=section.p[1]+section.normal[1]*offset;
  return [x,sampleHeight(x,z)+up,z];
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
  return {x,z,asphalt:[],walk:[],curb:[],white:[],yellow:[],caps:[]};
}
function defaultSidewalk(road) {
  return ["motorway","motorway_link","trunk","trunk_link"].includes(road.t)?0:
    ["primary","secondary"].includes(road.t)?2.0:
    road.t==="service"?.95:1.45;
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
      foot=defaultSidewalk(road);
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
      for(const side of [-1,1]) if(foot>0&&!intersection){
        const inner=side*half,outer=side*(half+foot);
        addQuad(buffer.walk,point(a,inner,.17,sampleHeight),
          point(b,inner,.17,sampleHeight),point(b,outer,.17,sampleHeight),
          point(a,outer,.17,sampleHeight));
        addQuad(buffer.curb,point(a,inner,.04,sampleHeight),
          point(b,inner,.04,sampleHeight),point(b,inner,.17,sampleHeight),
          point(a,inner,.17,sampleHeight));
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
    ["yellow",STREET_PALETTE.yellow]
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
    segments,tiles,junctions:joints.length,
    // Spatial tile visibility keeps the full-city scene playable in-browser.
    updateVisibility(x,z,radius=850) {
      for(const tile of tiles)
        tile.group.visible=Math.abs(tile.x*440+220-x)<radius+440&&
          Math.abs(tile.z*440+220-z)<radius+440;
    }
  };
}
