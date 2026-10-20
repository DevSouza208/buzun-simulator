/**
 * Repeatable first step of the future "Create" button.
 * Usage: node scripts/build-belmira-corridor.mjs
 *
 * Inputs are locally versioned OSM extracts, not live Overpass.
 * Later this exact generator can accept a bounding selection and fresh extracts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { makeBelmiraSelection } from "../src/corridor.js";
const read=name=>JSON.parse(readFileSync(new URL("../public/data/"+name,import.meta.url),"utf8"));
const base=read("grajau.json"),spine=read("belmira-marin.json"),feeders=read("cocaia-corredores.json");
if(JSON.stringify(base.origin)!==JSON.stringify(spine.origin)||JSON.stringify(base.origin)!==JSON.stringify(feeders.origin))
  throw Error("Geographic origins differ.");
const anchors={
  from:{name:"McDonald's Belmira",street:"Avenida Dona Belmira Marin, 1277",
    lat:-23.7414161,lon:-46.6916534,source:"Official McDonald's address + OSM Nominatim address position"},
  to:{name:"Habib's Grajaú",street:"Avenida Dona Belmira Marin, 111",
    lat:-23.7327927,lon:-46.6969538,source:"Official Habib's restaurant list + OSM Nominatim address position"}
};
const unique=new Map([...base.roads,...spine.roads,...feeders.roads].map(w=>[w.id,w]));
const result=makeBelmiraSelection([...unique.values()],spine.roads,anchors,base.origin);
if(result.selection.lengthMeters<900||result.selection.lengthMeters>2000)
  throw Error("Unexpected route length "+result.selection.lengthMeters);
if(result.sideEntrances.length<5)throw Error("Too few OSM side streets for the selected corridor");
const output=new URL("../public/data/belmira-corridor.json",import.meta.url);
writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log("Buzun corridor:",result.selection.lengthMeters+"m",
  "route vertices:",result.selection.routePoints.length,
  "OSM side entrances:",result.sideEntrances.length,
  "source road IDs:",result.selection.wayIds.length);
