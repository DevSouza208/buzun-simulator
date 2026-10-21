/**
 * WorldGen 7.1 — anti-aliased pavement without raising GPU geometry.
 *
 * Render road coverage at 2x pixel density and downsample into the SAME
 * 768px texture. All X/Z coordinates and true metric road widths remain
 * untouched. The temporary scratch canvas is discarded after each tile.
 *
 * This is intentionally independent of DOM globals for deterministic tests.
 */
export const FLAT_ASPHALT_SUPERSAMPLE=2;

export function paintFlatAsphaltTexture(ctx,plan,gx,gz,{
  resolution=768,gutter=2,quality="smooth",createCanvas=null
}={}){
  if(!ctx||typeof plan?.drawTile!=="function")
    throw Error("Pavement painter needs a canvas context and an OSM plan");
  if(!Number.isInteger(resolution)||resolution<32||
    !Number.isInteger(gutter)||gutter<0)
    throw Error("Invalid pavement texture size");
  if(quality!=="fast"&&quality!=="smooth")
    throw Error("Unknown asphalt texture quality");
  if(quality==="fast"){
    const result=plan.drawTile(ctx,gx,gz,{resolution,gutter});
    return {...result,quality,supersampling:1};
  }
  if(typeof createCanvas!=="function")
    throw Error("Smooth asphalt painting requires a scratch canvas factory");
  const scale=FLAT_ASPHALT_SUPERSAMPLE;
  const scratch=createCanvas();
  scratch.width=(resolution+2*gutter)*scale;
  scratch.height=(resolution+2*gutter)*scale;
  const high=scratch.getContext("2d",{alpha:false});
  if(!high)throw Error("Canvas 2D unavailable for supersampling");
  const result=plan.drawTile(high,gx,gz,{
    resolution:resolution*scale,gutter:gutter*scale
  });
  // Downsample the whole image INCLUDING gutter; UVs remain identical and
  // a street crossing an edge still samples the same global coordinates.
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(scratch,0,0,scratch.width,scratch.height,
    0,0,resolution+2*gutter,resolution+2*gutter);
  scratch.width=0;
  scratch.height=0;
  return {...result,dimension:resolution+2*gutter,
    resolution,gutter,quality,supersampling:scale};
}
