import {readFileSync,writeFileSync} from "node:fs";
import {buildRoadCorridor} from "../src/corridor.js";
/* Offline build step of future Create tool. Run: node scripts/build-osm-blocks.mjs.
 * Uses one OSM small-bbox API request (never called by the player's browser).
 * Does not download proprietary photos or invent real store appearances.
 */
const read=p=>JSON.parse(readFileSync(p,"utf8"));
const c=read("config/belmira-corridor.json");
const backbone=read("public/data/belmira-marin.json");
const o=backbone.origin;
const pos=(lat,lon)=>[Math.round((lon-o.lon)*111320*Math.cos(o.lat*Math.PI/180)*10)/10,Math.round((o.lat-lat)*111132*10)/10];
function dist(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
const route=buildRoadCorridor(backbone.roads,c.start,c.end,o);
const edges=route.points.slice(1).map((p,i)=>[route.points[i],p]);
const near=p=>edges.reduce((d,[a,b])=>Math.min(d,dist(p,a,b)),Infinity);
const url="https://api.openstreetmap.org/api/0.6/map.json?bbox="+c.bbox.join(",");
const response=await fetch(url);
if(!response.ok)throw Error("OpenStreetMap API "+response.status);
const osm=await response.json(),nodes=new Map(osm.elements.filter(x=>x.type==="node").map(n=>[n.id,n]));
const p=id=>{const n=nodes.get(id);return n?pos(n.lat,n.lon):null};
const types=new Set(["primary","secondary","tertiary","residential","unclassified","service","living_street","primary_link","secondary_link","tertiary_link"]);
const roads=[],buildings=[],pois=[];
for(const w of osm.elements){
 const tags=w.tags||{};
 if(w.type==="node"&&(tags.amenity||tags.shop)){const v=pos(w.lat,w.lon);if(near(v)<c.buildingBufferMeters)pois.push({id:w.id,n:tags.name||"",t:tags.amenity||tags.shop,p:v});continue;}
 if(w.type!=="way"||!w.nodes)continue;
 const poly=w.nodes.map(p).filter(Boolean);
 if(types.has(tags.highway)&&poly.length>1){
  let segment=[],part=0;
  const flush=()=>{if(segment.length>1)roads.push({id:w.id*100+part++,sourceWayId:w.id,t:tags.highway,n:tags.name||"",o:tags.oneway||"",p:segment});segment=[];};
  for(let i=1;i<poly.length;i++){
   const a=poly[i-1],b=poly[i],n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/5));
   for(let j=0;j<=n;j++){
    const f=j/n,q=[Math.round((a[0]+(b[0]-a[0])*f)*10)/10,Math.round((a[1]+(b[1]-a[1])*f)*10)/10];
    if(near(q)<(tags.name===c.avenue?c.mainRoadBufferMeters:c.sideRoadBufferMeters)){
      if(!segment.length||Math.hypot(q[0]-segment.at(-1)[0],q[1]-segment.at(-1)[1])>.2)segment.push(q);
    } else flush();
   }
  }
  flush();
 }
 if(tags.building&&poly.length>=4&&w.nodes[0]===w.nodes.at(-1)){
  const shape=poly.slice(0,-1),center=[shape.reduce((s,v)=>s+v[0],0)/shape.length,shape.reduce((s,v)=>s+v[1],0)/shape.length];
  if(shape.length<=60&&near(center)<c.buildingBufferMeters)buildings.push({id:w.id,t:tags.building,n:tags.name||"",use:tags.amenity||tags.shop||"",height:tags.height||null,levels:tags["building:levels"]||null,p:poly});
 }
}
const hab=buildings.find(b=>b.n==="Habib's");
if(!hab||roads.length<20||buildings.length<100)throw Error("Source data not validated");
const landmarks=[
 {key:"mcdonalds",label:"McDonald's",address:c.start.address,lat:c.start.lat,lon:c.start.lon,xy:pos(c.start.lat,c.start.lon),buildingId:null,confidence:"official address; facade not verified"},
 {key:"habibs",label:"Habib's",address:c.end.address,lat:c.end.lat,lon:c.end.lon,xy:pos(c.end.lat,c.end.lon),buildingId:hab.id,confidence:"official address and OSM tagged building"}
];
const output={schema:1,source:"© OpenStreetMap contributors ODbL",origin:o,bbox:c.bbox,
 description:"Real OSM McDonald's-to-Habib's low-poly corridor",route:route.points,routeLengthMeters:Math.round(route.lengthMeters),
 roads,buildings,pois,landmarks,licenseNote:"References are geometric and semantic; no Street View assets copied."};
writeFileSync("public/data/belmira-corridor.json",JSON.stringify(output));
console.log(JSON.stringify({status:"success",length:output.routeLengthMeters,roads:roads.length,buildings:buildings.length,poi:pois.length}));
