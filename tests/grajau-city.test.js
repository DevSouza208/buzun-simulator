import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ORIGIN,GRAJAU_BBOX,projectOSM,overpassQuery,waysFromOverpass,
  graphFromRoads,combineLegacyRoads } from "../src/grajau-osm.js";

test("Grajaú wide-area API query covers the reference map and excludes footpaths",()=>{
  const q=overpassQuery();
  assert.match(q,/way\["highway"/);
  assert.match(q,/out geom/);
  assert.ok(GRAJAU_BBOX.north>ORIGIN.lat&&GRAJAU_BBOX.south<ORIGIN.lat);
  assert.ok(GRAJAU_BBOX.west<ORIGIN.lon&&GRAJAU_BBOX.east>ORIGIN.lon);
  assert.deepEqual(projectOSM(ORIGIN.lat,ORIGIN.lon),[0,0]);
  // Approximate physical metre scale near Grajaú, never scaled for styling.
  const east=projectOSM(ORIGIN.lat,ORIGIN.lon+.0001);
  assert.ok(east[0]>9&&east[0]<11);
});
test("OSM roads preserve original shared node IDs, oneway and real width",()=>{
  const api={elements:[
    {type:"way",id:100,tags:{highway:"residential",name:"Rua A",oneway:"yes",width:"6.2"},
      nodes:[10,11,12],geometry:[{lat:-23.7368,lon:-46.697},{lat:-23.7367,lon:-46.697},{lat:-23.7366,lon:-46.697}]},
    {type:"way",id:101,tags:{highway:"residential",name:"Rua B"},
      nodes:[11,13],geometry:[{lat:-23.7367,lon:-46.697},{lat:-23.7367,lon:-46.6969}]},
    {type:"way",id:102,tags:{highway:"footway"},nodes:[13,14],
      geometry:[{lat:-23.7367,lon:-46.6969},{lat:-23.7367,lon:-46.6968}]}
  ]};
  const roads=waysFromOverpass(api);
  assert.equal(roads.length,2);
  assert.equal(roads[0].widthMeters,6.2);
  assert.equal(roads[0].widthSource,"osm:width");
  const graph=graphFromRoads(roads);
  assert.equal(graph.components,1);
  assert.equal(graph.nodes.length,4);
  assert.equal(graph.edges.length,4); // oneway 2 + twoway 2
  assert.ok(graph.edges.every(e=>e.lengthMeters>0));
  assert.ok(graph.adjacency.get("osm:11").includes("osm:13"));
  assert.ok(!graph.adjacency.get("osm:11").includes("osm:10"));
});
test("non-intersecting bridge endpoints are not falsely connected by crossing visuals",()=>{
  const roads=[
    {id:1,t:"residential",widthMeters:7,p:[[0,0],[10,0]],nodeIds:[1,2]},
    {id:2,t:"primary",widthMeters:12,p:[[5,-4],[5,4]],nodeIds:[3,4],bridge:true,layer:1}
  ];
  assert.equal(graphFromRoads(roads).components,2);
});
test("combine real saved OSM extracts for fallback without duplicates",()=>{
  const load=name=>JSON.parse(readFileSync(new URL("../public/data/"+name,import.meta.url),"utf8"));
  const roads=combineLegacyRoads(load("grajau.json"),load("belmira-marin.json"),load("cocaia-corredores.json"),load("belmira-corridor.json"));
  const ids=new Set(roads.map(r=>r.id));
  assert.equal(ids.size,roads.length);
  assert.ok(roads.length>200);
  assert.ok(roads.every(r=>r.widthMeters>=2&&r.widthSource==="estimated"));
  const graph=graphFromRoads(roads);
  assert.ok(graph.nodes.length>800);
  assert.ok(graph.edges.length>1200);
});
