/**
 * WorldGen 5.21 — topology-safe visual connectors.
 *
 * Never blindly join nearby asphalt polygons: a gap may be a legitimate
 * crossing, parallel lane, bridge or missing OSM data. A small missing
 * stretch is eligible only when TWO terminal ends of the SAME named,
 * same-layer street face one another and their DEM slope is reasonable.
 * Output is derived rendering data: the original OSM snapshot is immutable.
 */
import {physicalLayer} from "./asphalt-union.js";

export const MAX_ROAD_JOIN_METRES=8;
const CELL=10;
const norm=v=>{const length=Math.hypot(...v);
  return length>.001?[v[0]/length,v[1]/length]:null;};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const normalName=s=>String(s||"").toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const key=(x,z)=>x+":"+z;

function terminal(road,isStart){
  if(!Array.isArray(road.p)||road.p.length<2)return null;
  const at=isStart?0:road.p.length-1,next=isStart?1:at-1;
  const point=road.p[at],inner=road.p[next];
  const inward=norm([inner[0]-point[0],inner[1]-point[1]]);
  if(!inward)return null;
  const width=Number(road.widthMeters)||7;
  const name=normalName(road.n);
  if(name.length<3||width<3)return null;
  return {road,point,inner,inward,isStart,width,name,
    layer:physicalLayer(road)};
}
/**
 * Returned links are the ONLY new road pieces. Natural OSM coordinates,
 * true junctions, original road names and the source graph are unchanged.
 */
export function buildSmoothRoadConnectors(roads,heightAt,{
  maxGap=MAX_ROAD_JOIN_METRES,maxSlope=.32,angleCos=.84
}={}){
  if(typeof heightAt!=="function")throw Error("Height sampler required");
  const endpoints=roads.flatMap(road=>[
    terminal(road,true),terminal(road,false)]).filter(Boolean);
  const cells=new Map();
  for(let i=0;i<endpoints.length;i++){
    const p=endpoints[i].point,k=key(
      Math.floor(p[0]/CELL),Math.floor(p[1]/CELL));
    if(!cells.has(k))cells.set(k,[]);
    cells.get(k).push(i);
  }
  const candidates=[];
  for(let i=0;i<endpoints.length;i++){
    const a=endpoints[i],cx=Math.floor(a.point[0]/CELL),
      cz=Math.floor(a.point[1]/CELL);
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++){
      for(const j of cells.get(key(x,z))||[]){
        if(j<=i)continue;
        const b=endpoints[j];
        if(a.name!==b.name||a.layer!==b.layer||
          String(a.road.id)===String(b.road.id)||
          Boolean(a.road.bridge)!==Boolean(b.road.bridge)||
          Boolean(a.road.tunnel)!==Boolean(b.road.tunnel)||
          Math.min(a.width,b.width)/Math.max(a.width,b.width)<.72)continue;
        const gap=Math.hypot(
          b.point[0]-a.point[0],b.point[1]-a.point[1]);
        if(gap<.3||gap>maxGap)continue;
        const toward=[
          (b.point[0]-a.point[0])/gap,
          (b.point[1]-a.point[1])/gap
        ];
        if(dot(a.inward,toward)>-angleCos||
          dot(b.inward,toward)<angleCos)continue;
        const h0=heightAt(...a.point),h1=heightAt(...b.point);
        if(!Number.isFinite(h0)||!Number.isFinite(h1)||
           Math.abs(h1-h0)>Math.max(.25,gap*maxSlope))continue;
        candidates.push({i,j,a,b,gap,rise:h1-h0});
      }
    }
  }
  candidates.sort((a,b)=>a.gap-b.gap||a.i-b.i||a.j-b.j);
  const used=new Set(),connectors=[];
  for(const entry of candidates){
    const {i,j,a,b,gap}=entry;
    if(used.has(i)||used.has(j))continue;
    used.add(i);used.add(j);
    // Include a short overlap inside each existing road so raster seams and
    // floating-point clipping cannot leave an isolated hairline.
    const overlap=Math.min(.65,gap*.18);
    const from=[
      a.point[0]+a.inward[0]*overlap,
      a.point[1]+a.inward[1]*overlap
    ];
    const to=[
      b.point[0]+b.inward[0]*overlap,
      b.point[1]+b.inward[1]*overlap
    ];
    const count=Math.max(2,Math.ceil(gap/2));
    const p=[from];
    for(let step=0;step<=count;step++){
      const t=step/count;
      p.push([
        a.point[0]+(b.point[0]-a.point[0])*t,
        a.point[1]+(b.point[1]-a.point[1])*t
      ]);
    }
    p.push(to);
    const widthMeters=Math.min(a.width,b.width);
    connectors.push({
      id:"buzun:join:"+String(a.road.id)+":"+String(b.road.id)+":"+i+":"+j,
      n:a.road.n,t:a.road.t,widthMeters,layer:a.layer,
      bridge:Boolean(a.road.bridge),tunnel:Boolean(a.road.tunnel),
      widthSource:"inferred:continuity",p,
      visualConnector:true,joinGapMetres:gap
    });
  }
  return {connectors,stats:{
    endpoints:endpoints.length,eligiblePairs:candidates.length,
    connected:connectors.length,rejectedOrUnrelated:endpoints.length-
      connectors.length*2
  }};
}
