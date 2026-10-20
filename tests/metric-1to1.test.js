import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditMetricCorridor, polylineLengthMeters, roadDimensions } from "../src/metric-audit.js";

test("road mesh uses metre coordinates without an artificial scale multiplier",()=>{
  assert.equal(polylineLengthMeters([[0,0],[30,40],[30,50]]),60);
  assert.deepEqual(roadDimensions({t:"residential",widthMeters:6.5}),{widthMeters:6.5,source:"measured"});
  assert.equal(roadDimensions({t:"primary"}).source,"estimated");
});
test("committed real corridor is ~1159 m measured ALONG the OSM path",()=>{
  const map=JSON.parse(readFileSync(new URL("../public/data/belmira-corridor.json",import.meta.url),"utf8"));
  const audit=auditMetricCorridor(map);
  assert.equal(audit.worldUnitsPerMetre,1);
  assert.ok(Math.abs(audit.routeLengthMeters-1159)<1);
  assert.ok(Math.abs(audit.routeLengthMeters-map.routeLengthMeters)<1);
  assert.equal(audit.roads,44);
  assert.equal(audit.knownWidths,0);
  assert.equal(audit.estimatedWidths,44);
  assert.ok(audit.routeVertices>=50);
});
