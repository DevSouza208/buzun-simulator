import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(
  new URL("../public/data/belmira-marin.json", import.meta.url), "utf8",
));
const original = JSON.parse(readFileSync(
  new URL("../public/data/grajau.json", import.meta.url), "utf8",
));

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("Belmira Marin uses exactly the Grajaú local geographic origin", () => {
  assert.deepEqual(data.origin, original.origin);
  assert.ok(data.source.includes("OpenStreetMap"));
});

test("Belmira Marin reaches both ends, beyond the original Grajaú square", () => {
  assert.ok(data.roads.length >= 40, "Multiple genuine OSM way fragments needed");
  const points = data.roads.flatMap(road => road.p);
  assert.ok(Math.min(...points.map(p => p[1])) < -500, "Reaches north of original area");
  assert.ok(Math.max(...points.map(p => p[1])) > 2800, "Reaches southern end");
  assert.ok(Math.max(...points.map(p => p[0])) > 4200, "Reaches eastern end");
});

test("All backbone fragments have unique OSM identifiers and valid real coordinates", () => {
  const ids = data.roads.map(r => r.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(data.roads.every(r =>
    Number.isSafeInteger(r.id) && r.id > 0 &&
    r.n === "Avenida Dona Belmira Marin" &&
    r.p.length >= 2 &&
    r.p.every(p => p.length === 2 && p.every(Number.isFinite))
  ));
});

test("Whole named backbone is contiguous through authentic OSM endpoints", () => {
  // Uses *only* endpoints from named OSM road fragments; no interpolated roads.
  // Up to 1 meter accounts for rounding to one decimal place.
  const n = data.roads.length;
  const connected = Array.from({ length: n }, (_, i) => new Set([i]));
  for (let i = 0; i < n; i++) {
    const a = [data.roads[i].p[0], data.roads[i].p.at(-1)];
    for (let j = i + 1; j < n; j++) {
      const b = [data.roads[j].p[0], data.roads[j].p.at(-1)];
      if (a.some(x => b.some(y => distance(x, y) <= 1))) {
        connected[i].add(j);
        connected[j].add(i);
      }
    }
  }
  const visited = new Set([0]), queue = [0];
  for (let i = 0; i < queue.length; i++) {
    for (const next of connected[queue[i]]) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  assert.equal(visited.size, n, "Missing or disconnected backbone fragments");
});
