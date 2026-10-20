/**
 * Round the EXTERNAL corner of real, same-level OSM street junctions.
 *
 * Road arms stay on their original OSM centerlines. A new curb return
 * adds only the fillet between two intersecting road edge rays, turning
 * a sharp notch in the asphalt union into a small tangent circular arc.
 * The polygon is shared by pavement union, sidewalk subtraction, road
 * collision height and (indirectly) curb boundary generation.
 */
import {physicalLayer,asphaltPriority} from "./asphalt-union.js";
import {sidewalkWidth} from "./road-corridor.js";

const PI2=Math.PI*2,EPS=1e-8;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const mul=(a,m)=>[a[0]*m,a[1]*m];
const length=a=>Math.hypot(...a);
const norm=a=>{const l=length(a);return l>.02?mul(a,1/l):null;};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const left=u=>[-u[1],u[0]];
const right=u=>[u[1],-u[0]];

function rayArms(road,junction){
  const arms=[];
  for(let i=0;i<road.p.length;i++){
    const p=road.p[i];
    if(length([p[0]-junction[0],p[1]-junction[1]])>.12)continue;
    for(const n of [i-1,i+1]){
      if(n<0||n>=road.p.length)continue;
      const raw=[road.p[n][0]-p[0],road.p[n][1]-p[1]];
      const axis=norm(raw);
      if(!axis)continue;
      arms.push({roadId:road.id,axis,width:(road.widthMeters||7)/2,
        foot:sidewalkWidth(road),reach:length(raw),
        priority:asphaltPriority(road),layer:physicalLayer(road)});
    }
  }
  return arms;
}
/**
 * Build fillet patches as triangle fans. The curb radius is conservative;
 * use no corner when a short OSM segment or narrow angle would cause a
 * fill beyond the known road margin. This deliberately does not round
 * isolated bends or bridges to ground-level crossings.
 */
export function buildJunctionFillets(roads,junctions,heightAt,
  {maxRadius=4,minRadius=.65,arcSegments=6,gradeModels=[]}={}){
  const byId=new Map(roads.map(road=>[String(road.id),road]));
  const grades=new Map();
  for(const model of gradeModels)grades.set(
    model.layer+":"+model.point.map(x=>x.toFixed(2)).join(":"),model);
  const patches=[];
  const diagnostics={junctionsExamined:0,cornersExamined:0,
    cornersRounded:0,skippedGeometry:0,skippedShort:0};
  for(const junction of junctions){
    if(junction.ways.size<2)continue;
    diagnostics.junctionsExamined++;
    const arms=[...junction.ways].flatMap(id=>
      rayArms(byId.get(String(id))||{p:[]},junction.point));
    const layers=new Map();
    for(const arm of arms){
      if(!layers.has(arm.layer))layers.set(arm.layer,[]);
      layers.get(arm.layer).push(arm);
    }
    for(const [layer,group] of layers){
      if(group.length<3)continue;
      const unique=[];
      for(const arm of group){
        const same=unique.find(a=>cross(a.axis,arm.axis)<.045&&
          a.axis[0]*arm.axis[0]+a.axis[1]*arm.axis[1]>.997);
        if(same){
          // Parallel ways represent a carriageway already bounded by the
          // existing real edge; adding a synthetic fillet here is unsafe.
          if(arm.priority>same.priority)Object.assign(same,arm);
        }else unique.push({...arm});
      }
      if(unique.length<3)continue;
      unique.sort((a,b)=>Math.atan2(a.axis[1],a.axis[0])-
        Math.atan2(b.axis[1],b.axis[0]));
      const id=layer+":"+junction.point.map(x=>x.toFixed(2)).join(":");
      const anchor=grades.get(id);
      let model=anchor;
      if(!model){
        const main=[...unique].sort((a,b)=>b.priority-a.priority)[0];
        const delta=3.5;
        const ahead=heightAt(...add(junction.point,mul(main.axis,delta)));
        const behind=heightAt(...add(junction.point,mul(main.axis,-delta)));
        model={axis:main.axis,grade:clamp((ahead-behind)/(2*delta),-.18,.18),
          centerHeight:heightAt(...junction.point)};
      }
      for(let i=0;i<unique.length;i++){
        diagnostics.cornersExamined++;
        const a=unique[i],b=unique[(i+1)%unique.length];
        const theta=(Math.atan2(b.axis[1],b.axis[0])-
          Math.atan2(a.axis[1],a.axis[0])+PI2)%PI2;
        if(theta<Math.PI/3||theta>Math.PI-.25){
          diagnostics.skippedGeometry++;continue;
        }
        // Offset carriageway boundaries meeting inside the SIDEWALK wedge.
        const dA=mul(left(a.axis),a.width),
          dB=mul(right(b.axis),b.width);
        const sep=[dB[0]-dA[0],dB[1]-dA[1]],det=cross(a.axis,b.axis);
        if(Math.abs(det)<.1){diagnostics.skippedGeometry++;continue;}
        const alongA=cross(sep,b.axis)/det;
        const alongB=cross(sep,a.axis)/det;
        if(alongA<-.05||alongB<-.05){
          diagnostics.skippedGeometry++;continue;
        }
        const corner=add(add(junction.point,dA),mul(a.axis,alongA));
        const limitingFoot=Math.min(a.foot,b.foot);
        // Keep the circular corner inside the approximate pedestrian
        // corridor; acute junctions need a smaller radius.
        const geometricCap=limitingFoot*
          (theta<Math.PI/2?1.05:1.6);
        let radius=Math.min(maxRadius,geometricCap);
        const factor=1/Math.tan(theta/2);
        const spare=Math.min(a.reach-alongA,b.reach-alongB);
        if(spare<minRadius*.75){
          diagnostics.skippedShort++;continue;
        }
        radius=Math.min(radius,Math.max(0,spare*.85/factor));
        if(radius<minRadius||!Number.isFinite(radius)){
          diagnostics.skippedShort++;continue;
        }
        const retreat=radius*factor;
        const tangentA=add(corner,mul(a.axis,retreat));
        const tangentB=add(corner,mul(b.axis,retreat));
        const center=add(tangentA,mul(left(a.axis),radius));
        const from=Math.atan2(tangentA[1]-center[1],tangentA[0]-center[0]);
        const sweep=theta-Math.PI;
        const n=Math.max(3,Math.round(arcSegments*(Math.PI-theta)/
          (Math.PI/2)));
        const rim=[];
        for(let k=0;k<=n;k++){
          const angle=from+sweep*k/n;
          rim.push([center[0]+radius*Math.cos(angle),
            center[1]+radius*Math.sin(angle)]);
        }
        // Fan center at the original sharp pavement corner; tangency
        // points and arc form only ADDITIVE area outside the old road.
        const polygons=[];
        for(let k=0;k<rim.length-1;k++)
          polygons.push([corner,rim[k],rim[k+1]]);
        const along=add(junction.point,mul(model.axis,10));
        const heightA=model.centerHeight;
        const heightB=heightA+model.grade*10;
        patches.push({
          id:"round:"+layer+":"+diagnostics.junctionsExamined+":"+i,
          isFillet:true,t:"service",widthMeters:0,layer,
          a:junction.point,b:along,h0:heightA,h1:heightB,
          polygons,junctionPoint:junction.point,corner,radius
        });
        diagnostics.cornersRounded++;
      }
    }
  }
  return {patches,stats:diagnostics};
}
/** On-demand height of only the rounded CORNER FILL polygons. */
export function createFilletSurfaceIndex(fillets,cellSize=35){
  const cells=new Map();
  const key=(i,j)=>i+":"+j;
  for(const patch of fillets){
    for(const poly of patch.polygons){
      const minX=Math.min(...poly.map(x=>x[0])),
        maxX=Math.max(...poly.map(x=>x[0])),
        minZ=Math.min(...poly.map(x=>x[1])),
        maxZ=Math.max(...poly.map(x=>x[1]));
      for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)
        for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++){
          const id=key(x,z);
          if(!cells.has(id))cells.set(id,[]);
          cells.get(id).push({patch,poly});
        }
    }
  }
  function sample(x,z){
    for(const {patch,poly} of cells.get(key(
      Math.floor(x/cellSize),Math.floor(z/cellSize)))||[]){
      const p=[x,z],side=poly.map((a,i)=>
        cross([poly[(i+1)%3][0]-a[0],poly[(i+1)%3][1]-a[1]],
          [p[0]-a[0],p[1]-a[1]]));
      if(!(side.every(v=>v>=-EPS)||side.every(v=>v<=EPS)))continue;
      const dx=patch.b[0]-patch.a[0],dz=patch.b[1]-patch.a[1],
        d=dx*dx+dz*dz;
      const t=d>EPS?((x-patch.a[0])*dx+(z-patch.a[1])*dz)/d:0;
      return patch.h0+(patch.h1-patch.h0)*t+.072;
    }
    return null;
  }
  return {sample};
}
