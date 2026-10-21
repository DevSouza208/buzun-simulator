import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  paintFlatAsphaltTexture,FLAT_ASPHALT_SUPERSAMPLE
} from "../src/worldgen-flat-texture-quality.js";
import {
  FLAT_ASPHALT_TEXTURE_PIXELS,FLAT_ASPHALT_GUTTER_PIXELS,
  createFlatAsphaltPlan
} from "../src/worldgen-flat-asphalt-surface.js";

const road=(id,p,widthMeters=8)=>({
  id,p,widthMeters,n:"Avenida",t:"primary",layer:0
});
function mockCanvas(){
  const calls=[];
  const ctx={
    beginPath(){},moveTo(){},lineTo(){},fillRect(){},
    stroke(){},lineJoin:"",lineCap:"",lineWidth:0,
    imageSmoothingEnabled:false,imageSmoothingQuality:"low",
    drawImage(canvas,...args){
      calls.push({canvasWidth:canvas.width,canvasHeight:canvas.height,
        args});
    }
  };
  return {ctx,calls};
}
test("7.1: SSAA paints at 2x but preserves 768px final GPU dimensions",()=>{
  const atlas=createFlatAsphaltPlan([
    road("a",[[390,30],[420,30],[450,30]],12)
  ]);
  let planned=null;
  const observed=[];
  const plan={drawTile(ctx,gx,gz,opts){
    planned={gx,gz,opts};
    const result=atlas.drawTile(ctx,gx,gz,opts);
    observed.push(result);
    return result;
  }};
  const normal=mockCanvas(),scratchContext=mockCanvas();
  const buffer={width:0,height:0,
    getContext(){return scratchContext.ctx}};
  const result=paintFlatAsphaltTexture(normal.ctx,plan,1,0,{
    resolution:768,gutter:2,createCanvas:()=>buffer
  });
  assert.equal(FLAT_ASPHALT_SUPERSAMPLE,2);
  assert.equal(planned.opts.resolution,1536);
  assert.equal(planned.opts.gutter,4);
  assert.equal(planned.gx,1);
  assert.equal(observed[0].painted,1);
  assert.equal(result.resolution,768);
  assert.equal(result.dimension,772);
  assert.equal(result.supersampling,2);
  assert.equal(result.quality,"smooth");
  assert.equal(normal.ctx.imageSmoothingEnabled,true);
  assert.equal(normal.ctx.imageSmoothingQuality,"high");
  assert.deepEqual(normal.calls[0].args,[0,0,1544,1544,0,0,772,772]);
  assert.equal(normal.calls[0].canvasWidth,1544);
  assert.equal(buffer.width,0,"scratch data released when complete");
  assert.equal(buffer.height,0);
});
test("7.1: fast mode retains exact old raster width, no scratch canvas",()=>{
  const plan=createFlatAsphaltPlan([road("a",[[0,0],[100,0]],12)]);
  const {ctx}=mockCanvas();
  const result=paintFlatAsphaltTexture(ctx,plan,0,0,{
    resolution:768,gutter:2,quality:"fast",
    createCanvas:()=>{throw Error("fast must never allocate scratch canvas")}
  });
  assert.equal(result.painted,1);
  assert.equal(result.quality,"fast");
  assert.equal(result.supersampling,1);
});
test("7.1: SSAA keeps metric road widths and world-coordinate tile seams",()=>{
  const pts=[[390,40],[420,40],[450,40]];
  const plan=createFlatAsphaltPlan([road("osm",pts,10)]);
  const paths=[];
  const ctx={
    beginPath(){this.path=[]},moveTo(x,y){this.path.push([x,y])},
    lineTo(x,y){this.path.push([x,y])},
    stroke(){paths.push({width:this.lineWidth,coords:this.path})},
    fillRect(){}
  };
  plan.drawTile(ctx,0,0,{resolution:1536,gutter:4});
  plan.drawTile(ctx,1,0,{resolution:1536,gutter:4});
  assert.equal(paths.length,6);
  assert.equal(paths[2].width/(1536/420),10);
  const west=paths[2].coords[1];
  const east=paths[5].coords[1];
  assert.equal(west[0],1540);
  assert.equal(east[0],4);
  assert.equal(west[1],east[1]);
});
test("7.1: smooth texture is experimental and can be disabled via quality=fast",()=>{
  const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
  const terrain=readFileSync(new URL("../src/worldgen-sheet-terrain.js",import.meta.url),"utf8");
  const city=readFileSync(new URL("../src/city-world-stream.js",import.meta.url),"utf8");
  assert.match(main,/get\("quality"\)==="fast"\?"fast":"smooth"/);
  assert.match(city,/flatAsphaltPlan,flatTextureQuality/);
  assert.match(terrain,/paintFlatAsphaltTexture\(ctx,flatAsphaltPlan/);
  assert.match(terrain,/texture\.anisotropy=8/);
  assert.match(terrain,/texture\.minFilter=THREE\.LinearMipmapLinearFilter/);
});
test("7.1: reject invalid quality before starting a costly raster",()=>{
  const plan=createFlatAsphaltPlan([]);
  assert.throws(()=>paintFlatAsphaltTexture({},plan,0,0,{quality:"broken"}),
    /Unknown asphalt texture quality/);
  assert.equal(FLAT_ASPHALT_TEXTURE_PIXELS,768);
  assert.equal(FLAT_ASPHALT_GUTTER_PIXELS,2);
});
