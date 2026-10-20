/**
 * Asphalt footprint union (planar, metre-based).
 *
 * Each draped road ribbon becomes two triangles. Priority-sorted triangles
 * are subtracted from lower-priority triangles using exact 2D half planes.
 * The emitted triangles never overlap in X/Z at the same road level;
 * the height of every new vertex is sampled from its owning draped sheet.
 * Adjacent road triangles may share edges, but no asphalt is painted over
 * another asphalt surface. The OSM geometry is never moved.
 *
 * No third-party library or CDN dependency. Works in Node and the browser.
 */
const EPS=1e-7;
const CLASS_PRIORITY={
  motorway:100,trunk:90,primary:80,secondary:70,tertiary:60,
  motorway_link:58,trunk_link:57,primary_link:56,secondary_link:55,
  tertiary_link:54,residential:40,unclassified:39,
  living_street:30,service:20
};
export function physicalLayer(road){
  const layer=Number(road.layer)||0;
  return layer || (road.bridge?1:road.tunnel?-1:0);
}
export function asphaltPriority(road){
  // Corner fillets are additive fill, never allowed to cut a real road.
  if(road.isFillet)return -1e6;
  return (CLASS_PRIORITY[road.t]||30)*100+
    Math.min(49,Number(road.widthMeters)||7);
}
const area=p=>p.reduce((sum,a,i)=>{
  const b=p[(i+1)%p.length];
  return sum+a[0]*b[1]-b[0]*a[1];
},0)/2;
const absArea=p=>Math.abs(area(p));
function cleanPolygon(poly){
  const out=[];
  for(const p of poly){
    if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>EPS)
      out.push(p);
  }
  if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)[0],
    out[0][1]-out.at(-1)[1])<EPS)out.pop();
  return out.length>=3&&absArea(out)>1e-6?out:[];
}
function clipHalfPlane(poly,a,b,orientation){
  const distance=p=>orientation*((b[0]-a[0])*(p[1]-a[1])-
    (b[1]-a[1])*(p[0]-a[0]));
  const kept=[],discarded=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],f=distance(p),g=distance(q);
    const inside=f>=-EPS,outside=f<=EPS;
    if(inside)kept.push(p);
    if(outside)discarded.push(p);
    if((f>EPS&&g< -EPS)||(f< -EPS&&g>EPS)){
      const t=f/(f-g);
      const hit=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
      kept.push(hit);discarded.push(hit);
    }
  }
  return [cleanPolygon(kept),cleanPolygon(discarded)];
}
/** Polygon difference where cutter is convex (in our case one triangle).
 * Returns disjoint convex pieces covering subject MINUS cutter.
 */
export function subtractConvex(subject,cutter){
  const direction=Math.sign(area(cutter));
  if(!direction||subject.length<3)return [subject];
  const outside=[];
  let remaining=subject;
  for(let i=0;i<cutter.length;i++){
    if(remaining.length<3)break;
    const [inside,part]=clipHalfPlane(remaining,cutter[i],
      cutter[(i+1)%cutter.length],direction);
    if(part.length>=3)outside.push(part);
    remaining=inside;
  }
  return outside;
}
function boundsOf(poly){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [x,z] of poly){
    minX=Math.min(x,minX);maxX=Math.max(x,maxX);
    minZ=Math.min(z,minZ);maxZ=Math.max(z,maxZ);
  }
  return {minX,maxX,minZ,maxZ};
}
function intersects(a,b){
  // Strict overlap prevents expensive clipping on mere shared edges.
  return a.minX<b.maxX-EPS && b.minX<a.maxX-EPS &&
    a.minZ<b.maxZ-EPS && b.minZ<a.maxZ-EPS;
}
function originalTriangles(patch){
  if(patch.polygons)return patch.polygons
    .map(poly=>cleanPolygon(poly)).filter(poly=>poly.length===3);
  const q=patch.quad;
  if(!q||q.length!==4)return [];
  // Every input vertex is [x,y,z]; all other coordinates are unchanged.
  const p=q.map(v=>[v[0],v[2]]);
  return [[p[0],p[1],p[2]],[p[0],p[2],p[3]]]
    .map(poly=>cleanPolygon(poly)).filter(p=>p.length===3);
}
function heightAt(patch,p){
  const dx=patch.b[0]-patch.a[0],dz=patch.b[1]-patch.a[1];
  const len=dx*dx+dz*dz;
  const t=len>EPS?Math.max(0,Math.min(1,
    ((p[0]-patch.a[0])*dx+(p[1]-patch.a[1])*dz)/len)):0;
  return patch.h0+(patch.h1-patch.h0)*t+.072;
}
/**
 * Join visual asphalt footprints without changing OSM. Geometry callback
 * receives 3D triangles in metres, already mapped to the originating sheet.
 * The broadphase indexes original triangles, NOT fragments, because
 * subtracting a previously-subtracted triangle is unnecessary.
 */
export function unionAsphaltPatches(patches,emit,{cellSize=28}={}){
  const polygons=[];
  for(const patch of patches){
    const layer=physicalLayer(patch);
    for(const triangle of originalTriangles(patch)){
      polygons.push({...patch,polygon:triangle,bounds:boundsOf(triangle),
        priority:asphaltPriority(patch),layer});
    }
  }
  // A more important road owns the common X/Z footprint (main avenue wins).
  polygons.sort((a,b)=>b.priority-a.priority||
    String(a.id).localeCompare(String(b.id))||
    a.bounds.minX-b.bounds.minX||a.bounds.minZ-b.bounds.minZ);
  const cells=new Map();
  const cell=(i,j,layer)=>layer+":"+i+":"+j;
  const keys=p=>{
    const b=p.bounds,ids=[];
    for(let x=Math.floor(b.minX/cellSize);x<=Math.floor(b.maxX/cellSize);x++)
      for(let z=Math.floor(b.minZ/cellSize);z<=Math.floor(b.maxZ/cellSize);z++)
        ids.push(cell(x,z,p.layer));
    return ids;
  };
  let clipped=0,emitted=0,skipped=0,overlaps=0;
  for(const patch of polygons){
    let pieces=[patch.polygon];
    const already=new Set();
    for(const key of keys(patch))
      for(const other of cells.get(key)||[]){
        if(other.id===patch.id||already.has(other))continue;
        already.add(other);
        if(!intersects(patch.bounds,other.bounds))continue;
        const previous=pieces.reduce((n,p)=>n+absArea(p),0);
        pieces=pieces.flatMap(piece=>subtractConvex(piece,other.polygon));
        const remaining=pieces.reduce((n,p)=>n+absArea(p),0);
        if(previous-remaining>1e-5){overlaps++;clipped++;}
        if(!pieces.length)break;
      }
    // Emit a fan for the remaining convex pieces. Output has no same-level
    // overlapping area, preserving the dominant road's height at junctions.
    if(pieces.length){
      for(const poly of pieces) {
        const first=poly[0];
        for(let i=1;i<poly.length-1;i++){
          const a=first,b=poly[i],c=poly[i+1];
          if(Math.abs(area([a,b,c]))<1e-6)continue;
          emit([
            [a[0],heightAt(patch,a),a[1]],
            [b[0],heightAt(patch,b),b[1]],
            [c[0],heightAt(patch,c),c[1]]
          ],patch);
          emitted++;
        }
      }
    }else skipped++;
    for(const key of keys(patch)){
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(patch);
    }
  }
  return {inputTriangles:polygons.length,outputTriangles:emitted,
    clipped,hiddenTriangles:skipped,overlaps};
}
