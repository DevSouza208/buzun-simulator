/**
 * Buzun World Engine: reproducible OSM corridor selector.
 * Works entirely with existing, licensed OSM road vectors in local metres.
 * No invented side streets. Supports future one-click area selection.
 */
import { segmentProjection } from "./geo.js";

const key = p => p.map(n=>Number(n).toFixed(2)).join(":");
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const local = (lat,lon,origin) => [
 (lon-origin.lon)*111320*Math.cos(origin.lat*Math.PI/180),
 (origin.lat-lat)*111132
];
function nearestOnRoad(point,roads) {
  let best=null;
  for(const road of roads) for(let i=1;i<road.p.length;i++) {
    const a=road.p[i-1],b=road.p[i],p=segmentProjection(point[0],point[1],a,b);
    if(!best||p.distance<best.error)best={wayId:road.id,a,b,t:p.t,point:[p.x,p.z],error:p.distance};
  }
  return best;
}
/** Walks the real named OSM road graph between two geocoded anchors. */
export function buildRoadCorridor(namedRoads, start, end, origin) {
 if(!namedRoads.length)throw Error("No named road segments");
 const from=local(start.lat,start.lon,origin),to=local(end.lat,end.lon,origin);
 const a=nearestOnRoad(from,namedRoads),b=nearestOnRoad(to,namedRoads);
 if(!a||!b||a.error>35||b.error>35)throw Error("Endpoint is too far from mapped main road");
 const graph=new Map, vertices=new Map;
 function link(k1,p1,k2,p2,wayId){
   vertices.set(k1,p1);vertices.set(k2,p2);
   if(!graph.has(k1))graph.set(k1,[]);
   if(!graph.has(k2))graph.set(k2,[]);
   const d=distance(p1,p2);
   graph.get(k1).push({to:k2,d,wayId});
   graph.get(k2).push({to:k1,d,wayId});
 }
 for(const w of namedRoads)for(let i=1;i<w.p.length;i++){
   const p=w.p[i-1],q=w.p[i];link(key(p),p,key(q),q,w.id);
 }
 for(const [id,snap] of [["start",a],["finish",b]]) {
   link(id,snap.point,key(snap.a),snap.a,snap.wayId);
   link(id,snap.point,key(snap.b),snap.b,snap.wayId);
 }
 const costs=new Map([["start",0]]),back=new Map,visited=new Set,queue=[{id:"start",d:0}];
 while(queue.length) {
   queue.sort((x,y)=>y.d-x.d);
   const next=queue.pop(),u=next.id;
   if(visited.has(u))continue;
   visited.add(u);
   if(u==="finish")break;
   for(const step of graph.get(u)||[]) {
     const nd=next.d+step.d;
     if(nd<(costs.get(step.to)??Infinity)) {
       costs.set(step.to,nd);
       back.set(step.to,{from:u,wayId:step.wayId});
       queue.push({id:step.to,d:nd});
     }
   }
 }
 if(!back.has("finish"))throw Error("OSM main-road graph is disconnected at these addresses");
 const ids=[],nodes=[],usedWays=new Set;let cursor="finish",safety=0;
 while(cursor!=="start" && safety++<15000){
   nodes.push(cursor);
   const step=back.get(cursor);
   if(!step)throw Error("Broken Dijkstra predecessor chain");
   ids.push(step.wayId);usedWays.add(step.wayId);cursor=step.from;
 }
 if(cursor!=="start")throw Error("Dijkstra path too long");
 nodes.push("start");nodes.reverse();
 const points=nodes.map(k=>vertices.get(k).map(n=>Math.round(n*100)/100));
 return {
   points,
   lengthMeters:Math.round((costs.get("finish")||0)*10)/10,
   wayIds:[...usedWays],
   start:{...start,local:from,snapped:points[0],snapErrorMeters:Math.round(a.error*10)/10},
   end:{...end,local:to,snapped:points.at(-1),snapErrorMeters:Math.round(b.error*10)/10}
 };
}
function distanceToPolyline(x,z,poly) {
 let best=Infinity;
 for(let i=1;i<poly.length;i++) {
   const p=segmentProjection(x,z,poly[i-1],poly[i]);
   if(p.distance<best)best=p.distance;
 }
 return best;
}
/** Returns real OSM side-road fragments no more than radius from route. */
export function collectSideEntrances(roads,poly,limit=48) {
 const results=[];
 for(const road of roads) {
   if(road.n==="Avenida Dona Belmira Marin" || !road.p || road.p.length<2)continue;
   let current=[];
   const flush=()=>{
     if(current.length>1){
       results.push({id:road.id,n:road.n||"",t:road.t||"residential",p:current});
     }
     current=[];
   };
   for(let i=1;i<road.p.length;i++) {
     const a=road.p[i-1],b=road.p[i],len=distance(a,b);
     if(len<.01)continue;
     const steps=Math.max(1,Math.ceil(len/5));
     for(let j=0;j<steps;j++) {
       const t0=j/steps,t1=(j+1)/steps;
       const p=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0];
       const q=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
       const mid=[(p[0]+q[0])/2,(p[1]+q[1])/2];
       if(distanceToPolyline(mid[0],mid[1],poly)<=limit) {
         const round=v=>v.map(n=>Math.round(n*10)/10);
         if(!current.length) current.push(round(p));
         current.push(round(q));
       } else flush();
     }
   }
   flush();
 }
 return results;
}
export function makeBelmiraSelection(allRoads,mainRoads,anchors,origin) {
 const route=buildRoadCorridor(mainRoads,anchors.from,anchors.to,origin);
 const entranceRoads=collectSideEntrances(allRoads,route.points,50);
 const xvals=route.points.map(p=>p[0]), zvals=route.points.map(p=>p[1]);
 return {
   schemaVersion:1,name:"Belmira Marin: McDonald's → Habib's",
   attribution:"© OpenStreetMap contributors (ODbL 1.0)",
   origin,
   selection:{
     start:route.start,end:route.end,lengthMeters:route.lengthMeters,
     wayIds:route.wayIds,routePoints:route.points,
     bounds:{minX:Math.min(...xvals),maxX:Math.max(...xvals),
       minZ:Math.min(...zvals),maxZ:Math.max(...zvals)}
   },
   sideEntrances:entranceRoads,
   method:"Dijkstra on original named OSM ways, projected address anchors, 50m real-road side stubs",
   elevation:{status:"sampled_not_applied",dataset:"SRTM30m",
     startMeters:817,endMeters:765,approxDropMeters:52,
     warning:"Amostras altimétricas aproximadas; interpolação das ruas e viadutos ainda não implementada"},
   facadeStatus:"not_generated"
 };
}
