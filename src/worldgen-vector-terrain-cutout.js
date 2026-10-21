/**
 * WorldGen 7.6 — actual terrain HOLES defined by asphalt's final vector
 * triangles. The citywide OSM polygon union remains the sole footprint;
 * chunks only clip/display that topology.
 *
 * This module has no Three.js dependency, so seams, holes and triangle
 * winding are covered by Node tests. Everything uses tile-local X/Z metres.
 */
import {subtractConvex} from "./asphalt-union.js";

const EPS=1e-7;
const MIN_AREA=1e-5;
function signedArea(poly){
  let sum=0;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    sum+=a[0]*b[1]-b[0]*a[1];
  }
  return sum*.5;
}
function bbox(poly){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [x,z] of poly){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  return {minX,maxX,minZ,maxZ};
}
function overlaps(a,b){
  return a.minX<b.maxX-EPS&&a.maxX>b.minX+EPS&&
    a.minZ<b.maxZ-EPS&&a.maxZ>b.minZ+EPS;
}
function coordinates(buffer,index){
  const i=index*3;
  return [buffer[i],buffer[i+1],buffer[i+2]];
}
function heightInTriangle(v0,v1,v2,x,z){
  // Maintain the terrain's original triangle plane; do not sample H at
  // newly introduced cuts (it could lie above the original grid cell).
  const det=(v1[2]-v2[2])*(v0[0]-v2[0])+
    (v2[0]-v1[0])*(v0[2]-v2[2]);
  if(Math.abs(det)<EPS)return v0[1];
  const w0=((v1[2]-v2[2])*(x-v2[0])+
    (v2[0]-v1[0])*(z-v2[2]))/det;
  const w1=((v2[2]-v0[2])*(x-v2[0])+
    (v0[0]-v2[0])*(z-v2[2]))/det;
  return w0*v0[1]+w1*v1[1]+(1-w0-w1)*v2[1];
}
/** Build a broadphase over the FINAL, already-unified asphalt triangles.
 * A bridge/tunnel must not be passed here: this is a ground-level mask.
 */
export function createAsphaltCutoutMask(asphaltPositions,{
  cellSize=22
}={}){
  if(!Number.isFinite(cellSize)||cellSize<=0)
    throw Error("Invalid cutout index cell size");
  const cells=new Map(),polygons=[];
  const key=(x,z)=>x+":"+z;
  function addCells(box,id){
    for(let x=Math.floor(box.minX/cellSize);
      x<=Math.floor(box.maxX/cellSize);x++)
      for(let z=Math.floor(box.minZ/cellSize);
        z<=Math.floor(box.maxZ/cellSize);z++){
        const k=key(x,z);
        if(!cells.has(k))cells.set(k,[]);
        cells.get(k).push(id);
      }
  }
  for(let i=0;i+8<asphaltPositions.length;i+=9){
    const poly=[
      [asphaltPositions[i],asphaltPositions[i+2]],
      [asphaltPositions[i+3],asphaltPositions[i+5]],
      [asphaltPositions[i+6],asphaltPositions[i+8]]
    ];
    if(!poly.flat().every(Number.isFinite)||
      Math.abs(signedArea(poly))<MIN_AREA)continue;
    const box=bbox(poly),id=polygons.length;
    polygons.push({poly,box});
    addCells(box,id);
  }
  function candidates(box){
    const seen=new Set(),result=[];
    for(let x=Math.floor(box.minX/cellSize);
      x<=Math.floor(box.maxX/cellSize);x++)
      for(let z=Math.floor(box.minZ/cellSize);
        z<=Math.floor(box.maxZ/cellSize);z++)
        for(const id of cells.get(key(x,z))||[]){
          if(seen.has(id))continue;
          seen.add(id);
          const item=polygons[id];
          if(overlaps(box,item.box))result.push(item);
        }
    return result;
  }
  return {candidates,triangleCount:polygons.length,
    occupiedCells:cells.size};
}
/** Cut the GROUND plane by the exact asphalt geometry, including curving
 * intersections, rather than hiding road pixels using alpha/depth hacks.
 * The returned coordinates are non-indexed, tile-local XYZ triangles.
 */
export function cutTerrainByAsphalt(groundPositions,groundIndices,
  asphaltPositions,options={}){
  const mask=createAsphaltCutoutMask(asphaltPositions,options);
  const output=[];
  const stats={originalTriangles:0,outputTriangles:0,
    maskedTriangles:0,partialTriangles:0,
    originalArea:0,remainingArea:0,maskedArea:0,
    asphaltMaskTriangles:mask.triangleCount,
    indexCells:mask.occupiedCells};
  const n=groundIndices?groundIndices.length:
    groundPositions.length/3;
  for(let i=0;i+2<n;i+=3){
    const a=coordinates(groundPositions,groundIndices?
      groundIndices[i]:i),
      b=coordinates(groundPositions,groundIndices?
      groundIndices[i+1]:i+1),
      c=coordinates(groundPositions,groundIndices?
      groundIndices[i+2]:i+2);
    const original=[[a[0],a[2]],[b[0],b[2]],[c[0],c[2]]];
    const sign=Math.sign(signedArea(original));
    const originalArea=Math.abs(signedArea(original));
    if(originalArea<MIN_AREA)continue;
    stats.originalTriangles++;
    stats.originalArea+=originalArea;
    const cutters=mask.candidates(bbox(original));
    if(!cutters.length){
      output.push(...a,...b,...c);
      stats.remainingArea+=originalArea;
      stats.outputTriangles++;
      continue;
    }
    let pieces=[original];
    for(const cutter of cutters){
      const next=[];
      for(const piece of pieces){
        if(!overlaps(bbox(piece),cutter.box))next.push(piece);
        else next.push(...subtractConvex(piece,cutter.poly));
      }
      pieces=next;
      if(!pieces.length)break;
    }
    let keptArea=0;
    for(const poly of pieces){
      if(poly.length<3)continue;
      // Convex difference fragments retain the source winding; enforce
      // it on output to avoid backface culling and inverted terrain normals.
      const path=Math.sign(signedArea(poly))===sign?
        poly:[...poly].reverse();
      for(let j=1;j<path.length-1;j++){
        const verts=[path[0],path[j],path[j+1]];
        const a2=Math.abs(signedArea(verts));
        if(a2<MIN_AREA)continue;
        for(const [x,z] of verts)
          output.push(x,heightInTriangle(a,b,c,x,z),z);
        keptArea+=a2;
        stats.outputTriangles++;
      }
    }
    stats.remainingArea+=keptArea;
    if(originalArea-keptArea>MIN_AREA){
      if(keptArea<MIN_AREA)stats.maskedTriangles++;
      else stats.partialTriangles++;
    }
  }
  stats.maskedArea=Math.max(0,
    stats.originalArea-stats.remainingArea);
  return {positions:output,stats};
}
