import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { sampleHeight } from "./terrain.js";
import { createRoadScene, STREET_PALETTE } from "./city-road-mesh.js";
import { graphFromRoads } from "./grajau-osm.js";

/** Temporary streets-only Grajaú map, no buildings nor speculative POIs. */
function buildGround(scene,roads) {
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const road of roads)for(const [x,z] of road.p){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  if(!Number.isFinite(minX))throw Error("Sem limites de mapa válidos");
  const offset=210;
  minX-=offset;maxX+=offset;minZ-=offset;maxZ+=offset;
  const geo=new THREE.PlaneGeometry(maxX-minX,maxZ-minZ,
    Math.min(250,Math.ceil((maxX-minX)/60)),
    Math.min(250,Math.ceil((maxZ-minZ)/60)));
  geo.rotateX(-Math.PI/2);
  const attr=geo.getAttribute("position");
  const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  for(let i=0;i<attr.count;i++){
    const x=attr.getX(i)+cx,z=attr.getZ(i)+cz;
    attr.setY(i,sampleHeight(x,z)-.13);
  }
  geo.computeVertexNormals();
  const ground=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({
    color:STREET_PALETTE.ground,side:THREE.DoubleSide,flatShading:true
  }));
  ground.position.set(cx,0,cz);
  ground.name="GrajauGround";
  scene.add(ground);
  return {minX,maxX,minZ,maxZ};
}
function makeSpatialIndex(segments,cellSize=100){
  const grid=new Map(),key=(x,z)=>x+":"+z;
  for(let i=0;i<segments.length;i++){
    const s=segments[i],minX=Math.floor((Math.min(s.a[0],s.b[0])-s.width)/cellSize),
      maxX=Math.floor((Math.max(s.a[0],s.b[0])+s.width)/cellSize),
      minZ=Math.floor((Math.min(s.a[1],s.b[1])-s.width)/cellSize),
      maxZ=Math.floor((Math.max(s.a[1],s.b[1])+s.width)/cellSize);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const k=key(x,z);if(!grid.has(k))grid.set(k,[]);
      grid.get(k).push(i);
    }
  }
  const candidates=(x,z,r=200)=>{
    const found=new Set();
    const x0=Math.floor((x-r)/cellSize),x1=Math.floor((x+r)/cellSize),
      z0=Math.floor((z-r)/cellSize),z1=Math.floor((z+r)/cellSize);
    for(let a=x0;a<=x1;a++)for(let b=z0;b<=z1;b++)
      for(const id of grid.get(key(a,b))||[])found.add(id);
    return [...found].map(i=>segments[i]);
  };
  return {candidates};
}
function projectionOnSegment(x,z,s){
  const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=dx*dx+dz*dz;
  const t=len?Math.max(0,Math.min(1,((x-s.a[0])*dx+(z-s.a[1])*dz)/len)):0;
  const px=s.a[0]+t*dx,pz=s.a[1]+t*dz;
  return {x:px,z:pz,t,distance:Math.hypot(x-px,z-pz),
    angle:Math.atan2(dx,-dz),segment:s};
}
export function createCityWorld(scene,map) {
  const bounds=buildGround(scene,map.roads);
  const scenery=createRoadScene(scene,map.roads,sampleHeight);
  const index=makeSpatialIndex(scenery.segments);
  const graph=graphFromRoads(map.roads);
  function closest(x,z) {
    let near=null;
    for(const s of index.candidates(x,z,100)){
      const hit=projectionOnSegment(x,z,s);
      if(!near||hit.distance<near.distance)near=hit;
    }
    if(!near)for(const s of index.candidates(x,z,700)){
      const hit=projectionOnSegment(x,z,s);
      if(!near||hit.distance<near.distance)near=hit;
    }
    return near;
  }
  const routeStart=map.route?.[0]||[0,0];
  const origin=closest(...routeStart)||projectionOnSegment(...routeStart,scenery.segments[0]);
  const next=map.route?.[1]||[origin.x,origin.z-1];
  const spawn={x:origin.x,z:origin.z,
    angle:Math.atan2(next[0]-routeStart[0],-(next[1]-routeStart[1]))};
  const corridorLandmarks=(map.landmarks||[]).map(loc=>{
    const road=closest(...loc.xy);
    return {key:loc.key,label:loc.label,xy:loc.xy,
      roadPoint:road?[road.x,road.z]:loc.xy,
      confirmedFootprint:false};
  });
  const empty=[];
  const stats={
    roads:map.roads.length,buildings:0,trees:0,pilotFacades:0,
    landmarks:corridorLandmarks.length,fictionalStores:0,utilityPoles:0,
    nodes:graph.nodes.length,edges:graph.edges.length,
    components:graph.components,junctions:scenery.junctions,
    knownWidths:map.roads.filter(r=>r.widthSource==="osm:width").length
  };
  scenery.updateVisibility(spawn.x,spawn.z);
  return {
    segments:scenery.segments,spawn,terminalSpawn:spawn,pilotSpawns:empty,
    collides:()=>false,
    inExploreArea:(x,z)=>x>bounds.minX&&x<bounds.maxX&&z>bounds.minZ&&z<bounds.maxZ&&!!closest(x,z),
    heightAt:sampleHeight,facades:empty,corridorLandmarks,
    closest,
    nearbySegments:(x,z,r=650)=>index.candidates(x,z,r),
    update:(x,z)=>scenery.updateVisibility(x,z),
    graph,stats,bounds
  };
}
