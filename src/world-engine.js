import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { planPilot } from "./facade-recipe.js";

/**
 * Buzun World Engine / proof of concept
 * OSM footprint -> semantic preset -> geometry + modular gate/window assets.
 * No synthetic/photo labels are asserted as true street identities.
 * TODO: material-provider accepts licensed texture assets from R2 later.
 */
function mat(hex){return new THREE.MeshLambertMaterial({color:hex,side:THREE.DoubleSide,flatShading:true});}
function box(group,w,h,d,where,color){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
  mesh.position.set(...where);group.add(mesh);return mesh;
}
function quad(group,a,b,c,d,color){
  const xyz=[...a,...b,...c,...a,...c,...d];
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(xyz,3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo,mat(color)));
}
function panel(group,front,u0,u1,y0,y1,color,offset=.085){
  const {a,b,nx,nz}=front;
  const at=u=>[a[0]+(b[0]-a[0])*u+nx*offset,a[1]+(b[1]-a[1])*u+nz*offset];
  const p=at(u0),q=at(u1);
  quad(group,[p[0],y0,p[1]],[q[0],y0,q[1]],[q[0],y1,q[1]],[p[0],y1,p[1]],color);
}
function chooseFront(footprint,closest) {
  const poly=footprint.points;
  let result=null;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<4.1)continue;
    const p=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const nearest=closest(p[0],p[1]);
    const dist=nearest?.distance??Infinity;
    const ranking=dist+.14*Math.abs(length-10);
    if(!result||ranking<result.ranking){
      const dir=footprint.signedArea>=0?1:-1;
      result={a,b,length,ranking,nx:dir*dz/length,nz:-dir*dx/length};
    }
  }
  return result;
}
function drawShell(group,plan,atHeight) {
  const {footprint,wall,roof,height}=plan;
  const poly=footprint.points,center=footprint.center, base=atHeight(center[0],center[1]), roofY=base+height;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length];
    quad(group,[a[0],atHeight(...a)-.04,a[1]],[b[0],atHeight(...b)-.04,b[1]],
      [b[0],roofY,b[1]],[a[0],roofY,a[1]],wall);
  }
  try {
    const faces=THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(...p)),[]);
    for(const [i,j,k] of faces){
      const a=poly[i],b=poly[j],c=poly[k];
      quad(group,[a[0],roofY,a[1]],[b[0],roofY,b[1]],[c[0],roofY,c[1]],[c[0],roofY,c[1]],roof);
    }
  }catch {/* malformed footprint: walls are still valid */}
  return base;
}
function paintGate(group,front,base,{preset,accent}){
  const gateBottom=base+.04, gateTop=base+2.63;
  if(preset==="casa_portao"){
    panel(group,front,.12,.67,gateBottom,gateTop,"#344e59");
    panel(group,front,.13,.66,base+.24,base+.32,"#b6b8ab",.12);
    for(let i=0;i<11;i++){
      const u=.145+i*.049;
      panel(group,front,u,u+.007,base+.27,base+2.5,"#d4c9aa",.14);
    }
    panel(group,front,.75,.92,base+.21,base+2.63,accent);
    panel(group,front,.81,.83,base+1.2,base+1.32,"#e9e6cf",.12);
  }else if(preset==="comercio"){
    panel(group,front,.06,.41,base+.22,base+2.9,"#466974");
    panel(group,front,.45,.96,base+.22,base+2.9,"#455764");
    // Modular rolling metal shutter and a light awning, not a photograph.
    for(let i=0;i<9;i++){
      const y=base+.27+i*.28;
      panel(group,front,.45,.96,y,y+.045,"#a2b1ae",.14);
    }
    panel(group,front,.02,.98,base+3.3,base+4.15,accent,.19);
    panel(group,front,.02,.98,base+3.08,base+3.28,"#f0ddb8",.25);
  }else{
    panel(group,front,.08,.55,base+.12,base+2.9,"#3d5660");
    for(let i=1;i<9;i++){
      const u=.08+i*.052;
      panel(group,front,u,u+.007,base+.23,base+2.75,"#c4d0c7",.11);
    }
    panel(group,front,.67,.88,base+.2,base+2.75,accent);
    panel(group,front,.16,.40,base+4.35,base+6.3,"#648c99");
    panel(group,front,.58,.82,base+4.35,base+6.3,"#648c99");
    panel(group,front,.52,.54,base+4.25,base+6.45,"#edf1e3",.15);
    panel(group,front,.08,.91,base+3.1,base+3.3,"#f5e3c4",.16);
  }
}
/**
 * Creates only 3 facades. Others keep the usual procedural building batch.
 * Returns completed plans, ready for the future inspector/editor.
 */
export function buildPilotFacades(scene,map,manifest,{sampleHeight,nearestStreet}){
  const plans=planPilot(map,manifest);
  const complete=[];
  for(const plan of plans){
    const front=chooseFront(plan.footprint,nearestStreet);
    if(!front)continue;
    const group=new THREE.Group();
    group.name="BuzunFacade_OSM_"+plan.osmId;
    group.userData={osmId:plan.osmId,preset:plan.preset,isDemonstration:true};
    const base=drawShell(group,plan,sampleHeight);
    paintGate(group,front,base,plan);
    scene.add(group);
    complete.push({osmId:plan.osmId,preset:plan.preset,label:plan.label,frontLength:Math.round(front.length*10)/10});
  }
  return complete;
}
