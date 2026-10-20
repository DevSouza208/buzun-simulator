import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { drapedSections } from "./draped-road.js";

/** Small, disposable 3D modelling overlay on the ACTUAL Three.js scenery.
 * Geometry is only a preview of a single selected way. Press "Aplicar no
 * jogo" to regenerate the authoritative asphalt, curb, terrain and collision.
 */
export function buildRoadModelPreview(road,heightAt,{
  asphalt=Number(road.widthMeters)||7,
  walk=Number(road.sidewalkMeters)||1.65,
  curb=Number(road.curbHeightMeters??.14),
  corner=Number(road.cornerClearanceMeters??0)
}={}){
  const group=new THREE.Group();
  group.name="BuzunCreate_Preview_Only";
  const sampled=drapedSections(road.p,(x,z)=>heightAt(x,z)-.072,{step:4});
  if(sampled.length<2)return group;
  const surface=[],sidewalks=[],border=[];
  const add=(target,a,b,c,d)=>{
    target.push(...a,...b,...c,...a,...c,...d);
  };
  function normal(i){
    const p=sampled[i].p,prev=sampled[Math.max(0,i-1)].p,
      next=sampled[Math.min(sampled.length-1,i+1)].p;
    const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1;
    return [-dz/len,dx/len];
  }
  function pt(i,offset,up){
    const sec=sampled[i],n=normal(i);
    return [sec.p[0]+n[0]*offset,sec.base+up,
      sec.p[1]+n[1]*offset];
  }
  for(let i=1;i<sampled.length;i++){
    const j=i-1,half=asphalt/2,high=.072+.12;
    add(surface,pt(j,-half,high),pt(i,-half,high),
      pt(i,half,high),pt(j,half,high));
    for(const side of [-1,1]){
      const inner=side*half,outer=side*(half+walk);
      add(sidewalks,pt(j,inner,high+curb+.035),
        pt(i,inner,high+curb+.035),
        pt(i,outer,high+curb+.035),
        pt(j,outer,high+curb+.035));
      border.push(...pt(j,inner,high+curb+.07),...pt(i,inner,high+curb+.07));
      border.push(...pt(j,outer,high+curb+.07),...pt(i,outer,high+curb+.07));
    }
  }
  function mesh(vertices,color,alpha){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    geometry.computeVertexNormals();
    const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,
      transparent:true,opacity:alpha,depthTest:false,depthWrite:false});
    const m=new THREE.Mesh(geometry,material);
    m.frustumCulled=false;m.renderOrder=20;
    group.add(m);
  }
  mesh(surface,"#4cbac6",.43);
  mesh(sidewalks,"#b8f171",.66);
  if(border.length){
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(border,3));
    const line=new THREE.LineSegments(g,new THREE.LineBasicMaterial({
      color:"#f2f5b6",transparent:true,opacity:.94,depthTest:false}));
    line.renderOrder=21;group.add(line);
  }
  group.userData={preview:true,cornerCutMeters:corner};
  return group;
}
export function disposePreview(group){
  if(!group)return;
  group.parent?.remove(group);
  group.traverse(obj=>{
    obj.geometry?.dispose();
    if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());
    else obj.material?.dispose();
  });
}
