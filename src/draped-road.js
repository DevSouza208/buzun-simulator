/**
 * A road is a continuous "draped sheet" in real game metres.
 * DEM supplies altitudes; horizontal coordinates are NEVER rescaled.
 * Samples share their cross-section height so the left/right asphalt edges
 * cannot zigzag independently across a slope.
 *
 * Pure logic, reusable by WebGL meshes, terrain carving and car physics.
 */
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const ROAD_SAMPLE_METRES=5;
export const GRADE_SMOOTH_METRES=10;
export const ADAPTIVE_MIN_STEP_METRES=3;

/** Subdivide steep or winding streets without spending polygons on flat
 * straight stretches. OSM control points are never displaced or removed. */
export function adaptiveRoadStep(points,index,heightAt,coarseStep=9){
  const a=points[index-1],b=points[index];
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  if(len<.02)return coarseStep;
  const h0=heightAt(...a),h1=heightAt(...b);
  const grade=Math.abs(h1-h0)/len;
  let variation=0;
  for(const t of [.25,.5,.75]){
    const measured=heightAt(lerp(a[0],b[0],t),lerp(a[1],b[1],t));
    variation=Math.max(variation,Math.abs(measured-lerp(h0,h1,t)));
  }
  const turn=(u,v)=>{
    const ul=Math.hypot(...u),vl=Math.hypot(...v);
    if(ul<.02||vl<.02)return 0;
    return Math.acos(clamp((u[0]*v[0]+u[1]*v[1])/(ul*vl),-1,1));
  };
  const incoming=index>1?turn([
    a[0]-points[index-2][0],a[1]-points[index-2][1]],[dx,dz]):0;
  const outgoing=index+1<points.length?turn([dx,dz],[
    points[index+1][0]-b[0],points[index+1][1]-b[1]]):0;
  const bend=Math.max(incoming,outgoing);
  if(grade>.16||variation>.32||bend>.30)
    return Math.min(coarseStep,ADAPTIVE_MIN_STEP_METRES);
  if(grade>.085||variation>.12||bend>.14)
    return Math.min(coarseStep,5);
  return coarseStep;
}

/** A DEM pixel is not a 3D survey of the road surface. Suppress abrupt
 * altitude spikes inside a way, preserving fixed OSM junction anchors. */
export function stabilizeRoadGrades(samples,maxSlope){
  if(!Number.isFinite(maxSlope)||maxSlope<=0)return samples;
  const restrict=(i,j)=>{
    const a=samples[i],b=samples[j];
    const ds=Math.abs(b.distance-a.distance);
    if(ds<.02)return;
    const allowed=maxSlope*ds+.02;
    const diff=b.base-a.base;
    if(Math.abs(diff)<=allowed)return;
    const corrected=a.base+Math.sign(diff)*allowed;
    if(!b.fixed)b.base=corrected;
    else if(!a.fixed)a.base=b.base-Math.sign(diff)*allowed;
  };
  // Alternating passes keep original route endpoints and true junctions
  // stationary; only interpolated grade samples may move.
  for(let pass=0;pass<3;pass++){
    for(let i=1;i<samples.length;i++)restrict(i-1,i);
    for(let i=samples.length-1;i>0;i--)restrict(i,i-1);
  }
  return samples;
}
export const coordinateKey=point=>point[0].toFixed(3)+":"+point[1].toFixed(3);

export function drapedSections(points,heightAt,{
  step=ROAD_SAMPLE_METRES,radius=GRADE_SMOOTH_METRES,
  fixedJunctions=new Set(),adaptive=false,maxSlope=null
}={}) {
  if(!Array.isArray(points)||points.length<2)return [];
  const out=[{p:[...points[0]],distance:0,raw:heightAt(...points[0]),fixed:true}];
  let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<.02)continue;
    const localStep=adaptive?adaptiveRoadStep(points,i,heightAt,step):step;
    const count=Math.max(1,Math.ceil(length/localStep));
    for(let k=1;k<=count;k++){
      const t=k/count,p=[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
      const anchor=k===count && (i===points.length-1||fixedJunctions.has(coordinateKey(b)));
      out.push({p,distance:distance+length*t,raw:heightAt(...p),fixed:anchor});
    }
    distance+=length;
  }
  if(out.length<2)return [];
  for(let i=0;i<out.length;i++){
    const a=out[i];
    if(a.fixed||radius<=0){a.base=a.raw;continue;}
    let weight=0,sum=0;
    for(let j=i;j>=0;j--){
      const d=a.distance-out[j].distance;if(d>radius)break;
      const w=1-d/(radius+.00001);
      weight+=w;sum+=out[j].raw*w;
    }
    for(let j=i+1;j<out.length;j++){
      const d=out[j].distance-a.distance;if(d>radius)break;
      const w=1-d/(radius+.00001);
      weight+=w;sum+=out[j].raw*w;
    }
    // Smooth tiny DEM steps, but do not turn the real gradient into a flat
    // plane or shift the road metres above its measured surroundings.
    a.base=a.raw+Math.max(-1.1,Math.min(1.1,sum/weight-a.raw));
  }
  return stabilizeRoadGrades(out,maxSlope);
}

export function createRoadSurfaceIndex(surfaceSegments,cellSize=75){
  const grid=new Map(),key=(x,z)=>x+":"+z;
  for(const segment of surfaceSegments){
    const pad=segment.halfWidth+segment.walk+6;
    const x0=Math.floor((Math.min(segment.a[0],segment.b[0])-pad)/cellSize);
    const x1=Math.floor((Math.max(segment.a[0],segment.b[0])+pad)/cellSize);
    const z0=Math.floor((Math.min(segment.a[1],segment.b[1])-pad)/cellSize);
    const z1=Math.floor((Math.max(segment.a[1],segment.b[1])+pad)/cellSize);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const k=key(x,z);if(!grid.has(k))grid.set(k,[]);
      grid.get(k).push(segment);
    }
  }
  function sample(x,z){
    const items=grid.get(key(Math.floor(x/cellSize),Math.floor(z/cellSize)))||[];
    let best=null;
    for(const s of items){
      const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=dx*dx+dz*dz;
      const t=len>1e-9?Math.max(0,Math.min(1,
        ((x-s.a[0])*dx+(z-s.a[1])*dz)/len)):0;
      const distance=Math.hypot(x-s.a[0]-dx*t,z-s.a[1]-dz*t);
      // At a T/X intersection, the same primary asphalt sheet that
      // survived planar union must also own the physical road height.
      // Only same-elevation layers compete (ground wins if overlapping a
      // speculative bridge layer). Outside pavement, choose nearest.
      const inside=distance<=s.halfWidth+.01;
      const bestInside=best&&best.distance<=best.halfWidth+.01;
      const layer=s.layer||0,bestLayer=best?.layer||0;
      const chosen=best===null ||
        (inside&&!bestInside) ||
        (inside&&bestInside&&(
          Math.abs(layer)<Math.abs(bestLayer) ||
          (layer===bestLayer&&(
            (s.priority||0)>(best.priority||0) ||
            ((s.priority||0)===(best.priority||0)&&distance<best.distance)
          ))
        )) ||
        (!inside&&!bestInside&&distance<best.distance);
      if(chosen)best={distance,height:lerp(s.h0,s.h1,t),
        halfWidth:s.halfWidth,walk:s.walk,curbTop:s.curbTop??.18,
        roadId:s.roadId,priority:s.priority||0,layer};
    }
    return best;
  }
  return {sample};
}
