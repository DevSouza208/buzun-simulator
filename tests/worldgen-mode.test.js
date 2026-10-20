import test from "node:test";
import assert from "node:assert/strict";
import {resolveWorldgenMode} from "../src/worldgen-mode.js";

test("Buzun main URL defaults to streaming with no debug overlay",()=>{
  assert.deepEqual(resolveWorldgenMode(""),{
    progressive:true,showWorldgen:false
  });
  assert.deepEqual(resolveWorldgenMode("?utm_source=chatgpt.com"),{
    progressive:true,showWorldgen:false
  });
});
test("Legacy compositor must be requested explicitly",()=>{
  assert.deepEqual(resolveWorldgenMode("?worldgen=legacy"),{
    progressive:false,showWorldgen:false
  });
  assert.equal(resolveWorldgenMode("?worldgen=complete").progressive,false);
});
test("Diagnostic and compatibility URLs still work",()=>{
  assert.deepEqual(resolveWorldgenMode("?worldgen=stream&debug=off"),{
    progressive:true,showWorldgen:false
  });
  assert.deepEqual(resolveWorldgenMode("?worldgen=stream"),{
    progressive:true,showWorldgen:true
  });
  assert.equal(resolveWorldgenMode("?worldgen=debug").showWorldgen,true);
  assert.equal(resolveWorldgenMode("?debug=worldgen").showWorldgen,true);
  assert.equal(resolveWorldgenMode("?worldgen=debug&debug=off").showWorldgen,false);
});
