/**
 * A road is a continuous "draped sheet" in real game metres.
 * DEM supplies altitudes; horizontal coordinates are NEVER rescaled.
 * Samples share their cross-section height so the left/right asphalt edges
 * cannot zigzag independently across a slope.
 *
 * Pure logic, reusable by WebGL meshes, terrain carving and car physics.
 */
const lerp=(a,b,t)=>a+(b-a)*t;
export const ROAD_SAMPLE_METRES=5;
export const GRADE_SMOOTH_METRES=10;
export const coordinateKey=point=>point[0].toFixed(3)+":"+point[1].toFixed(3);

export function drapedSections(points,heightAt,{
  step=ROAD_SAMPLE_METRES,radius=GRADE_SMOOTH_METRES,
  fixedJunctions=new Set()
}={}) {
  if(!Array.isArray(points)||points.length<2)return [];
  const out=[{p:[...points[0]],distance:0,raw:heightAt(...points[0]),fixed:true}];
  let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<.02)continue;
    const count=Math.max(1,Math.ceil(length/step));
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
  return out;
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
      if(best===null||distance<best.distance)
        best={distance,height:lerp(s.h0,s.h1,t),
          halfWidth:s.halfWidth,walk:s.walk};
    }
    return best;
  }
  return {sample};
}
