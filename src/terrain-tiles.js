/**
 * Mapzen Terrain Tiles (Terrarium PNG) from the AWS public data set.
 * https://registry.opendata.aws/terrain-tiles/
 * © underlying elevation providers; attribution required.
 * Zoom 13 ~17m pixel ground sampling at São Paulo, NOT a street survey.
 */
export function tileXY(lat,lon,zoom=13){
  const n=2**zoom,latR=lat*Math.PI/180;
  return {x:(lon+180)/360*n,
    y:(1-Math.asinh(Math.tan(latR))/Math.PI)/2*n};
}
export function terrariumHeight(r,g,b){
  return r*256+g+b/256-32768;
}
function resolveTilePixel(lat,lon,z=13){
  const f=tileXY(lat,lon,z);
  return {x:Math.floor(f.x),y:Math.floor(f.y),
    px:Math.max(0,Math.min(255,Math.floor((f.x%1)*256))),
    py:Math.max(0,Math.min(255,Math.floor((f.y%1)*256)))};
}
const TILE_URL="https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
async function loadPNG(x,y,z,signal) {
  const response=await fetch(TILE_URL+"/"+z+"/"+x+"/"+y+".png",{signal});
  if(!response.ok)throw Error("Terrain tiles HTTP "+response.status);
  const blob=await response.blob();
  const bitmap=await createImageBitmap(blob);
  const canvas=document.createElement("canvas");
  canvas.width=canvas.height=256;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(bitmap,0,0,256,256);
  bitmap.close?.();
  return ctx.getImageData(0,0,256,256).data;
}
export async function loadCityElevations(bbox,{zoom=13,timeoutMs=16000}={}) {
  const nw=tileXY(bbox.north,bbox.west,zoom);
  const se=tileXY(bbox.south,bbox.east,zoom);
  const west=Math.floor(nw.x),east=Math.floor(se.x),
    north=Math.floor(nw.y),south=Math.floor(se.y);
  const tileCount=(east-west+1)*(south-north+1);
  if(tileCount>25)throw Error("Recorte muito grande para o nível de detalhe do relevo");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const tiles=new Map();
  try {
    const queue=[];
    for(let y=north;y<=south;y++)for(let x=west;x<=east;x++)queue.push([x,y]);
    // Four at a time to avoid flooding the public tiles service.
    for(let i=0;i<queue.length;i+=4)
      await Promise.all(queue.slice(i,i+4).map(async ([x,y])=>{
        const data=await loadPNG(x,y,zoom,controller.signal);
        tiles.set(x+":"+y,data);
      }));
    const sampleAbsolute=(lat,lon)=>{
      const p=resolveTilePixel(lat,lon,zoom);
      const pixels=tiles.get(p.x+":"+p.y);
      if(!pixels)return null;
      const i=(p.py*256+p.px)*4;
      return terrariumHeight(pixels[i],pixels[i+1],pixels[i+2]);
    };
    const pointSample=(x,z,origin,base=780)=>{
      // Coordinates use the same projection as src/grajau-osm.js.
      const lat=origin.lat-z/111132;
      const lon=origin.lon+x/(111320*Math.cos(origin.lat*Math.PI/180));
      const h=sampleAbsolute(lat,lon);
      return h==null?null:h-base;
    };
    return {source:"Mapzen Terrain Tiles / AWS",bbox,zoom,tiles:tiles.size,pointSample};
  }finally{clearTimeout(timer);}
}
