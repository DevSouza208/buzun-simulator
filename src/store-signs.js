import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { fictionalShopFor } from "./store-brands.js";

function textureFor(brand) {
  const canvas=document.createElement("canvas");
  canvas.width=768; canvas.height=160;
  const ctx=canvas.getContext("2d");
  if(!ctx)return null;
  ctx.fillStyle=brand.bg;
  ctx.fillRect(0,0,768,160);
  ctx.fillStyle=brand.fg;
  ctx.font="900 62px system-ui";
  while(ctx.measureText(brand.name).width>715) {
    const sz=Math.max(23,Math.round(parseFloat(ctx.font.split(" ")[1])*.9));
    ctx.font="900 "+sz+"px system-ui";
    if(sz===23)break;
  }
  ctx.textBaseline="middle";
  ctx.textAlign="center";
  ctx.fillText(brand.name,384,81,715);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

/**
 * Grounded footprint + freely invented name. Signs are simple 3D frontage
 * planes, not floating map-location labels; they use front normals.
 */
export function addFictionalShopSigns(scene,signs) {
  let count=0;
  const limit=26;
  for(const sign of signs.slice(0,limit)) {
    const brand=fictionalShopFor(sign.id,count);
    const texture=textureFor(brand);
    if(!texture)continue;
    const width=Math.max(2.5,Math.min(12,sign.width*.82));
    const height=Math.min(1.0,Math.max(.65,sign.height*.22));
    const plane=new THREE.Mesh(
      new THREE.PlaneGeometry(width,height),
      new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:false})
    );
    plane.rotation.y=Math.atan2(sign.nx,sign.nz);
    plane.position.set(
      sign.x+sign.nx*.28,
      sign.y + Math.min(sign.height-.7,3.25),
      sign.z+sign.nz*.28
    );
    plane.name="BuzunLoja_"+String(sign.id);
    plane.userData={fictional:true,brand:brand.name,osmBuildingId:sign.id};
    scene.add(plane);
    count++;
  }
  return count;
}
