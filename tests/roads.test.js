import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = path => JSON.parse(readFileSync(new URL("../public/data/" + path, import.meta.url), "utf8"));
const base = load("grajau.json"), spine = load("belmira-marin.json"), feeders = load("cocaia-corredores.json");

test("all sectors preserve exactly the same local map origin", () => {
  assert.deepEqual(base.origin, spine.origin);
  assert.deepEqual(base.origin, feeders.origin);
});
test("complete original mapped segments of Belmira Marin are present", () => {
  assert.ok(spine.roads.length >= 50);
  assert.ok(spine.stats.totalLengthKm > 8);
  assert.ok(spine.bounds.maxX > 4200);
  assert.ok(spine.bounds.maxZ > 2800);
  assert.ok(spine.bounds.minZ < -500);
  assert.ok(spine.roads.every(r => r.n === "Avenida Dona Belmira Marin" && r.p.length >= 2));
});
test("Belmira's OSM road geometry is topologically connected", () => {
  const parent = new Map();
  function root(id) {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id);
    if (id !== p) parent.set(id, root(p));
    return parent.get(id);
  }
  function union(a, b) { parent.set(root(a), root(b)); }
  const key = p => p.join(",");
  for (const road of spine.roads) {
    for (let i = 1; i < road.p.length; i++) union(key(road.p[i - 1]), key(road.p[i]));
  }
  const groups = new Set(spine.roads.map(road => root(key(road.p[0]))));
  assert.equal(groups.size, 1, "An uninterrupted main arterial is needed before building neighborhoods");
});
test("all three requested feeder roads use authentic mapped geometry", () => {
  for (const name of ["Estrada Canal de Cocaia", "Rua Pedro Escobar", "Rua Rubens de Oliveira"]) {
    assert.ok(feeders.roads.some(road => road.n === name && road.p.length >= 2), name);
  }
  assert.ok(feeders.roads.length >= 25);
});
test("the merged road skeleton retains all original neighborhood roads", () => {
  const originals = new Map(base.roads.map(road => [road.id, road]));
  for (const way of [...spine.roads, ...feeders.roads]) originals.set(way.id, way);
  assert.ok(originals.size > base.roads.length);
  assert.ok([...originals.values()].every(r => r.p.every(point => point.length === 2 && point.every(Number.isFinite))));
});
