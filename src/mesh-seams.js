/**
 * Repair rendering-only seams between triangles sharing the same X/Z point.
 *
 * After polygon clipping, independent road ribbons may produce subtly
 * different floating point coordinates for the very same junction vertex.
 * Millimetre snapping is visually lossless at game scale (1 unit = 1 metre).
 * Asphalt normals/topology aren't moved, only the generated render vertices.
 *
 * The y consensus is deliberately conservative: only nearby heights can
 * share one vertex; bridges and genuine elevation discontinuities stay apart.
 */
export const SEAM_GRID_METRES=.001;
const snap=(v,step)=>Math.round(v/step)*step;
export function sealMeshSeams(vertices,{
  gridMetres=SEAM_GRID_METRES,heightTolerance=.085
}={}){
  if(vertices.length%9!==0)throw Error("Triângulos devem conter nove valores XYZ");
  const verticesCount=vertices.length/3;
  const spatial=new Map();
  let snapped=0,joined=0,largeSteps=0,degenerate=0;
  for(let i=0;i<vertices.length;i+=3){
    const x=vertices[i],z=vertices[i+2],y=vertices[i+1];
    if(![x,y,z].every(Number.isFinite))throw Error("Coordenada da malha inválida");
    const nx=snap(x,gridMetres),nz=snap(z,gridMetres);
    if(nx!==x||nz!==z)snapped++;
    vertices[i]=nx;vertices[i+2]=nz;
    const key=Math.round(nx/gridMetres)+":"+Math.round(nz/gridMetres);
    if(!spatial.has(key))spatial.set(key,[]);
    const groups=spatial.get(key);
    const match=groups.find(g=>Math.abs(g.base-y)<=heightTolerance);
    if(match) {
      match.offsets.push(i+1);match.total+=y;match.count++;
      joined++;
    }else{
      if(groups.length)largeSteps++;
      groups.push({base:y,offsets:[i+1],total:y,count:1});
    }
  }
  for(const groups of spatial.values())for(const g of groups){
    if(g.count<=1)continue;
    const common=g.total/g.count;
    for(const index of g.offsets)vertices[index]=common;
  }
  for(let i=0;i<vertices.length;i+=9){
    const a=[vertices[i],vertices[i+2]],
      b=[vertices[i+3],vertices[i+5]],
      c=[vertices[i+6],vertices[i+8]];
    const area=Math.abs((b[0]-a[0])*(c[1]-a[1])-
      (b[1]-a[1])*(c[0]-a[0]))*.5;
    if(area<1e-7)degenerate++;
  }
  return {vertices:verticesCount,sharedVertices:joined,
    snappedVertices:snapped,independentLevels:largeSteps,
    degenerateTriangles:degenerate};
}
