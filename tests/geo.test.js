import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { latLonToLocal, segmentProjection, closestSegment,
  pointInPolygon, clippedLine, roadWidth, seeded } from "../src/geo.js";

test("origin maps to local zero", () => {
  assert.deepEqual(latLonToLocal(-23.7368, -46.697, { lat: -23.7368, lon: -46.697 }), [0, 0]);
});
test("east increases X and south increases Z", () => {
  const o = { lat: -23.7368, lon: -46.697 };
  assert.ok(latLonToLocal(o.lat, o.lon + .001, o)[0] > 100);
  assert.ok(latLonToLocal(o.lat - .001, o.lon, o)[1] > 100);
});
test("projection finds nearest location and heading", () => {
  const p = segmentProjection(5, 6, [0, 0], [10, 0]);
  assert.equal(p.x, 5);
  assert.equal(p.z, 0);
  assert.equal(p.distance, 6);
  assert.ok(Number.isFinite(p.angle));
});
test("closest road segment picks the nearest road", () => {
  const s = closestSegment(2, 3, [
    { a: [0, 0], b: [10, 0], name: "A" },
    { a: [100, 100], b: [200, 200], name: "B" },
  ]);
  assert.equal(s.segment.name, "A");
});
test("polygon insides and outsides", () => {
  const square = [[0,0],[10,0],[10,10],[0,10]];
  assert.equal(pointInPolygon(5, 5, square), true);
  assert.equal(pointInPolygon(20, 5, square), false);
});
test("clip a line at region boundary", () => {
  assert.deepEqual(clippedLine([-20,0],[20,0],10), [[-10,0],[10,0]]);
  assert.equal(clippedLine([-20,30],[20,30],10), null);
});
test("physical road widths and reproducible building variants", () => {
  assert.ok(roadWidth("primary") > roadWidth("service"));
  assert.equal(seeded(12345), seeded(12345));
  assert.ok(seeded(12345) >= 0 && seeded(12345) <= 1);
});
test("the committed Grajaú extract contains actual roads and buildings", () => {
  const geo = JSON.parse(readFileSync(new URL("../public/data/grajau.json", import.meta.url), "utf8"));
  assert.equal(geo.origin.lat, -23.7368);
  assert.equal(geo.origin.lon, -46.697);
  assert.ok(geo.roads.length >= 150);
  assert.ok(geo.buildings.length >= 1000);
  assert.ok(geo.roads.some(road => road.n.includes("Belmira Marin")));
  assert.ok(geo.roads.every(r => r.p.length >= 2 && r.p.every(pt => pt.every(Number.isFinite))));
});
