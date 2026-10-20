/**
 * Buzun WorldGen 5.11 — deterministic region planning and watertight
 * rectangular render boundaries. Pure JS: available in Node test runner.
 *
 * A padded (52m) selection halo gives the road union, junction grading
 * and sidewalk compositor the same neighbors on BOTH sides of a region
 * boundary. Only the FINAL visible triangles are clipped to the region.
 * Roads are not truncated BEFORE union, avoiding artificial end caps.
 */
export const REGION_METRES=880;
export const REGION_HALO_METRES=52;
export const regionKey=(x,z)=>x+":"+z;
export const regionAt=(x,z,size=REGION_METRES)=>({
  x:Math.floor(x/size),z:Math.floor(z/size)
});
export function regionBounds(x,z,size=REGION_METRES){
  return {minX:x*size,maxX:(x+1)*size,
    minZ:z*size,maxZ:(z+1)*size};
}
const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&
  a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
export function bboxForRoad(road){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of road.p||[]){
    minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
    minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);
  }
  return {minX,maxX,minZ,maxZ};
}
export function createRegionRoadIndex(roads,{
  size=REGION_METRES,halo=REGION_HALO_METRES
}={}){
  const stored=roads.map(road=>({road,bounds:bboxForRoad(road)}));
  return {
    size,halo,
    select(x,z){
      const cell=regionBounds(x,z,size);
      const padded={minX:cell.minX-halo,maxX:cell.maxX+halo,
        minZ:cell.minZ-halo,maxZ:cell.maxZ+halo};
      return stored.filter(s=>intersects(s.bounds,padded)).
        map(s=>s.road);
    }
  };
}
export function regionDistance(x,z,gx,gz,size=REGION_METRES){
  const b=regionBounds(gx,gz,size);
  return Math.hypot(Math.max(b.minX-x,0,x-b.maxX),
    Math.max(b.minZ-z,0,z-b.maxZ));
}
export function plannedRegions(x,z,{
  size=REGION_METRES,radius=1380
}={}){
  const center=regionAt(x,z,size),reach=Math.ceil(radius/size)+1,
    out=[];
  for(let i=center.x-reach;i<=center.x+reach;i++)
    for(let j=center.z-reach;j<=center.z+reach;j++){
      const distance=regionDistance(x,z,i,j,size);
      if(distance<=radius)out.push({x:i,z:j,
        key:regionKey(i,j),distance});
    }
  return out.sort((a,b)=>a.distance-b.distance||
    a.x-b.x||a.z-b.z);
}
/** Rank the SAME regional preload set using travel direction, but never
 * push the current region behind any candidate. No extra regions are
 * allocated, only order changes; side and rear regions still arrive.
 */
export function prioritizeDriveRegions(x,z,{
  heading=[0,0],radius=1260,size=REGION_METRES,
  lookAhead=360
}={}){
  const targets=plannedRegions(x,z,{radius,size});
  const length=Math.hypot(heading[0],heading[1]);
  const forward=length>.001?
    [heading[0]/length,heading[1]/length]:[0,0];
  const current=regionAt(x,z,size);
  const focusKey=regionKey(current.x,current.z);
  const score=entry=>{
    if(entry.key===focusKey)return -1e9;
    // All directions remain in the queue, but a 400m region ahead
    // outranks a similarly distant area behind the moving bus.
    const bx=(entry.x+.5)*size-x,bz=(entry.z+.5)*size-z;
    const projected=bx*forward[0]+bz*forward[1];
    return entry.distance-
      Math.min(lookAhead,Math.max(0,projected))*.55;
  };
  return targets.sort((a,b)=>score(a)-score(b)||
    a.distance-b.distance||a.x-b.x||a.z-b.z);
}
/**
 * Convex Sutherland–Hodgman in the X/Z plane; preserves the exact
 * interpolated Y for triangles that span a regional border.
 * Adjacent regions have EXACTLY the same clipped X/Z border, preventing
 * double-drawn fragments. Extra triangles are only created at the cut.
 */
export function clip3DTriangle(triangle,bounds){
  const axes=[
    {index:0,value:bounds.minX,keepGreater:true},
    {index:0,value:bounds.maxX,keepGreater:false},
    {index:2,value:bounds.minZ,keepGreater:true},
    {index:2,value:bounds.maxZ,keepGreater:false}
  ];
  let poly=triangle.map(p=>[...p]);
  for(const plane of axes){
    if(!poly.length)break;
    const next=[];
    const signed=p=>plane.keepGreater?
      p[plane.index]-plane.value:plane.value-p[plane.index];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],
        d0=signed(a),d1=signed(b);
      if(d0>=-1e-9)next.push(a);
      if((d0>1e-9&&d1< -1e-9)||
         (d0< -1e-9&&d1>1e-9)){
        const t=d0/(d0-d1);
        const p=a.map((v,k)=>v+(b[k]-v)*t);
        p[plane.index]=plane.value;
        next.push(p);
      }
    }
    poly=next;
  }
  const tris=[];
  for(let i=1;i<poly.length-1;i++){
    const tri=[poly[0],poly[i],poly[i+1]];
    const area=Math.abs((tri[1][0]-tri[0][0])*
      (tri[2][2]-tri[0][2])-(tri[2][0]-tri[0][0])*
      (tri[1][2]-tri[0][2]));
    if(area>1e-7)tris.push(tri);
  }
  return tris;
}
export function clipMeshBufferToRegion(buffer,bounds){
  const out=[];
  for(let i=0;i<buffer.length;i+=9){
    const tri=[
      buffer.slice(i,i+3),buffer.slice(i+3,i+6),
      buffer.slice(i+6,i+9)
    ];
    for(const clipped of clip3DTriangle(tri,bounds))
      for(const v of clipped)out.push(...v);
  }
  return out;
}

/** New region chunks are visible=true by default in Three.js. Hide
 * offscreen material groups synchronously at creation time — do not wait
 * for the next player movement, as initial loading happens while parked.
 */
export function activateLoadedRoadRegion(scenery,focusX,focusZ){
  if(typeof scenery?.updateVisibility!=="function")
    throw Error("Região 3D sem atualização de visibilidade");
  scenery.updateVisibility(focusX,focusZ);
  return scenery.lodStatistics;
}
