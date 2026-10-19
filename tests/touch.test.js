import test from "node:test";
import assert from "node:assert/strict";
import { axesFromPressed, bindTouchControls } from "../src/touch-controls.js";

function fakeButton(action) {
  const button = new EventTarget();
  button.dataset = { drive: action };
  button.attr = {};
  button.active = false;
  button.classList = {
    toggle: (name, enabled) => { if (name === "pressed") button.active = enabled; },
  };
  button.setAttribute = (key, val) => { button.attr[key] = val; };
  button.setPointerCapture = () => {};
  return button;
}
function pointer(button, kind, id) {
  const event = new Event(kind, { cancelable: true });
  Object.defineProperty(event, "pointerId", { value: id });
  button.dispatchEvent(event);
}
test("opposing steering buttons and pedals map to the expected axes", () => {
  assert.deepEqual(axesFromPressed(new Set()), { steer: 0, throttle: 0, brake: 0 });
  assert.deepEqual(axesFromPressed(new Set(["left", "accelerate"])), { steer: -1, throttle: 1, brake: 0 });
  assert.deepEqual(axesFromPressed(new Set(["right", "brake"])), { steer: 1, throttle: 0, brake: 1 });
  assert.equal(axesFromPressed(new Set(["left", "right"])).steer, 0);
});
test("multitouch holds steer and throttle, releases each finger separately", () => {
  let driving = true;
  const buttons = ["left", "right", "brake", "accelerate"].map(fakeButton);
  const root = { querySelectorAll: () => buttons };
  const control = bindTouchControls(root, () => driving);
  pointer(buttons[0], "pointerdown", 101);
  pointer(buttons[3], "pointerdown", 202);
  assert.deepEqual(control.read(), { steer: -1, throttle: 1, brake: 0 });
  assert.equal(buttons[0].active, true);
  assert.equal(buttons[3].attr["aria-pressed"], "true");
  pointer(buttons[0], "pointerup", 101);
  assert.deepEqual(control.read(), { steer: 0, throttle: 1, brake: 0 });
  pointer(buttons[3], "pointercancel", 202);
  assert.deepEqual(control.read(), { steer: 0, throttle: 0, brake: 0 });
  pointer(buttons[1], "pointerdown", 303);
  driving = false;
  assert.equal(control.read().steer, 0);
  control.releaseAll();
  assert.equal(buttons[1].active, false);
});
test("cancelled pointer capture stops acceleration", () => {
  const b = fakeButton("accelerate");
  const control = bindTouchControls({ querySelectorAll: () => [b] }, () => true);
  pointer(b, "pointerdown", 1);
  assert.equal(control.read().throttle, 1);
  pointer(b, "lostpointercapture", 1);
  assert.equal(control.read().throttle, 0);
});
