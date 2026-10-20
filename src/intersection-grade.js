import {asphaltPriority,physicalLayer} from "./asphalt-union.js";

/** A common local grade plane is used only near a TRUE OSM junction.
 * The dominant road determines slope; the DEM determines the shared
 * elevation. Outside the junction influence, each street keeps its
 * independently draped terrain height exactly as before.
 */
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=t=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
const key=id=>String(id);
function tangentAt(road,center){
  let closest=-1,best=Infinity;
  for(let i=0;i<road.p.length;i++){
    const p=road.p[i],d=Math.hypot(p[0]-center[0],p[1]-center[1]);
    if(d<best){best=d;closest=i;}
  }
  if(closest<0||best>1)return null;
  const i=closest,prev=road.p[Math.max(0,i-1)],
    next=road.p[Math.min(road.p.length-1,i+1)];
  const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz);
  return len>.02?[dx/len,dz/len]:null;
}
export function buildIntersectionGradeModels(roads,junctions,heightAt,{
  minRadius=8,maxRadius=19,slopeSampleMetres=3.5,maxSlope=.18
}={}){
  const byId=new Map(roads.map(r=>[key(r.id),r]));
  const byWay=new Map();
  const models=[];
  for(const j of junctions){
    const owners=[...j.ways].map(id=>byId.get(key(id))).filter(Boolean);
    if(owners.length<2)continue;
    // Never impose the elevation of an overpass onto the street below.
    const groups=new Map();
    for(const road of owners){
      const layer=physicalLayer(road);
      if(!groups.has(layer))groups.set(layer,[]);
      groups.get(layer).push(road);
    }
    for(const [layer,ways] of groups){
      if(ways.length<2)continue;
      const highest=[...ways].sort((a,b)=>
        asphaltPriority(b)-asphaltPriority(a))[0];
      const axis=tangentAt(highest,j.point);
      if(!axis)continue;
      const origin=j.point,delta=slopeSampleMetres;
      const ahead=heightAt(origin[0]+axis[0]*delta,
        origin[1]+axis[1]*delta);
      const behind=heightAt(origin[0]-axis[0]*delta,
        origin[1]-axis[1]*delta);
      const anchor={
        point:[...origin],layer,ownerId:highest.id,
        centerHeight:heightAt(...origin),
        axis,grade:clamp((ahead-behind)/(2*delta),-maxSlope,maxSlope),
        radius:clamp(j.maxWidth/2+7,minRadius,maxRadius)
      };
      models.push(anchor);
      for(const road of ways){
        const id=key(road.id);
        if(!byWay.has(id))byWay.set(id,[]);
        byWay.get(id).push(anchor);
      }
    }
  }
  return {byWay,models};
}
/** Unmodified samples outside junction radii, hard cap to avoid creating
 * steep fill / unrealistic excavation where DEM or OSM is inconsistent.
 * Weights blend neighboring intersections instead of fighting each other.
 */
export function reconcileRoadGrade(samples,models,{
  maxAdjustment=.8
}={}){
  if(!models?.length||!samples.length)return samples;
  return samples.map(sample=>{
    let correction=0,total=0;
    const [x,z]=sample.p;
    for(const model of models){
      const dx=x-model.point[0],dz=z-model.point[1],
        distance=Math.hypot(dx,dz);
      if(distance>=model.radius)continue;
      const w=1-smooth(distance/model.radius);
      const target=model.centerHeight+
        model.grade*(dx*model.axis[0]+dz*model.axis[1]);
      const difference=clamp(target-sample.base,
        -maxAdjustment,maxAdjustment);
      correction+=w*difference;
      total+=w;
    }
    if(!total)return sample;
    // The sum of weights is capped to preserve the original profile when
    // multiple junctions are close to one another.
    const applied=correction/Math.max(1,total);
    return {...sample,base:sample.base+applied};
  });
}
