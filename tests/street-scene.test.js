import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avenueMarkings } from "../src/road-markings.js";
import { chooseStreetFront, facadeRecipe } from "../src/facade-kit.js";
import { frontagePanels } from "../src/facade-detail.js";
import { FICTIONAL_SHOPS, fictionalShopFor } from "../src/store-brands.js";
import { routePointAt, utilityPolePlan } from "../src/street-props.js";

test("Belmira receives central yellow striping and roadside white lines", () => {
  const marks=avenueMarkings({
    t:"primary",n:"Avenida Dona Belmira Marin",o:"",p:[[0,0],[30,0],[50,0]]
  },14);
  assert.ok(marks.filter(x=>x.color==="yellow").length>=4);
  assert.ok(marks.some(x=>x.color==="white"));
  assert.ok(marks.every(x=>x.a.every(Number.isFinite)&&x.b.every(Number.isFinite)));
  assert.equal(avenueMarkings({t:"residential",n:"Rua do Teste",p:[[0,0],[10,0]]},7).length,0);
});
test("one-way avenue carries broken white lane divider, not continuous amber centre", () => {
  const marks=avenueMarkings({
    t:"primary",n:"Avenida Dona Belmira Marin",o:"yes",p:[[0,0],[60,0]]
  },14);
  assert.equal(marks.filter(m=>m.color==="yellow").length,0);
  const center=marks.filter(m=>m.color==="white"&&Math.abs(m.a[1])<.001);
  assert.ok(center.length>=3);
  assert.ok(center.reduce((sum,m)=>sum+Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1]),0)<60);
});
test("choose nearby street-facing wall and synthesize façade panels in finite bounds", () => {
  const poly=[[0,5],[12,5],[12,15],[0,15]];
  const roads=[{a:[-20,0],b:[30,0],width:14,type:"primary"}];
  const front=chooseStreetFront(poly,roads,20);
  assert.ok(front);
  assert.ok(front.length>=11.9);
  const recipe=facadeRecipe({id:84512,t:"commercial",height:"6.4",p:poly},front,6.4);
  assert.equal(recipe.kind,"shop");
  const panels=frontagePanels(front,recipe,()=>0);
  assert.ok(panels.length>9);
  assert.ok(panels.every(p=>p.corners.every(v=>v.every(Number.isFinite))));
  assert.ok(panels.every(p=>p.corners.every(v=>v[1]<6.41)));
  assert.equal(chooseStreetFront(poly,[{a:[100,100],b:[150,100]}],18),null);
});
test("fictional signs include user-selected parody shops and remain deterministic", () => {
  const names=FICTIONAL_SHOPS.map(x=>x.name);
  for(const name of ["Mc Donaits","Assento do Brasil","Casas Ceará"])
    assert.ok(names.includes(name));
  assert.deepEqual(fictionalShopFor(42,2),fictionalShopFor(42,2));
  assert.equal(new Set(names).size,names.length);
});
test("poles follow existing road geometry; no surveyed locations are invented", () => {
  const route=[[0,0],[200,0]];
  const segments=[{a:[0,0],b:[200,0],type:"primary"}];
  assert.equal(routePointAt(route,50).x,50);
  const poles=utilityPolePlan(route,segments,()=>false,50);
  assert.ok(poles.length>=3);
  assert.ok(poles.every(p=>Math.abs(p.z)>8));
  assert.ok(poles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});
test("storefront logic handles real committed Belmira buildings", () => {
  const map=JSON.parse(readFileSync(new URL("../public/data/belmira-corridor.json",import.meta.url),"utf8"));
  assert.ok(map.buildings.length>500);
  const segments=map.roads.flatMap(road=>road.p.slice(1).map((p,i)=>({
    a:road.p[i],b:p,type:road.t
  })));
  const count=map.buildings.slice(0,100).filter(b=>{
    const poly=b.p.slice(0,-1);
    return chooseStreetFront(poly,segments,29)!==null;
  }).length;
  assert.ok(count>8,"expected road-facing buildings in true OSM data");
});
