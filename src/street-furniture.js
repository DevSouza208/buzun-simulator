import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { utilityPolePlan } from "./street-props.js";

/** A few shared meshes, not hundreds of unique building draw calls. */
export function buildStreetFurniture(scene,route,segments,collides,heightAt) {
  const poles=utilityPolePlan(route,segments,collides);
  if(!poles.length)return {count:0};
  const pole=new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.14,.19,10.3,6),
    new THREE.MeshLambertMaterial({color:"#a1a7a5",flatShading:true}),
    poles.length
  );
  const crossbar=new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.7,.14,.2),
    new THREE.MeshLambertMaterial({color:"#5e7279",flatShading:true}),
    poles.length
  );
  const dummy=new THREE.Object3D();
  for(let i=0;i<poles.length;i++) {
    const p=poles[i],y=heightAt(p.x,p.z);
    dummy.rotation.set(0,0,0);
    dummy.position.set(p.x,y+5.15,p.z);
    dummy.updateMatrix(); pole.setMatrixAt(i,dummy.matrix);
    dummy.position.set(p.x,y+9.4,p.z);
    dummy.rotation.y=p.heading;
    dummy.updateMatrix(); crossbar.setMatrixAt(i,dummy.matrix);
  }
  pole.instanceMatrix.needsUpdate=true;
  crossbar.instanceMatrix.needsUpdate=true;
  scene.add(pole,crossbar);

  const lines=[];
  for(let i=1;i<poles.length;i++) {
    const a=poles[i-1],b=poles[i];
    const gap=Math.hypot(a.x-b.x,a.z-b.z);
    if(a.side!==b.side||gap>85)continue; // No cables jumping the avenue.
    for(const shift of [-.6,.6]) {
      const ca=Math.cos(a.heading)*shift,sa=Math.sin(a.heading)*shift;
      const cb=Math.cos(b.heading)*shift,sb=Math.sin(b.heading)*shift;
      const ay=heightAt(a.x,a.z)+9.4,by=heightAt(b.x,b.z)+9.4;
      const sample=t=>[
        a.x+ca+(b.x+cb-a.x-ca)*t,
        ay+(by-ay)*t-1.1*4*t*(1-t),
        a.z+sa+(b.z+sb-a.z-sa)*t
      ];
      for(let j=1;j<=5;j++)lines.push(...sample((j-1)/5),...sample(j/5));
    }
  }
  if(lines.length) {
    const geom=new THREE.BufferGeometry();
    geom.setAttribute("position",new THREE.Float32BufferAttribute(lines,3));
    const wires=new THREE.LineSegments(geom,new THREE.LineBasicMaterial({color:"#263c4a",transparent:true,opacity:.66}));
    wires.frustumCulled=false;
    scene.add(wires);
  }
  return {count:poles.length,wires:lines.length/6};
}
