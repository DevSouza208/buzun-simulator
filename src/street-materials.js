/**
 * WorldGen 5.9 — deterministic, repeating world-space street materials.
 *
 * These are tiny CPU-created DataTexture inputs, not external photos/assets.
 * Triangles receive UVs from their original metric X/Z positions: splitting
 * them at an intersection cannot change the paving pattern or add seams.
 * Exact same data on any device, independent of random seed and time.
 */
const CONFIG=Object.freeze({
  asphalt:{base:[63,72,78],tileMetres:7,noise:4},
  sidewalk:{base:[204,196,182],tileMetres:2.4,noise:3},
  median:{base:[118,148,108],tileMetres:4.4,noise:13}
});
const hash=(x,y,seed)=>{
  let n=(Math.imul(x+17,374761393)^Math.imul(y+23,668265263)^seed)|0;
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)%1024/1023;
};
const color=(n)=>Math.max(0,Math.min(255,Math.round(n)));
export function streetMaterialSpec(kind){
  const c=CONFIG[kind];if(!c)throw Error("Material viário desconhecido: "+kind);
  return c;
}
export function streetUv(x,z,kind){
  const tile=streetMaterialSpec(kind).tileMetres;
  return [x/tile,z/tile];
}
export function streetTexturePixels(kind,size=64){
  if(!Number.isInteger(size)||size<16||size>256)
    throw Error("Tamanho de textura incompatível");
  const {base,noise}=streetMaterialSpec(kind);
  const pixels=new Uint8Array(size*size*4);
  let low=255,high=0,seamPixels=0;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const random=hash(x,z,kind==="asphalt"?7:kind==="sidewalk"?13:29);
    let v=(random-.5)*2*noise;
    if(kind==="sidewalk"){
      // Delicate expansion joints between square pavement blocks.
      // Edges wrap cleanly in both directions and stay world-aligned
      // when a sidewalk is clipped by an intersection or curb cut.
      if(x===0||z===0){v-=22;seamPixels++;}
      else if(x===1||z===1){v-=7;seamPixels++;}
      else if((x>size*.48&&x<size*.54)&&
              (z>size*.48&&z<size*.54))v-=2;
    }else if(kind==="asphalt"){
      // Grain is subtle; do not paint sharp lane-looking stripes.
      if(hash(x,z,61)>.986)v+=6;
    }else{
      // Grass flecks break repetition without adding grass blade meshes.
      if(hash(x,z,83)>.76)v+=6;
    }
    const index=(z*size+x)*4;
    for(let c=0;c<3;c++){
      const channel=color(base[c]+v+(c===0?0:c===2?-1:1));
      pixels[index+c]=channel;
      low=Math.min(low,channel);high=Math.max(high,channel);
    }
    pixels[index+3]=255;
  }
  return {kind,size,data:pixels,tileMetres:CONFIG[kind].tileMetres,
    low,high,seamPixels};
}
