/**
 * Low-poly facade panels sharing one batched geometry buffer in world.js.
 * No texture downloads and no mesh per window.
 */
export function frontagePanels(front,recipe,sampleHeight) {
  if(!front||!recipe)return [];
  const {a,b,nx,nz,length}=front;
  const base=sampleHeight(...front.mid);
  const h=recipe.height;
  const panels=[];
  const add=(u0,u1,y0,y1,color,offset=.13)=>{
    if(y1<=y0||y0>=h-.04)return;
    const upper=Math.min(y1,h-.1);
    if(upper<=y0)return;
    const x0=a[0]+(b[0]-a[0])*u0+nx*offset;
    const z0=a[1]+(b[1]-a[1])*u0+nz*offset;
    const x1=a[0]+(b[0]-a[0])*u1+nx*offset;
    const z1=a[1]+(b[1]-a[1])*u1+nz*offset;
    panels.push({corners:[[x0,base+y0,z0],[x1,base+y0,z1],
      [x1,base+upper,z1],[x0,base+upper,z0]],color});
  };
  const {accent,trim}=recipe.palette;
  const glazing="#587985",shutter="#647a7e";
  if(recipe.kind==="shop"){
    add(.055,.43,.12,Math.min(2.8,h-.85),glazing);
    add(.47,.96,.12,Math.min(2.8,h-.85),shutter);
    const doorH=Math.min(2.85,h-.9);
    for(let row=1;row<9;row++){
      const y=.12+row*(doorH-.12)/9;
      add(.47,.96,y,y+.036,trim,.17);
    }
    add(.04,.98,Math.min(3.0,h-1.15),Math.min(3.85,h-.3),accent,.21);
    add(.04,.98,.08,.23,trim,.17);
  } else {
    add(.09,.64,.1,Math.min(2.72,h-.8),shutter);
    add(.7,.89,.1,Math.min(2.72,h-.8),accent);
    const gateH=Math.min(2.66,h-.85);
    for(let row=1;row<recipe.gateSlats;row++){
      const y=.1+row*(gateH-.1)/recipe.gateSlats;
      add(.09,.64,y,y+.044,trim,.19);
    }
    add(.68,.92,Math.min(2.8,h-1),Math.min(3.03,h-.5),trim,.19);
  }
  if(recipe.upperWindows && h>5.0) {
    const wh=Math.min(1.25,h-4.1);
    if(wh>.4){
      for(const p of recipe.upperWindows===1?[.38]:[.24,.72]){
        add(p-.115,p+.115,h-1.1-wh,h-1.1,trim,.12);
        add(p-.095,p+.095,h-1.05-wh,h-1.15,glazing,.18);
        add(p-.01,p+.01,h-1.05-wh,h-1.15,trim,.21);
      }
    }
  }
  if(recipe.kind==="sobrado"&&length>8) {
    add(.06,.94,Math.min(3.07,h-1.2),Math.min(3.24,h-1),trim,.24);
  }
  return panels;
}
