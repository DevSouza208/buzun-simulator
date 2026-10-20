/**
 * One-shot server-side Overpass snapshot for Grajaú.
 * Run manually: npm run world:grajau
 * Never fetch from all visitors if a snapshot can be distributed statically.
 */
import { writeFileSync } from "node:fs";
import { waysFromOverpass, overpassQuery, GRAJAU_BBOX, ORIGIN, graphFromRoads } from "../src/grajau-osm.js";

const endpoints=[
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const query=overpassQuery();
async function attempt(endpoint){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),135000);
  try{
    const response=await fetch(endpoint,{
      method:"POST",
      body:"data="+encodeURIComponent(query),
      headers:{
        "content-type":"application/x-www-form-urlencoded; charset=UTF-8",
        "accept":"application/json",
        "User-Agent":"BuzunSimulator/0.1 (https://github.com/DevSouza208/buzun-simulator)"
      },
      signal:controller.signal
    });
    if(!response.ok)throw Error(endpoint+" HTTP "+response.status);
    const payload=await response.json();
    return waysFromOverpass(payload);
  }finally{clearTimeout(timer);}
}
let roads,error;
for(const endpoint of endpoints){
  try{
    console.log("Importing fresh streets from",endpoint);
    roads=await attempt(endpoint);
    if(roads.length<500)throw Error("Result appears incomplete: "+roads.length+" ways");
    break;
  }catch(e){error=e;console.warn(String(e));}
}
if(!roads)throw error||Error("Unable to import OpenStreetMap");
const graph=graphFromRoads(roads);
const data={
  version:1,
  source:"Overpass API / OpenStreetMap",
  license:"Open Database License (ODbL)",
  attribution:"© OpenStreetMap contributors",
  fetchedAt:new Date().toISOString(),
  origin:ORIGIN,bbox:GRAJAU_BBOX,
  count:roads.length,nodes:graph.nodes.length,components:graph.components,
  roads
};
const filepath=new URL("../public/data/grajau-city-roads.json",import.meta.url);
writeFileSync(filepath,JSON.stringify(data));
console.log("Wrote",filepath.pathname,"ways",data.count,"graph nodes",data.nodes,
  "components",data.components,"bytes",JSON.stringify(data).length);
