export function axesFromPressed(pressed) {
  return { steer: Number(pressed.has("right")) - Number(pressed.has("left")), throttle: Number(pressed.has("accelerate")), brake: Number(pressed.has("brake")) };
}
export function bindTouchControls(root, canDrive) {
  if (!root) throw new Error("Mobile driving controls root not found");
  const buttons = [...root.querySelectorAll("[data-drive]")];
  const pointers = new Map();
  function sync() {
    const active = new Set(pointers.values());
    for (const b of buttons) {
      const on = active.has(b.dataset.drive);
      b.classList.toggle("pressed", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }
  function release(id) { if (pointers.delete(id)) sync(); }
  function releaseAll() { pointers.clear(); sync(); }
  for (const b of buttons) {
    b.addEventListener("pointerdown", e => {
      if (!canDrive()) return;
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, b.dataset.drive);
      sync();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      b.addEventListener(type, e => { e.preventDefault(); release(e.pointerId); });
    }
    b.addEventListener("contextmenu", e => e.preventDefault());
  }
  return {
    read: () => canDrive() ? axesFromPressed(new Set(pointers.values())) : { steer: 0, throttle: 0, brake: 0 },
    releaseAll,
  };
}
