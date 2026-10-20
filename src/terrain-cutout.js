import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {maskedCorridorHalfWidth} from "./terrain-road-mask.js";

/**
 * Terrain is a guest outside the generated street corridor. Its fragments
 * within the actual asphalt + both sidewalks are discarded by a ground mask
 * in the material alpha test, not merely lowered under the road vertices.
 *
 * A tiled alpha mask matters: a coarse interpolated hillside can tower ABOVE
 * street polygons even if nearby terrain vertices have been lowered.
 * Using the same corridor source as the sidewalks prevents disagreement.
 */
const TILE=420;
const MASK_PX=512;
const TERRAIN_GRID=9;
const VISIBILITY_RADIUS=900;
const MAX_ACTIVE_TILES=32;
function createMask(corridors,junctionPoints,x0,z0) {
  const canvas=document.createElement("canvas");
  canvas.width=canvas.height=MASK_PX;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("Não foi possível criar a máscara do terreno");
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,MASK_PX,MASK_PX);
  ctx.strokeStyle="#000";
  ctx.fillStyle="#000";
  ctx.lineJoin="round";
  ctx.lineCap="round";
  const pixelsPerMetre=MASK_PX/TILE;
  const near=corridors.query(x0-20,z0-20,x0+TILE+20,z0+TILE+20);
  for(const s of near) {
    const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1];
    if(Math.hypot(dx,dz)<.02)continue;
    // Keep natural ground beneath the outer sidewalk edge. The prior
    // halfWidth + sidewalk + 0.65m mask exposed blue sky-sized gaps.
    ctx.lineWidth=2*maskedCorridorHalfWidth(s)*pixelsPerMetre;
    ctx.beginPath();
    ctx.moveTo((s.a[0]-x0)*pixelsPerMetre,(s.a[1]-z0)*pixelsPerMetre);
    ctx.lineTo((s.b[0]-x0)*pixelsPerMetre,(s.b[1]-z0)*pixelsPerMetre);
    ctx.stroke();
  }
  // Terrain exclusion follows actual ribbon corridors. Old circular junction
  // caps were removed by planar asphalt union; retaining their masks would
  // expose empty holes between the road and natural terrain.
  const tex=new THREE.CanvasTexture(canvas);
  tex.generateMipmaps=false;
  tex.minFilter=THREE.LinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
  return tex;
}
function groundTile(x0,z0,heightAt,corridors,junctions,roadSurface) {
  const terrain=new THREE.PlaneGeometry(TILE,TILE,
    Math.ceil(TILE/TERRAIN_GRID),Math.ceil(TILE/TERRAIN_GRID));
  terrain.rotateX(-Math.PI/2);
  const attr=terrain.attributes.position,cx=x0+TILE/2,cz=z0+TILE/2;
  for(let i=0;i<attr.count;i++){
    const worldX=attr.getX(i)+cx,worldZ=attr.getZ(i)+cz;
    const natural=heightAt(worldX,worldZ);
    const road=roadSurface?.sample(worldX,worldZ);
    let elevation=natural-.10;
    if(road){
      const outside=road.distance-road.halfWidth-road.walk;
      if(outside<6) {
        // The road is an actual sheet above the land: under the pavement
        // drop ground slightly, then blend natural terrain back only AFTER
        // the sidewalk. The fragment cut mask remains a second safeguard.
        const t=Math.max(0,Math.min(1,outside/6));
        const ease=t*t*(3-2*t);
        elevation=(road.height-.65)*(1-ease)+(natural-.10)*ease;
      }
    }
    attr.setY(i,elevation);
  }
  terrain.computeVertexNormals();
  const material=new THREE.MeshLambertMaterial({
    color:"#a5b89d",side:THREE.DoubleSide,flatShading:true,
    alphaMap:createMask(corridors,junctions,x0,z0),
    alphaTest:.5,depthWrite:true
  });
  const mesh=new THREE.Mesh(terrain,material);
  mesh.position.set(cx,0,cz);
  mesh.name="BuzunTerrain_Cut_"+x0+"_"+z0;
  return mesh;
}
/** Lazy 420m tiles. Only geometry near the player is materialized.
 * Both mesh and alpha texture are disposed on eviction, bounding GPU memory.
 */
export function createCarvedTerrain(scene,corridors,junctionPoints,heightAt,bounds,roadSurface) {
  const tiles=new Map();
  const minimumX=Math.floor(bounds.minX/TILE),maximumX=Math.floor(bounds.maxX/TILE);
  const minimumZ=Math.floor(bounds.minZ/TILE),maximumZ=Math.floor(bounds.maxZ/TILE);
  const key=(x,z)=>x+":"+z;
  function update(x,z,budget=3) {
    const cx=Math.floor(x/TILE),cz=Math.floor(z/TILE);
    const wanted=[];
    for(let gx=Math.max(minimumX,cx-3);gx<=Math.min(maximumX,cx+3);gx++)
      for(let gz=Math.max(minimumZ,cz-3);gz<=Math.min(maximumZ,cz+3);gz++) {
        const d=Math.hypot((gx+.5)*TILE-x,(gz+.5)*TILE-z);
        if(d<VISIBILITY_RADIUS+TILE*.55)wanted.push({gx,gz,d});
      }
    wanted.sort((a,b)=>a.d-b.d);
    const desired=new Set(wanted.slice(0,MAX_ACTIVE_TILES).map(p=>key(p.gx,p.gz)));
    let made=0;
    for(const item of wanted){
      if(made>=budget)break;
      if(!desired.has(key(item.gx,item.gz))||tiles.has(key(item.gx,item.gz)))continue;
      const ground=groundTile(item.gx*TILE,item.gz*TILE,
        heightAt,corridors,junctionPoints,roadSurface);
      scene.add(ground);tiles.set(key(item.gx,item.gz),ground);made++;
    }
    for(const [name,ground] of tiles){
      if(desired.has(name))continue;
      scene.remove(ground);
      ground.geometry.dispose();
      ground.material.alphaMap?.dispose();
      ground.material.dispose();
      tiles.delete(name);
    }
  }
  return {update,get loadedTiles(){return tiles.size;},tileSize:TILE};
}
