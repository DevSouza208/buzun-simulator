/** OSM/Overpass importer for a broad Grajaú and Cantinho do Céu pilot.
 * Source geometry is WGS84. Scene horizontal units are local metres.
 * Live Overpass calls are cached and fall back to versioned OSM extracts.
 * Not a survey: street width and untagged junction levels are estimates.
 */
export const GRAJAU_BBOX=Object.freeze({
  south:-23.772,west:-46.719,north:-23.713,east:-46.637
});
export const ORIGIN=Object.freeze({lat:-23.7368,lon:-46.697});
const ALLOWED=new Set(["motorway","motorway_link","trunk","trunk_link","primary","primary_link",
  "secondary","secondary_link","tertiary","tertiary_link","residential",
  "living_street","unclassified","service"]);
const CACHE_KEY="buzun-osm-grajau-v1";
const API="https://overpass-api.de/api/interpreter";
export function projectOSM(lat,lon,origin=ORIGIN) {
  // Matches the existing game's local metre axes; +X east, +Z south.
  // A local map projection, not sub-metre surveyed coordinates.
  return [(lon-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180),
    (origin.lat-lat)*111132];
}
export function overpassQuery(bbox=GRAJAU_BBOX) {
  const b=[bbox.south,bbox.west,bbox.north,bbox.east].join(",");
  return '[out:json][timeout:100];(way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|living_street|unclassified|service)$"]('+b+'););out geom;';
}
function validPoint(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);}
function widthFor(tags,kind) {
  const direct=Number.parseFloat(tags.width);
  if(Number.isFinite(direct)&&direct>=2&&direct<=45)return {width:direct,source:"osm:width"};
  const widths={motorway:18,motorway_link:8,trunk:16,trunk_link:8,primary:12.6,
    primary_link:7.5,secondary:10.5,secondary_link:7,tertiary:8.8,
    tertiary_link:6.8,residential:7,living_street:5,unclassified:7,service:5.2};
  return {width:widths[kind]||7,source:"estimated"};
}
function cleanNodes(points,ids) {
  const p=[],n=[];
  for(let i=0;i<points.length;i++) {
    if(!validPoint(points[i]))continue;
    if(p.length&&Math.hypot(points[i][0]-p.at(-1)[0],points[i][1]-p.at(-1)[1])<.02)continue;
    p.push(points[i]);n.push(ids?.[i]??null);
  }
  return {p,n};
}
export function waysFromOverpass(payload,origin=ORIGIN) {
  if(!Array.isArray(payload?.elements))throw Error("Resposta Overpass sem elementos");
  const roads=[];
  for(const way of payload.elements){
    if(way.type!=="way"||!ALLOWED.has(way.tags?.highway)||!Array.isArray(way.geometry))continue;
    if(["private","no"].includes(way.tags.access)||way.tags.area==="yes")continue;
    if(["parking_aisle","driveway"].includes(way.tags.service))continue;
    // Overpass returns entire ways even if one vertex touches the bbox.
    // Keep the city-sized section only; otherwise a single long highway way
    // can extend the render scene dozens of kilometres outside the pilot.
    const points=way.geometry.map(p=>projectOSM(p.lat,p.lon,origin));
    const sw=projectOSM(GRAJAU_BBOX.south,GRAJAU_BBOX.west,origin);
    const ne=projectOSM(GRAJAU_BBOX.north,GRAJAU_BBOX.east,origin);
    const minX=sw[0]-350,maxX=ne[0]+350,minZ=ne[1]-350,maxZ=sw[1]+350;
    const inBounds=p=>p[0]>=minX&&p[0]<=maxX&&p[1]>=minZ&&p[1]<=maxZ;
    const indexes=points.map((p,i)=>inBounds(p)?i:-1).filter(i=>i>=0);
    if(!indexes.length)continue;
    const lo=Math.max(0,indexes[0]-1),hi=Math.min(points.length,indexes.at(-1)+2);
    const {p,n}=cleanNodes(points.slice(lo,hi),way.nodes?.slice(lo,hi));
    if(p.length<2)continue;
    const type=way.tags.highway;
    const {width,source}=widthFor(way.tags,type);
    roads.push({id:way.id,t:type,n:way.tags.name||"",
      o:way.tags.oneway||(way.tags.junction==="roundabout"?"yes":""),
      p,nodeIds:n,widthMeters:width,widthSource:source,
      lanes:Number.parseInt(way.tags.lanes,10)||null,
      // Directional lane tags are necessary to handle asymmetrical 2+1
      // roads without assigning a third lane to an invented direction.
      lanesForward:Number.parseInt(way.tags["lanes:forward"],10)||null,
      lanesBackward:Number.parseInt(way.tags["lanes:backward"],10)||null,
      bridge:way.tags.bridge==="yes",tunnel:way.tags.tunnel==="yes",
      layer:Number.parseInt(way.tags.layer,10)||0});
  }
  if(!roads.length)throw Error("Nenhuma rua encontrada no Overpass");
  return roads;
}
export function graphFromRoads(roads) {
  // Shared original OSM node IDs give true topological connections.
  // Distinct OSM bridge/tunnel layers are NOT merged by visual proximity.
  const nodes=new Map(),edges=[];
  for(const road of roads) {
    const oneWay=String(road.o).toLowerCase(),reverse=oneWay==="-1",
      directed=["yes","true","1","-1"].includes(oneWay)||road.t==="motorway";
    for(let i=1;i<road.p.length;i++) {
      const a=road.p[i-1],b=road.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(length<.02)continue;
      const key=j=>road.nodeIds?.[j]!=null?"osm:"+road.nodeIds[j]:
        // Saved legacy ways have no IDs. Match vertices only when exactly
        // coincident; do not join grade-separated crossings speculatively.
        "xy:"+road.p[j].map(v=>Math.round(v*10)).join(":")+":"+road.layer;
      const from=key(i-1),to=key(i);
      if(!nodes.has(from))nodes.set(from,{id:from,x:a[0],z:a[1]});
      if(!nodes.has(to))nodes.set(to,{id:to,x:b[0],z:b[1]});
      const forward=reverse?to:from,backward=reverse?from:to;
      edges.push({from:forward,to:backward,lengthMeters:length,wayId:road.id,
        widthMeters:road.widthMeters,oneway:directed,highway:road.t,name:road.n});
      if(!directed)edges.push({from:backward,to:forward,lengthMeters:length,wayId:road.id,
        widthMeters:road.widthMeters,oneway:false,highway:road.t,name:road.n});
    }
  }
  const adjacency=new Map();
  for(const e of edges) {
    if(!adjacency.has(e.from))adjacency.set(e.from,[]);
    adjacency.get(e.from).push(e.to);
  }
  const undirected=new Map();
  for(const edge of edges) {
    for(const [a,b] of [[edge.from,edge.to],[edge.to,edge.from]]) {
      if(!undirected.has(a))undirected.set(a,new Set());
      undirected.get(a).add(b);
    }
  }
  let components=0;const visited=new Set();
  for(const id of nodes.keys()){
    if(visited.has(id))continue;
    components++;
    const stack=[id];visited.add(id);
    while(stack.length)for(const next of undirected.get(stack.pop())||[])
      if(!visited.has(next)){visited.add(next);stack.push(next);}
  }
  return {nodes:[...nodes.values()],edges,adjacency,components};
}
export function combineLegacyRoads(...sources) {
  const byId=new Map();
  for(const src of sources)for(const road of src?.roads||[]) {
    if(!ALLOWED.has(road.t)||!Array.isArray(road.p))continue;
    const {width,source}=widthFor({},road.t);
    byId.set(road.id,{...road,widthMeters:width,widthSource:source});
  }
  return [...byId.values()];
}
// IndexedDB handles large city extracts (often larger than localStorage's
// 5 MB limit). If private mode blocks IDB, the app still uses local extracts.
async function openCityCache() {
  if(typeof indexedDB==="undefined")return null;
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open("BuzunOSMCache",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("extracts");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function readCityCache() {
  const db=await openCityCache();
  if(!db)return null;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("extracts","readonly");
    const req=tx.objectStore("extracts").get(CACHE_KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
  });
}
async function saveCityCache(data) {
  const db=await openCityCache();
  if(!db)return;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("extracts","readwrite");
    tx.objectStore("extracts").put(data,CACHE_KEY);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
export async function fetchGrajauRoads({signal,timeoutMs=30000,onStatus=()=>{},fallback=[]}={}) {
  const now=Date.now();
  // Keep retries well apart if public Overpass is busy; no per-frame API calls.
  try {
    const stored=await readCityCache();
    if(stored?.saved && now-stored.saved<259200000&&stored.roads?.length>50)
      return {roads:stored.roads,source:"cache OSM",upToDate:true};
  }catch{}
  try {
    const stored=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
    if(stored?.saved && now-stored.saved<86400000&&stored.roads?.length>50)
      return {roads:stored.roads,source:"cache OSM",upToDate:true};
    const lastFailure=Number(localStorage.getItem(CACHE_KEY+"-retry")||0);
    if(fallback.length && now-lastFailure<1800000)
      return {roads:fallback,source:"OSM local (reserva)",upToDate:false};
  }catch{}
  onStatus("Consultando o OpenStreetMap para o mapa ampliado do Grajaú...");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const abort=()=>controller.abort();
  signal?.addEventListener("abort",abort,{once:true});
  try {
    const response=await fetch(API+"?data="+encodeURIComponent(overpassQuery()),{
      signal:controller.signal,
      headers:{"Accept":"application/json"}
    });
    if(!response.ok)throw Error("Overpass HTTP "+response.status);
    const json=await response.json();
    const roads=waysFromOverpass(json);
    if(roads.length<100)throw Error("O retorno do OSM veio incompleto");
    try {await saveCityCache({saved:now,roads});} catch {}
    return {roads,source:"Overpass API",upToDate:true};
  }catch(error){
    if(signal?.aborted)throw error;
    if(!fallback.length)throw error;
    try {localStorage.setItem(CACHE_KEY+"-retry",String(now));} catch {}
    onStatus("OSM indisponível: usando os recortes reais salvos do Grajaú.");
    return {roads:fallback,source:"OSM local (reserva)",upToDate:false,error:String(error)};
  }finally{
    clearTimeout(timer);signal?.removeEventListener("abort",abort);
  }
}
