import test from "node:test";
import assert from "node:assert/strict";
import { tileXY,terrariumHeight } from "../src/terrain-tiles.js";
import { configureTerrain,configureCityTerrain,sampleHeight,getTerrainMode,getTerrainBounds } from "../src/terrain.js";
import { GRAJAU_BBOX,ORIGIN } from "../src/grajau-osm.js";

test("Terrarium pixels decode true metres, not colour brightness",()=>{
  assert.equal(terrariumHeight(128,0,0),0);
  assert.equal(terrariumHeight(128,5,128),5.5);
  assert.equal(terrariumHeight(127,250,0),-6);
});
test("Geographic terrain tiles sample in local metre coordinates",()=>{
  const center=tileXY(ORIGIN.lat,ORIGIN.lon,13);
  assert.ok(center.x>0&&center.x<8192);
  assert.ok(center.y>0&&center.y<8192);
  const terrain={
    bbox:GRAJAU_BBOX,
    pointSample:(x,z,origin,base)=> 20 + x*.01 - z*.02
  };
  configureCityTerrain(terrain,ORIGIN);
  try {
    assert.equal(getTerrainMode(),"terrarium");
    assert.ok(Math.abs(sampleHeight(100,200)-17)<1e-9);
    const bounds=getTerrainBounds();
    assert.ok(bounds.minX<-1500&&bounds.maxX>2500);
    assert.ok(bounds.minZ<-1500&&bounds.maxZ>2500);
  }finally{
    configureCityTerrain(null,null);
    configureTerrain(null);
  }
});
