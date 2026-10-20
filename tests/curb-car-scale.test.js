import test from "node:test";
import assert from "node:assert/strict";
import { visibleCurbIntervals } from "../src/road-corridor.js";
import { PASSENGER_CAR_VISUAL_SCALE, displayedCarDimensions } from "../src/car-dimensions.js";

const curbA=[-12,4],curbB=[12,4];
const crossing={id:200,layer:0,a:[0,-20],b:[0,20],halfWidth:3.5};
const ownRoad={id:100,layer:0};

test("Curb only survives OUTSIDE the intersecting asphalt footprint",()=>{
  const intervals=visibleCurbIntervals(curbA,curbB,ownRoad,[crossing]);
  assert.equal(intervals.length,2);
  assert.equal(intervals[0][0],0);
  assert.equal(intervals[1][1],1);
  for(const [from,to] of intervals){
    const midpoint=(from+to)/2;
    const x=curbA[0]+(curbB[0]-curbA[0])*midpoint;
    assert.ok(Math.abs(x)>3.6, "Curb intersects cross street at "+x);
  }
});
test("Partial curb at an intersection is trimmed, NOT entirely removed",()=>{
  const intervals=visibleCurbIntervals([-6,4],[-2,4],ownRoad,[crossing]);
  assert.equal(intervals.length,1);
  assert.equal(intervals[0][0],0);
  assert.ok(intervals[0][1]>.4&&intervals[0][1]<.7);
});
test("T-shaped junction cap also hides curbs on the main-street corner",()=>{
  const circle=[{point:[0,0],maxWidth:12}];
  const intervals=visibleCurbIntervals([-9,6],[9,6],ownRoad,[],circle);
  assert.equal(intervals.length,2);
  assert.ok(intervals[0][1]<.5 && intervals[1][0]>.5);
});
test("Unrelated elevated bridge never cuts the curb on ground level",()=>{
  const above={...crossing,layer:1};
  assert.deepEqual(visibleCurbIntervals(curbA,curbB,ownRoad,[above]),[[0,1]]);
});
test("Away from a junction the original continuous curb remains whole",()=>{
  assert.deepEqual(visibleCurbIntervals(curbA,curbB,ownRoad,[]),[[0,1]]);
});
test("Passenger model is a compact car visually, while metre-scaled roads stay unchanged",()=>{
  assert.equal(PASSENGER_CAR_VISUAL_SCALE,.78);
  const dims=displayedCarDimensions();
  assert.ok(dims.width>1.75 && dims.width<1.90);
  assert.ok(dims.length>3.4 && dims.length<3.8);
});
