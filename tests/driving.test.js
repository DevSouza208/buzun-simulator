import test from "node:test";
import assert from "node:assert/strict";
import { modelYawFromHeading } from "../src/driving.js";

function modelForwardForRotation(rotation) {
  // Aplicando rotação em Y ao vetor local (0, 0, -1) no Three.js.
  return [-Math.sin(rotation), -Math.cos(rotation)];
}
test("carro renderizado aponta exatamente na mesma direção do movimento", () => {
  for (const heading of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2, -2.4]) {
    const [x, z] = modelForwardForRotation(modelYawFromHeading(heading));
    assert.ok(Math.abs(x - Math.sin(heading)) < 1e-12);
    assert.ok(Math.abs(z + Math.cos(heading)) < 1e-12);
  }
});
test("rua leste-oeste: dianteira do carro aponta para leste quando heading é +90°", () => {
  const [x, z] = modelForwardForRotation(modelYawFromHeading(Math.PI / 2));
  assert.ok(x > .999);
  assert.ok(Math.abs(z) < 1e-12);
});
