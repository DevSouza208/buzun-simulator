import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {SHEET_TILE_METRES,SHEET_GRID_SEGMENTS}
  from "./worldgen-sheet.js";

/** WorldGen 6.0 terrain. The meshes are transport/cache units ONLY.
 * There is no hole-cutting alphaMap; adjacent tile vertices sample
 * precisely the same global H(x,z), irrespective of their load order.
 * Low-poly triangles are just partitions of a single logical sheet.
 */
export function createSheetTerrain(scene,sheet,bounds,{
  // Keep every tile intersecting the visible 900m radius. A cap of 18
  // left 5–9 holes in the terrain ring; 32 covers all possible cells.
  // Optimize distant geometry through LOD later, not missing chunks.
  visibilityRadius=900,maxActive=32
}={}){
  const size=SHEET_TILE_METRES;
  const tiles=new Map();
  const key=(x,z)=>x+":"+z;
  const minimumX=Math.floor(bounds.minX/size),
    maximumX=Math.floor(bounds.maxX/size),
    minimumZ=Math.floor(bounds.minZ/size),
    maximumZ=Math.floor(bounds.maxZ/size);
  const material=new THREE.MeshLambertMaterial({
    color:"#a5b89d",side:THREE.DoubleSide,flatShading:true
  });
  function createTile(gx,gz){
    const geometry=new THREE.PlaneGeometry(size,size,
      SHEET_GRID_SEGMENTS,SHEET_GRID_SEGMENTS);
    geometry.rotateX(-Math.PI/2);
    const points=geometry.attributes.position,
      ox=(gx+.5)*size,oz=(gz+.5)*size;
    for(let i=0;i<points.count;i++){
      const x=ox+points.getX(i),z=oz+points.getZ(i);
      points.setY(i,sheet.tileSample(x,z));
    }
    points.needsUpdate=true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name="Buzun_ContinuousSheet_"+gx+"_"+gz;
    mesh.position.set(ox,0,oz);
    mesh.frustumCulled=true;
    scene.add(mesh);
    return mesh;
  }
  function release(key,mesh){
    scene.remove(mesh);
    mesh.geometry.dispose();
    tiles.delete(key);
  }
  function update(x,z,budget=2){
    const cx=Math.floor(x/size),cz=Math.floor(z/size);
    const candidates=[];
    for(let gx=Math.max(minimumX,cx-3);
      gx<=Math.min(maximumX,cx+3);gx++)
      for(let gz=Math.max(minimumZ,cz-3);
        gz<=Math.min(maximumZ,cz+3);gz++){
        const dist=Math.hypot(
          Math.max(Math.abs(x-(gx+.5)*size)-size/2,0),
          Math.max(Math.abs(z-(gz+.5)*size)-size/2,0));
        if(dist<=visibilityRadius)
          candidates.push({gx,gz,dist});
      }
    candidates.sort((a,b)=>a.dist-b.dist||a.gx-b.gx||a.gz-b.gz);
    const desired=new Set(candidates.slice(0,maxActive)
      .map(p=>key(p.gx,p.gz)));
    let built=0;
    for(const {gx,gz} of candidates){
      if(built>=budget)break;
      const id=key(gx,gz);
      if(!desired.has(id)||tiles.has(id))continue;
      tiles.set(id,createTile(gx,gz));
      built++;
    }
    for(const [id,mesh] of tiles)
      if(!desired.has(id))release(id,mesh);
  }
  function dispose(){
    for(const [id,mesh] of tiles)release(id,mesh);
    material.dispose();
  }
  return {update,dispose,get loadedTiles(){return tiles.size;},
    tileSize:size,mode:"world-sheet"};
}
