import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainBandQuads } from "../src/road-geometry.js";
import { slopeAlongHeading, slopeAcceleration, gradeLabel } from "../src/grade.js";
import { configureTerrain, sampleHeight, getTerrainMode } from "../src/terrain.js";

test("road ribbons subdivide long segments and stay glued to a curved slope", () => {
  const height = (x, z) => x * x / 100 + z / 10;
  const quads = terrainBandQuads([0, 0], [28, 0], 3, .035, height, 7);
  assert.equal(quads.length, 4);
  for (const quad of quads) {
    assert.equal(quad.length, 4);
    for (const [x, y, z] of quad)
      assert.ok(Math.abs(y - (height(x, z) + .035)) < 1e-9);
  }
  for (let i = 1; i < quads.length; i++) {
    assert.deepEqual(quads[i - 1][1], quads[i][0]);
    assert.deepEqual(quads[i - 1][2], quads[i][3]);
  }
  assert.deepEqual(terrainBandQuads([0,0],[0,0],3,.035,height), []);
});

test("downhill and uphill grade produce signed gravitational acceleration", () => {
  const slope = (x, z) => x * .1;
  const uphill = slopeAlongHeading(0, 0, Math.PI / 2, slope);
  const downhill = slopeAlongHeading(0, 0, -Math.PI / 2, slope);
  assert.ok(Math.abs(uphill - .1) < 1e-9);
  assert.ok(Math.abs(downhill + .1) < 1e-9);
  assert.ok(slopeAcceleration(downhill) > 0);
  assert.ok(slopeAcceleration(uphill) < 0);
  assert.equal(gradeLabel(downhill), "DESCIDA 10%");
  assert.equal(gradeLabel(uphill), "SUBIDA 10%");
  assert.equal(gradeLabel(.001), "TERRENO PLANO");
});

test("measured SRTM grid descends from McDonald's to Habib's on the real OSM route", () => {
  const elevation = JSON.parse(readFileSync(new URL("../public/data/belmira-elevation.json", import.meta.url), "utf8"));
  const corridor = JSON.parse(readFileSync(new URL("../public/data/belmira-corridor.json", import.meta.url), "utf8"));
  assert.deepEqual(elevation.origin, corridor.origin);
  assert.equal(elevation.dataset, "srtm30m");
  configureTerrain(elevation);
  try {
    assert.equal(getTerrainMode(), "srtm30m");
    const start = corridor.route[0], end = corridor.route.at(-1);
    const drop = sampleHeight(...start) - sampleHeight(...end);
    assert.ok(drop > 35 && drop < 65, "expected a measured descent of roughly 48 m, got " + drop);
    for (const point of corridor.route) {
      assert.ok(Number.isFinite(sampleHeight(...point)), "invalid height at " + point);
    }
  } finally {
    configureTerrain(null);
  }
});
