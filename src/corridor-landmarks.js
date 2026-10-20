import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { segmentProjection } from "./geo.js";

function material(color){return new THREE.MeshLambertMaterial({color,side:THREE.DoubleSide,flatShading:true});}
function sign(text,primary,secondary){
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=256;
  const c=canvas.getContext("2d");c.fillStyle=primary;c.beginPath();c.roundRect(5,5,1014,246,30);c.fill();
  c.fillStyle=secondary;c.font="bold 96px system-ui";c.textAlign="center";c.textBaseline="middle";c.fillText(text,512,133,925);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthWrite:false,depthTest:true}));
  sp.scale.set(23,5.75,1);return sp;
}
function wallPanel(group,a,b,low,high,color,offset=0){
  const d=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...d)||1;
  const x=(d[1]/len)*offset,z=(-d[0]/len)*offset;
  const v=[a[0]+x,low,a[1]+z,b[0]+x,low,b[1]+z,b[0]+x,high,b[1]+z,
           a[0]+x,low,a[1]+z,b[0]+x,high,b[1]+z,a[0]+x,high,a[1]+z];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(v,3));geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry,material(color)));
}
function faceOnBuilding(building,near){
  const poly=building.p.slice();
  if(poly.length>3 && poly.at(-1)[0]===poly[0][0]&&poly.at(-1)[1]===poly[0][1])poly.pop();
  let best=null;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],q=near(...mid);
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<3.5)continue;
    const score=q.distance+.15*Math.abs(length-11);
    if(!best||score<best.score)best={a,b,mid,length,score};
  }
  return best;
}
/**
 * Grounded anchors from OSM/official addresses; built storefront materials are
 * illustrative only, NOT reproductions from Google Street View.
 * Habib's is mapped by OSM building ID; McDonalds building footprint match is
 * intentionally left provisional until a human confirms it.
 */
export function buildCorridorLandmarks(scene,map,{sampleHeight,closestStreet}) {
  if(!map.landmarks?.length)return [];
  const results=[];
  for(const loc of map.landmarks){
    const baseName=loc.key==="mcdonalds"?"McDonald's":"Habib's";
    // Real address remains the route anchor; fictional brands dress the game.
    const fictionalName=loc.key==="mcdonalds"?"Mc Donaits":"HabiBuz";
    const brand=loc.key==="mcdonalds"
      ? {primary:"#cc302f",secondary:"#ffe783",walls:"#ead5ae",glass:"#4f7c89"}
      : {primary:"#174b9b",secondary:"#f9f2dc",walls:"#ddd8c9",glass:"#456d91"};
    const group=new THREE.Group();group.name="BuzunLandmark_"+loc.key;
    group.userData={key:loc.key,confidence:loc.confidence||"unverified",referenceOnly:true,fictionalStoreBrand:fictionalName};
    const found=map.buildings.find(b=>b.id===loc.buildingId);
    const alternatives=map.buildings.map(b=>{
      const p=b.p.slice(0,-1),cx=p.reduce((s,v)=>s+v[0],0)/p.length,cz=p.reduce((s,v)=>s+v[1],0)/p.length;
      return {b,d:Math.hypot(cx-loc.xy[0],cz-loc.xy[1])};
    }).sort((a,b)=>a.d-b.d);
    const building=found || (alternatives[0]?.d<35?alternatives[0].b:null);
    const confirmed=!!found;
    if(building){
      const f=faceOnBuilding(building,closestStreet);
      if(f){
        const y=sampleHeight(...f.mid);
        // The actual building outline is from OSM; only this sign/storefront
        // treatment is a stylized visual approximation.
        const d=[f.b[0]-f.a[0],f.b[1]-f.a[1]];
        const left=[f.a[0]+d[0]*.09,f.a[1]+d[1]*.09];
        const right=[f.a[0]+d[0]*.91,f.a[1]+d[1]*.91];
        wallPanel(group,left,right,y+.15,y+3.15,brand.glass,.09);
        wallPanel(group,left,right,y+3.18,y+4.1,brand.primary,.14);
        const mid=f.mid;
        const label=sign(fictionalName,brand.primary,brand.secondary);
        label.scale.set(Math.max(11,Math.min(21,f.length*.95)),4.6,1);
        label.position.set(mid[0],y+6.3,mid[1]);
        group.add(label);
        // simple brand-colored doors/columns; no licensed photographic assets.
        for(const t of [.16,.84]){
          const px=f.a[0]+d[0]*t,pz=f.a[1]+d[1]*t;
          const pillar=new THREE.Mesh(new THREE.BoxGeometry(.32,3.0,.32),material(brand.secondary));
          pillar.position.set(px,y+1.65,pz);group.add(pillar);
        }
      }
    }
    const nearest=closestStreet(...loc.xy);
    const marker=sign(fictionalName,brand.primary,brand.secondary);
    marker.scale.set(18,4.5,1);
    const bx=building ? building.p.slice(0,-1).reduce((s,v)=>s+v[0],0)/(building.p.length-1) : loc.xy[0];
    const bz=building ? building.p.slice(0,-1).reduce((s,v)=>s+v[1],0)/(building.p.length-1) : loc.xy[1];
    marker.position.set(bx,sampleHeight(bx,bz)+14,bz);
    group.add(marker);
    scene.add(group);
    results.push({key:loc.key,label:baseName,xy:loc.xy,buildingId:building?.id||null,confirmedFootprint:confirmed,
      roadPoint:nearest?[nearest.x,nearest.z]:loc.xy});
  }
  // Additional business names come from OSM semantic tags, not photographs.
  // They are locator cards only, not assertions about actual facade designs.
  const placeNames=new Set(["habib's","habbibs"]);
  for(const poi of map.pois||[]){
    if(!poi.n || placeNames.has(poi.n.trim().toLowerCase()))continue;
    const text=sign(poi.n,"#263c46","#e3f4d0");
    text.name="OSM_POI_"+poi.id;
    text.userData={osmId:poi.id,classification:poi.t,source:"OpenStreetMap",appearanceVerified:false};
    text.scale.set(Math.max(9,Math.min(21,poi.n.length*1.15)),3.2,1);
    text.position.set(poi.p[0],sampleHeight(...poi.p)+8.5,poi.p[1]);
    scene.add(text);
  }
  for(const b of map.buildings||[]){
    if(!b.n||b.n==="Habib's")continue;
    const points=b.p.slice(0,-1);
    const x=points.reduce((sum,p)=>sum+p[0],0)/points.length;
    const z=points.reduce((sum,p)=>sum+p[1],0)/points.length;
    const label=sign(b.n,"#263d42","#e5edcb");
    label.name="OSM_NamedBuilding_"+b.id;
    label.userData={osmId:b.id,source:"OpenStreetMap",appearanceVerified:false};
    label.scale.set(Math.max(9,Math.min(20,b.n.length*1.2)),3.2,1);
    label.position.set(x,sampleHeight(x,z)+10,z);
    scene.add(label);
  }
  return results;
}
