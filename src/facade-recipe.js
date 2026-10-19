/**
 * Pure semantic-to-facade planning. No external image API is called:
 * references and possible textures are explicit inputs, not scraped guesses.
 */
export const FACADE_PRESETS = Object.freeze({
  casa_portao: { label: "Casa e portão", height: 5.6, wall: "#e2c39e", roof: "#996c57", accent: "#4a6571", gate: "ferro-vertical", windows: 1 },
  comercio: { label: "Fachada comercial (demonstração)", height: 5.1, wall: "#d1d7cc", roof: "#6b8984", accent: "#e5a86c", gate: "enrolar-comercial", windows: 0 },
  sobrado: { label: "Sobrado (demonstração)", height: 8.8, wall: "#b9d0ca", roof: "#607b76", accent: "#d2aa84", gate: "garagem-metal", windows: 3 },
});
export function footprintInfo(building) {
  const pts=building.p.slice();
  if(pts.length>2&&pts[0][0]===pts.at(-1)[0]&&pts[0][1]===pts.at(-1)[1])pts.pop();
  if(pts.length<3) return null;
  const area=pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2;
  if(!Number.isFinite(area)||Math.abs(area)<12)return null;
  return {points:pts,area:Math.abs(area),signedArea:area,center:pts.reduce((s,p)=>[s[0]+p[0]/pts.length,s[1]+p[1]/pts.length],[0,0])};
}
export function planPilot(map,pilot) {
  const buildings=new Map(map.buildings.map(b=>[b.id,b]));
  const result=[];
  for(const item of pilot?.buildings||[]) {
    if(!Number.isInteger(item.osmId)||!(item.preset in FACADE_PRESETS))continue;
    const building=buildings.get(item.osmId),footprint=building&&footprintInfo(building);
    if(!footprint)continue;
    result.push({osmId:item.osmId,building,footprint,preset:item.preset,...FACADE_PRESETS[item.preset],note:item.note||""});
  }
  return result;
}
