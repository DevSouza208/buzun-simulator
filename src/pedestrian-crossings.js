/**
 * Buzun WorldGen 5.7: *inferred*, illustrative zebra crossings.
 *
 * We deliberately do NOT fake legal "PARE", pedestrian signal heads or
 * traffic lights: OSM road way geometry alone doesn't prove those exist.
 * Crosswalks are placed only on suitable branches of true, ground-level
 * OSM junctions, away from the intersecting pavement itself.
 */
import {physicalLayer,asphaltPriority} from "./asphalt-union.js";
const EXCLUDED=new Set(["motorway","motorway_link","trunk","trunk_link"]);
const EPS=1e-7;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const magnitude=p=>Math.hypot(p[0],p[1]);
const diff=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const scale=(v,t)=>[v[0]*t,v[1]*t];
const normal=v=>[-v[1],v[0]];
const same=(a,b)=>String(a)===String(b);

/** Sample an OSM polyline in either direction, *through* short OSM edges. */
function alongArm(points,index,direction,distance){
  let current=points[index],remaining=distance,total=0;
  for(let i=index+direction;i>=0&&i<points.length;i+=direction){
    const next=points[i],delta=diff(next,current),len=magnitude(delta);
    if(len<.02){current=next;continue;}
    if(len>=remaining){
      const center=add(current,scale(delta,remaining/len));
      return {center,axis:scale(delta,1/len),walked:distance,reach:total+len};
    }
    remaining-=len;total+=len;current=next;
  }
  return null;
}
function waysAtJunction(junction,roadIndex){
  const arms=[];
  for(const id of junction.ways){
    const road=roadIndex.get(String(id));
    if(!road||!Array.isArray(road.p)||road.p.length<2||
      physicalLayer(road)!==0)continue;
    // Street crossings can be visualized on regular streets, but there
    // should not be zebra stripes inferred across expressways or tunnels.
    if(EXCLUDED.has(road.t)||road.t==="service")continue;
    const width=Number(road.widthMeters)||7;
    if(width<5.2||width>19.5)continue;
    const offset=clamp(Math.max(junction.maxWidth/2+4,width/2+4),
      7.5,16);
    const index=road.p.findIndex(p=>
      magnitude(diff(p,junction.point))<.12);
    if(index<0)continue;
    for(const step of [-1,1]){
      const n=index+step;
      if(n<0||n>=road.p.length)continue;
      const first=diff(road.p[n],road.p[index]),length=magnitude(first);
      if(length<.02)continue;
      // At least 3.8 metres beyond the crossing for uninterrupted road.
      const outer=alongArm(road.p,index,step,offset+5.7);
      const at=alongArm(road.p,index,step,offset);
      if(!at||!outer)continue;
      const direction=scale(first,1/length);
      // A short final segment at a sharp bend cannot support a straight
      // rectangle across the road; skip rather than place paint on sidewalks.
      if(dot(direction,at.axis)<.90)continue;
      arms.push({
        roadId:road.id,layer:0,type:road.t,widthMeters:width,
        from:junction.point,point:at.center,axis:at.axis,
        normal:normal(at.axis),offset,priority:asphaltPriority(road),
        source:"inferred-osm-junction"
      });
    }
  }
  return arms;
}
function hasTrueIntersection(arms){
  const ways=new Set(arms.map(a=>String(a.roadId)));
  if(ways.size<2||arms.length<3)return false;
  return arms.some((a,i)=>arms.some((b,j)=>i<j&&
    !same(a.roadId,b.roadId)&&
    Math.abs(a.axis[0]*b.axis[1]-a.axis[1]*b.axis[0])>.52));
}
export function planPedestrianCrossings(roads,junctions,{
  maxPerJunction=2,minSpacingMetres=17
}={}){
  const index=new Map(roads.map(r=>[String(r.id),r]));
  const sites=[],stats={junctionsChecked:0,suitableJunctions:0,
    approachesConsidered:0,crossingsPlanned:0,skippedAmbiguous:0,
    skippedProximity:0,skippedGradeLevel:0};
  // A stable order prevents road-list iteration from moving marks between
  // rebuilds of the same OSM snapshot.
  const ordered=[...junctions].sort((a,b)=>
    a.point[0]-b.point[0]||a.point[1]-b.point[1]);
  for(const junction of ordered){
    stats.junctionsChecked++;
    const owners=[...junction.ways].map(id=>index.get(String(id)))
      .filter(Boolean);
    if(owners.length<2)continue;
    if(owners.some(r=>physicalLayer(r)!==0)){
      stats.skippedGradeLevel++;continue;
    }
    const arms=waysAtJunction(junction,index);
    if(!hasTrueIntersection(arms)){
      stats.skippedAmbiguous++;continue;
    }
    stats.suitableJunctions++;
    stats.approachesConsidered+=arms.length;
    // Prefer side streets. Equal-priority junctions are deterministically
    // assigned at most two approaches, not stripes on all four arms.
    arms.sort((a,b)=>a.priority-b.priority||
      String(a.roadId).localeCompare(String(b.roadId))||
      a.point[0]-b.point[0]||a.point[1]-b.point[1]);
    let chosen=0;
    for(const arm of arms){
      if(chosen>=maxPerJunction)break;
      const near=sites.some(site=>
        magnitude(diff(site.point,arm.point))<minSpacingMetres);
      if(near){stats.skippedProximity++;continue;}
      sites.push({...arm,id:"zebra:"+sites.length});
      chosen++;
    }
  }
  stats.crossingsPlanned=sites.length;
  return {sites,stats};
}
/** Uniformly spaced transverse zebra bars over the *actual* draped
 * carriageway. Validate center AND edges with the authoritative road
 * surface index, so no paint appears on the raised sidewalk or other way.
 */
export function buildZebraBars(site,surface,{
  bars=6,barLength=.45,pitch=.76,margin=.55,height=.04
}={}){
  const half=site.widthMeters/2-margin;
  if(half<2||bars<2)return [];
  const out=[],count=bars,centerOffset=(count-1)*pitch/2;
  for(let i=0;i<count;i++){
    const at=(i-centerOffset/pitch)*pitch;
    const centers=[at-barLength/2,at+barLength/2].map(t=>
      add(site.point,scale(site.axis,t)));
    const pairs=centers.map(center=>[
      add(center,scale(site.normal,-half)),
      add(center,scale(site.normal,half))
    ]);
    const world=pairs.flat();
    const h=surface.sample(...centers[0]);
    const k=surface.sample(...centers[1]);
    if(!h||!k||!same(h.roadId,site.roadId)||
      !same(k.roadId,site.roadId)||
      h.distance>h.halfWidth+.15||k.distance>k.halfWidth+.15)
      return [];
    // Check road ownership at the ends, not only at the center. This
    // catches bends or overlapping approach ramps crossing a sidewalk.
    for(const p of world){
      const sample=surface.sample(...p);
      if(!sample||!same(sample.roadId,site.roadId)||
        sample.distance>sample.halfWidth+.15)
        return [];
    }
    const y0=h.height+.072+height,y1=k.height+.072+height;
    out.push([
      [pairs[0][0][0],y0,pairs[0][0][1]],
      [pairs[1][0][0],y1,pairs[1][0][1]],
      [pairs[1][1][0],y1,pairs[1][1][1]],
      [pairs[0][1][0],y0,pairs[0][1][1]]
    ]);
  }
  return out;
}
