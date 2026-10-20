/**
 * World-gen contract: OSM centre lines are reference coordinates;
 * the generated street corridor (asphalt + both curbs + sidewalks) owns
 * the horizontal footprint. Natural ground cannot render in that footprint.
 *
 * Everything here is plain JS so polygon clipping and masks can be tested
 * without WebGL, Canvas or external geometry libraries.
 */
export const CURB_RISE=.14;
export const TERRAIN_MARGIN=.65;
export function sidewalkWidth(road) {
  // Editor overrides supersede stylistic defaults without changing OSM tags.
  const override=Number(road.sidewalkMeters);
  if(Number.isFinite(override)&&override>=.6&&override<=5)return override;
  // All drivable ways receive a virtual pedestrian edge in this game world,
  // even when OSM has no sidewalk tag. This is a stylized design choice.
  const type=road.t||road.type;
  if(["primary","secondary","trunk"].includes(type))return 2.1;
  if(["motorway","motorway_link","trunk_link"].includes(type))return 1.5;
  if(type==="service")return 1.25;
  return 1.65;
}
export function roadHalfWidth(road) {
  const w=Number(road.widthMeters||road.width);
  return Number.isFinite(w)&&w>=2 ? w/2 : 3.5;
}
export function distanceToSegment(x,z,s) {
  const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],d=dx*dx+dz*dz;
  const t=d>1e-9?Math.max(0,Math.min(1,
    ((x-s.a[0])*dx+(z-s.a[1])*dz)/d)):0;
  return {distance:Math.hypot(x-(s.a[0]+dx*t),z-(s.a[1]+dz*t)),t};
}
export function createRoadCorridors(roads,cellSize=100) {
  const cells=new Map(),segments=[];
  const cellKey=(i,j)=>i+":"+j;
  for(const road of roads) {
    const halfWidth=roadHalfWidth(road),walk=sidewalkWidth(road);
    for(let i=1;i<(road.p||[]).length;i++){
      const a=road.p[i-1],b=road.p[i];
      if(Math.hypot(b[0]-a[0],b[1]-a[1])<.02)continue;
      const s={id:road.id,layer:road.layer||0,a,b,halfWidth,walk,
        envelope:halfWidth+walk+TERRAIN_MARGIN};
      segments.push(s);
      const pad=s.envelope+1.5;
      const ix0=Math.floor((Math.min(a[0],b[0])-pad)/cellSize);
      const ix1=Math.floor((Math.max(a[0],b[0])+pad)/cellSize);
      const iz0=Math.floor((Math.min(a[1],b[1])-pad)/cellSize);
      const iz1=Math.floor((Math.max(a[1],b[1])+pad)/cellSize);
      for(let x=ix0;x<=ix1;x++)for(let z=iz0;z<=iz1;z++){
        const key=cellKey(x,z);
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(s);
      }
    }
  }
  const query=(minX,minZ,maxX,maxZ)=>{
    const found=new Set();
    for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)
      for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)
        for(const segment of cells.get(cellKey(x,z))||[])found.add(segment);
    return [...found].filter(s=>{
      const pad=s.envelope+1.5;
      return Math.min(s.a[0],s.b[0])-pad<=maxX &&
        Math.max(s.a[0],s.b[0])+pad>=minX &&
        Math.min(s.a[1],s.b[1])-pad<=maxZ &&
        Math.max(s.a[1],s.b[1])+pad>=minZ;
    });
  };
  function covers(x,z,additional=0) {
    return query(x,z,x,z).some(s=>
      distanceToSegment(x,z,s).distance<s.envelope+additional);
  }
  return {segments,query,covers};
}
const signedArea=polygon=>polygon.reduce((sum,p,i)=>{
  const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];
},0);
function splitPolygon(poly,a,b,orientation) {
  const dist=p=>orientation*((b[0]-a[0])*(p[1]-a[1])-
    (b[1]-a[1])*(p[0]-a[0]));
  const inside=[],outside=[];
  for(let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length],u=dist(p),v=dist(q);
    const inP=u>=-1e-7,inQ=v>=-1e-7;
    if(inP)inside.push(p);else outside.push(p);
    if(inP!==inQ) {
      const t=Math.max(0,Math.min(1,u/(u-v)));
      const cross=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
      inside.push(cross);outside.push(cross);
    }
  }
  return [inside,outside];
}
function roadRectangle(s,extra=.08) {
  const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=Math.hypot(dx,dz);
  if(len<.02)return null;
  const ux=dx/len,uz=dz/len,nx=-uz,nz=ux;
  const w=s.halfWidth+extra,cap=.45;
  return [
    [s.a[0]-ux*cap+nx*w,s.a[1]-uz*cap+nz*w],
    [s.b[0]+ux*cap+nx*w,s.b[1]+uz*cap+nz*w],
    [s.b[0]+ux*cap-nx*w,s.b[1]+uz*cap-nz*w],
    [s.a[0]-ux*cap-nx*w,s.a[1]-uz*cap-nz*w]
  ];
}
/** Subtract another street's rectangular carriageway, preserving outer
 * corners as polygons. This clips sidewalk surfacing away from crossings,
 * without simply deleting whole 7m-long sidewalk pieces.
 */
export function subtractRoadFromPolygon(polygon,segment){
  const rect=roadRectangle(segment);
  if(!rect || polygon.length<3)return [polygon];
  const orientation=Math.sign(signedArea(rect))||1;
  let remainder=polygon;
  const outside=[];
  for(let i=0;i<rect.length;i++){
    if(remainder.length<3)break;
    const [inside,part]=splitPolygon(remainder,rect[i],
      rect[(i+1)%rect.length],orientation);
    if(part.length>=3&&Math.abs(signedArea(part))>1e-6)
      outside.push(part);
    remainder=inside;
  }
  return outside;
}
export function clipSidewalkPolygon(polygon,ownRoad,nearby) {
  let pieces=[polygon];
  const minX=Math.min(...polygon.map(p=>p[0]));
  const maxX=Math.max(...polygon.map(p=>p[0]));
  const minZ=Math.min(...polygon.map(p=>p[1]));
  const maxZ=Math.max(...polygon.map(p=>p[1]));
  for(const s of nearby){
    if(String(s.id)===String(ownRoad.id) ||
      (s.layer||0)!==(ownRoad.layer||0))continue;
    const p=s.halfWidth+.2;
    if(Math.max(s.a[0],s.b[0])+p<minX ||
      Math.min(s.a[0],s.b[0])-p>maxX ||
      Math.max(s.a[1],s.b[1])+p<minZ ||
      Math.min(s.a[1],s.b[1])-p>maxZ)continue;
    pieces=pieces.flatMap(poly=>subtractRoadFromPolygon(poly,s));
    if(!pieces.length)break;
  }
  return pieces;
}


/**
 * Clip a curb EDGE (not a whole sidewalk quad) to the parts that remain
 * outside crossing roads and the asphalt roundout around shared OSM nodes.
 * Returns sorted [start, end] intervals along the 0..1 curb segment.
 * This prevents the old "test only the midpoint" from letting the curb
 * protrude through a junction when only its tip intersected the road.
 */
function curbLineInsideRoad(a,b,s,clearance=.14) {
  const polygon=roadRectangle(s,clearance);
  if(!polygon)return null;
  const sign=Math.sign(signedArea(polygon))||1;
  let start=0,end=1;
  for(let i=0;i<polygon.length;i++) {
    const v=polygon[i],w=polygon[(i+1)%polygon.length];
    const signed=p=>sign*((w[0]-v[0])*(p[1]-v[1])-
      (w[1]-v[1])*(p[0]-v[0]));
    const f0=signed(a),f1=signed(b);
    if(f0<0&&f1<0)return null;
    if(f0>=0&&f1>=0)continue;
    const at=f0/(f0-f1);
    if(f0<0)start=Math.max(start,at);
    else end=Math.min(end,at);
    if(start>=end)return null;
  }
  return [start,end];
}
function curbLineInsideCircle(a,b,center,radius) {
  const dx=b[0]-a[0],dz=b[1]-a[1];
  const sx=a[0]-center[0],sz=a[1]-center[1];
  const A=dx*dx+dz*dz;
  if(A<1e-9)return null;
  const B=2*(sx*dx+sz*dz),C=sx*sx+sz*sz-radius*radius;
  const discriminant=B*B-4*A*C;
  if(discriminant<=0)return null;
  const root=Math.sqrt(discriminant);
  const t0=Math.max(0,(-B-root)/(2*A));
  const t1=Math.min(1,(-B+root)/(2*A));
  return t1>t0?[t0,t1]:null;
}
export function visibleCurbIntervals(a,b,ownRoad,nearby=[],junctions=[]) {
  if(Math.hypot(b[0]-a[0],b[1]-a[1])<.02)return [];
  const excluded=[];
  for(const s of nearby){
    if(String(s.id)===String(ownRoad.id)||
       (s.layer||0)!==(ownRoad.layer||0))continue;
    const interval=curbLineInsideRoad(a,b,s);
    if(interval)excluded.push(interval);
  }
  for(const j of junctions) {
    const radius=Math.max(2.8,j.maxWidth/2+.43);
    const interval=curbLineInsideCircle(a,b,j.point,radius);
    if(interval)excluded.push(interval);
  }
  excluded.sort((a,b)=>a[0]-b[0]);
  const visible=[];
  let cursor=0;
  for(const [from,to] of excluded){
    if(from>cursor+1e-5)visible.push([cursor,from]);
    cursor=Math.max(cursor,to);
    if(cursor>=1)break;
  }
  if(cursor<1-1e-5)visible.push([cursor,1]);
  // Do not produce tiny curb slivers that flicker at a corner.
  const total=Math.hypot(b[0]-a[0],b[1]-a[1]);
  return visible.filter(([start,end])=>(end-start)*total>.1);
}
