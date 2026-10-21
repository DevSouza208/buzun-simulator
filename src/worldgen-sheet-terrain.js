import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import {SHEET_TILE_METRES,SHEET_GRID_SEGMENTS}
  from "./worldgen-sheet.js";
import {FLAT_ASPHALT_TEXTURE_PIXELS,FLAT_ASPHALT_GUTTER_PIXELS,flatAsphaltUv}
  from "./worldgen-flat-asphalt-surface.js";
import {paintFlatAsphaltTexture} from "./worldgen-flat-texture-quality.js";
import {VECTOR_ROAD_COLORS} from "./worldgen-flat-vector-roads.js";

/** WorldGen 6.0 terrain. The meshes are transport/cache units ONLY.
 * There is no hole-cutting alphaMap; adjacent tile vertices sample
 * precisely the same global H(x,z), irrespective of their load order.
 * Low-poly triangles are just partitions of a single logical sheet.
 */
export function createSheetTerrain(scene,sheet,bounds,{
  // Keep every tile intersecting the visible 900m radius. A cap of 18
  // left 5–9 holes in the terrain ring; 32 covers all possible cells.
  // Optimize distant geometry through LOD later, not missing chunks.
  visibilityRadius=900,maxActive=32,flatAsphaltPlan=null,
  flatVectorPlan=null,flatTextureQuality="smooth"
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
  // Three shared vector materials for the entire visible city. A single
  // material per layer preserves draw calls and avoids per-tile textures.
  const vectorMaterials=flatVectorPlan?Object.fromEntries(
    Object.entries(VECTOR_ROAD_COLORS).map(([kind,color])=>[
      kind,new THREE.MeshBasicMaterial({
        color,side:THREE.DoubleSide,depthWrite:false
      })
    ])
  ):null;
  function createTile(gx,gz){
    // A flat city needs just two triangles per 420m tile; it would
    // waste millions of triangles to keep the 4m relief grid.
    const grid=sheet.flatWorld?1:SHEET_GRID_SEGMENTS;
    const geometry=new THREE.PlaneGeometry(size,size,grid,grid);
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
    let tileMaterial=material;
    if(flatAsphaltPlan){
      const gutter=FLAT_ASPHALT_GUTTER_PIXELS;
      const resolution=FLAT_ASPHALT_TEXTURE_PIXELS;
      const canvas=document.createElement("canvas");
      canvas.width=resolution+gutter*2;
      canvas.height=resolution+gutter*2;
      const ctx=canvas.getContext("2d",{alpha:false});
      if(!ctx)throw Error("Canvas 2D required for flat world road surface");
      paintFlatAsphaltTexture(ctx,flatAsphaltPlan,gx,gz,{
        resolution,gutter,quality:flatTextureQuality,
        createCanvas:()=>document.createElement("canvas")
      });
      const texture=new THREE.CanvasTexture(canvas);
      texture.colorSpace=THREE.SRGBColorSpace;
      // Grazing-angle minification made painted roads look serrated on
      // the horizon. Mipmapping and moderate anisotropy avoid shimmer.
      texture.generateMipmaps=true;
      texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.magFilter=THREE.LinearFilter;
      texture.anisotropy=8;
      texture.wrapS=THREE.ClampToEdgeWrapping;
      texture.wrapT=THREE.ClampToEdgeWrapping;
      const uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++){
        const [u,v]=flatAsphaltUv(uv.getX(i),uv.getY(i),
          {resolution,gutter});
        uv.setXY(i,u,v);
      }
      uv.needsUpdate=true;
      tileMaterial=new THREE.MeshLambertMaterial({
        map:texture,side:THREE.DoubleSide
      });
    }
    const mesh=new THREE.Mesh(geometry,tileMaterial);
    mesh.name="Buzun_ContinuousSheet_"+gx+"_"+gz;
    if(flatVectorPlan){
      // The OSM paths are vectors until the GPU rasterizes the triangles.
      // Tile edges clip the same GLOBAL positions, rather than repeating
      // low-resolution Canvas pixels with a different local origin.
      const {layers}=flatVectorPlan.tileTriangles(gx,gz);
      const kinds=["sidewalk","curb","asphalt"];
      for(const [layer,kind] of kinds.entries()){
        const vertices=layers[kind];
        if(!vertices.length)continue;
        const roadGeometry=new THREE.BufferGeometry();
        roadGeometry.setAttribute("position",
          new THREE.Float32BufferAttribute(vertices,3));
        roadGeometry.computeBoundingSphere();
        const overlay=new THREE.Mesh(roadGeometry,vectorMaterials[kind]);
        overlay.name="Buzun_Vector_"+kind;
        overlay.renderOrder=10+layer;
        overlay.frustumCulled=true;
        mesh.add(overlay);
      }
    }
    mesh.position.set(ox,flatAsphaltPlan?0.072:0,oz);
    mesh.frustumCulled=true;
    scene.add(mesh);
    return mesh;
  }
  function release(key,mesh){
    scene.remove(mesh);
    mesh.geometry.dispose();
    if(flatVectorPlan)
      for(const part of mesh.children)
        part.geometry.dispose();
    if(flatAsphaltPlan){
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
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
    if(vectorMaterials)
      for(const mat of Object.values(vectorMaterials))mat.dispose();
  }
  return {update,dispose,get loadedTiles(){return tiles.size;},
    tileSize:size,mode:flatVectorPlan?"flat-vector-osm-surface":
      flatAsphaltPlan?"flat-continuous-road-surface":"world-sheet"};
}
