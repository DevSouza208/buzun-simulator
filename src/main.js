import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { createWorld } from "./world.js";
import { bindTouchControls } from "./touch-controls.js";
import { modelYawFromHeading } from "./driving.js";

const $ = id => document.getElementById(id);
const canvas = $("game");
const status = $("load-status");
const startButton = $("start-button");
const landing = $("landing");
const speedText = $("speed");
const speedBar = $("speed-bar");
const distanceText = $("distance");
const streetText = $("road-name");
const gearText = $("gear");
const terrainLabel = $("terrain-label");
const minimap = $("minimap");
const minimapContext = minimap.getContext("2d");
const keys = new Set();
let mobileInput;
let world, player, car, renderer, scene, camera, clock, roadData;
let driving = false, cameraMode = 0, yawOrbit = 0, pitchOrbit = .15;
let lastHud = 0, lastMinimap = 0, toastTimer = null;
let pointerDown = false, lastPointerX = 0, lastPointerY = 0;

function showToast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function addBlock(group, size, position, hex, bevel = false) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshLambertMaterial({ color: hex, flatShading: true }),
  );
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}
function createCar() {
  const car = new THREE.Group();
  const shell = new THREE.Group();
  car.add(shell);

  // Car is pointed along local -Z. Keep the entire design original,
  // light and recognizable rather than simulating a licensed car.
  addBlock(shell, [2.10, .65, 4.38], [0, .95, .04], "#cdec68");
  addBlock(shell, [1.86, .68, 2.38], [0, 1.60, .26], "#d9f38d");
  addBlock(shell, [1.93, .15, 2.47], [0, 1.99, .20], "#bbdb64");
  addBlock(shell, [1.70, .49, .05], [0, 1.61, -.95], "#3f6573");
  addBlock(shell, [1.72, .47, .06], [0, 1.62, 1.44], "#517684");
  addBlock(shell, [.10, .09, 2.28], [-.94, 1.63, .25], "#476978");
  addBlock(shell, [.10, .09, 2.28], [.94, 1.63, .25], "#476978");

  for (const sx of [-1, 1]) {
    for (const sz of [-1.44, 1.44]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(.43, .43, .25, 12),
        new THREE.MeshLambertMaterial({ color: "#182934", flatShading: true }),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.02, .45, sz);
      shell.add(wheel);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(.20, .20, .27, 10),
        new THREE.MeshLambertMaterial({ color: "#91a4a8" }),
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.copy(wheel.position);
      shell.add(cap);
    }
    addBlock(shell, [.42, .19, .08], [sx * .70, 1.03, -2.18], "#fff5d0");
    addBlock(shell, [.40, .19, .08], [sx * .70, 1.02, 2.26], "#e26d61");
    addBlock(shell, [.18, .20, .40], [sx * 1.10, 1.49, -.64], "#375560");
  }
  addBlock(shell, [1.80, .19, .08], [0, .72, -2.20], "#273f4a");
  addBlock(shell, [1.86, .22, .08], [0, .71, 2.28], "#3a4950");
  car.userData.shell = shell;
  return car;
}
function controls() {
  let throttle = 0, brake = 0, steer = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) throttle = 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) brake = 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) steer -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) steer += 1;
  // Two independent pointer captures enable steering while holding a pedal.
  const touch = mobileInput?.read();
  if (touch) {
    throttle = Math.max(throttle, touch.throttle);
    brake = Math.max(brake, touch.brake);
    steer = THREE.MathUtils.clamp(steer + touch.steer, -1, 1);
  }
  if (navigator.getGamepads) {
    const pad = [...navigator.getGamepads()].find(Boolean);
    if (pad) {
      const gpSteer = Math.abs(pad.axes[0] || 0) > .15 ? pad.axes[0] : 0;
      steer = Math.abs(gpSteer) > Math.abs(steer) ? gpSteer : steer;
      throttle = Math.max(throttle, pad.buttons[7]?.value || (pad.buttons[0]?.pressed ? 1 : 0));
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
      const orbitAxis = pad.axes[2] || 0;
      if (Math.abs(orbitAxis) > .18) yawOrbit = THREE.MathUtils.clamp(yawOrbit - orbitAxis * .032, -2.2, 2.2);
    }
  }
  return { throttle, brake, steer };
}
function resetCar(announce = true) {
  if (!world || !player) return;
  const spawn = world.spawn;
  player.x = spawn.x; player.z = spawn.z;
  player.yaw = spawn.angle; player.speed = 0;
  yawOrbit = 0; pitchOrbit = .15;
  car.position.set(player.x, 0, player.z);
  car.rotation.y = modelYawFromHeading(player.yaw);
  if (announce) showToast("Veículo reposicionado perto do Terminal Grajaú");
}
function advance(dt) {
  if (!driving) return;
  const ctrl = controls();
  const previousSpeed = player.speed;
  const offRoad = world.closest(player.x, player.z);
  const onRoad = offRoad && offRoad.distance < offRoad.segment.width * .5 + 2;

  let acceleration = 0;
  if (ctrl.throttle) acceleration += player.speed < -0.2 ? 12 * ctrl.throttle : 6.8 * ctrl.throttle;
  if (ctrl.brake) acceleration -= player.speed > 0.2 ? 12 * ctrl.brake : 4.8 * ctrl.brake;
  player.speed += acceleration * dt;
  if (!ctrl.throttle && !ctrl.brake) {
    const drag = (1.5 + .008 * player.speed * player.speed) * dt;
    if (Math.abs(player.speed) <= drag) player.speed = 0;
    else player.speed -= Math.sign(player.speed) * drag;
  }
  if (previousSpeed > 0 && player.speed < 0 && ctrl.brake) player.speed = 0;
  if (previousSpeed < 0 && player.speed > 0 && ctrl.throttle) player.speed = 0;
  player.speed = THREE.MathUtils.clamp(player.speed, -10, onRoad ? 26 : 14);

  const steerFactor = Math.min(1, Math.abs(player.speed) / 6.7);
  player.yaw += ctrl.steer * Math.sign(player.speed) * steerFactor * 1.25 * dt /
    (1 + Math.abs(player.speed) * .035);

  const nextX = player.x + Math.sin(player.yaw) * player.speed * dt;
  const nextZ = player.z - Math.cos(player.yaw) * player.speed * dt;
  if (!world.inExploreArea(nextX, nextZ)) {
    player.speed = 0;
    if (!player.boundaryWarned) showToast("Fim da área disponível nesta versão. Aperte R para voltar.");
    player.boundaryWarned = true;
  } else if (world.collides(nextX, nextZ)) {
    player.speed = 0;
    if (Math.abs(previousSpeed) > 3) showToast("Obstáculo! Desvie da construção.");
  } else {
    player.x = nextX; player.z = nextZ;
    player.distance += Math.abs(player.speed) * dt;
    player.boundaryWarned = false;
  }
  car.position.set(player.x, 0, player.z);
  car.rotation.y = modelYawFromHeading(player.yaw);
  const lean = THREE.MathUtils.clamp(-ctrl.steer * Math.abs(player.speed) * .003, -.055, .055);
  car.userData.shell.rotation.z = THREE.MathUtils.lerp(car.userData.shell.rotation.z, lean, Math.min(dt * 6, 1));
}
function updateCamera(dt) {
  const turn = player.yaw + yawOrbit;
  const forward = new THREE.Vector3(Math.sin(turn), 0, -Math.cos(turn));
  let target, desired;
  if (cameraMode === 0) {
    target = new THREE.Vector3(player.x, 1.6, player.z);
    desired = new THREE.Vector3(
      player.x - forward.x * 12,
      5.4 + pitchOrbit * 8,
      player.z - forward.z * 12,
    );
    car.visible = true;
  } else {
    const facing = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    desired = new THREE.Vector3(player.x + facing.x * 1.0, 1.84, player.z + facing.z * 1.0);
    target = new THREE.Vector3(
      desired.x + forward.x * 20,
      desired.y + pitchOrbit * 3,
      desired.z + forward.z * 20,
    );
    car.visible = false;
  }
  const blend = 1 - Math.exp(-Math.min(dt, .1) * (cameraMode === 0 ? 4.5 : 8));
  camera.position.lerp(desired, blend);
  camera.lookAt(target);
}
function hud(now) {
  if (now - lastHud < 110) return;
  lastHud = now;
  const kph = Math.round(Math.abs(player.speed) * 3.6);
  speedText.textContent = String(kph).padStart(2, "0");
  speedBar.style.width = Math.min(100, kph / 95 * 100) + "%";
  gearText.textContent = player.speed < -.05 ? "R" : player.speed > .05 ? "D" : "N";
  distanceText.textContent = (player.distance / 1000).toFixed(2) + " km";
  const near = world.closest(player.x, player.z);
  streetText.textContent = near?.segment.name || "Ruas do Grajaú";
  terrainLabel.textContent = near && near.distance > near.segment.width / 2 + 4 ? "FORA DA VIA • VOLTE AO ASFALTO" : "EXPLORAÇÃO LIVRE";
}
function drawMinimap(now) {
  if (now - lastMinimap < 150 || !world || !player) return;
  lastMinimap = now;
  const ctx = minimapContext, w = minimap.width, h = minimap.height, zoom = .39;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#243d42";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-player.x, -player.z);

  ctx.lineCap = "round";
  for (const segment of world.segments) {
    if (Math.abs((segment.a[0] + segment.b[0]) / 2 - player.x) > 630 ||
        Math.abs((segment.a[1] + segment.b[1]) / 2 - player.z) > 520) continue;
    ctx.strokeStyle = "#627e7d"; ctx.lineWidth = Math.max(3, segment.width * .73);
    ctx.beginPath(); ctx.moveTo(...segment.a); ctx.lineTo(...segment.b); ctx.stroke();
  }
  ctx.restore();
  ctx.save();ctx.translate(w / 2, h / 2);ctx.rotate(player.yaw);
  ctx.fillStyle = "#d7f77a";ctx.beginPath();
  ctx.moveTo(0, -13);ctx.lineTo(-9, 11);ctx.lineTo(0, 7);ctx.lineTo(9, 11);ctx.closePath();ctx.fill();
  ctx.restore();
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#14242c15");gradient.addColorStop(1, "#1528336b");
  ctx.fillStyle = gradient;ctx.fillRect(0, 0, w, h);
}
function resize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function tick() {
  requestAnimationFrame(tick);
  if (!clock || !world) return;
  const dt = Math.min(clock.getDelta(), .05);
  advance(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  hud(performance.now());
  drawMinimap(performance.now());
}
function toggleHelp(force) {
  const el = $("help-overlay");
  const open = typeof force === "boolean" ? force : el.classList.contains("hidden");
  el.classList.toggle("hidden", !open);
  driving = !open && landing.classList.contains("hidden");
  keys.clear();
  mobileInput?.releaseAll();
}
function bindInputs() {
  mobileInput = bindTouchControls($("mobile-controls"), () => driving);
  document.addEventListener("keydown", e => {
    if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))
      e.preventDefault();
    if (!e.repeat && e.code === "KeyR" && driving) resetCar();
    if (!e.repeat && e.code === "KeyC" && driving) {
      cameraMode = (cameraMode + 1) % 2;
      showToast(cameraMode === 0 ? "Câmera externa" : "Câmera próxima (experimental)");
    }
    if (!e.repeat && e.code === "Escape" && landing.classList.contains("hidden")) toggleHelp();
    keys.add(e.code);
  });
  document.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => { keys.clear(); mobileInput?.releaseAll(); pointerDown = false; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); mobileInput?.releaseAll(); } });
  canvas.addEventListener("pointerdown", e => {
    if (!driving) return;
    pointerDown = true;lastPointerX = e.clientX;lastPointerY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => pointerDown = false);
  canvas.addEventListener("pointercancel", () => pointerDown = false);
  canvas.addEventListener("pointermove", e => {
    if (!pointerDown || !driving) return;
    yawOrbit = THREE.MathUtils.clamp(yawOrbit - (e.clientX - lastPointerX) * .006, -2.2, 2.2);
    pitchOrbit = THREE.MathUtils.clamp(pitchOrbit + (e.clientY - lastPointerY) * .004, -.33, .65);
    lastPointerX = e.clientX;lastPointerY = e.clientY;
  });
  $("reset-button").addEventListener("click", () => resetCar());
  $("help-button").addEventListener("click", () => toggleHelp(true));
  $("close-help").addEventListener("click", () => toggleHelp(false));
  $("resume-button").addEventListener("click", () => toggleHelp(false));
  startButton.addEventListener("click", () => {
    if (!world) return;
    landing.classList.add("hidden");
    driving = true;
    clock.getDelta();
    showToast("Bem-vindo ao Grajaú. Boa viagem!");
  });
  window.addEventListener("resize", resize);
}
async function start() {
  bindInputs();
  try {
    status.textContent = "Buscando ruas reais e construções do OpenStreetMap...";
    // The original Grajaú neighborhood stays in place; the new Belmira
    // Marin street geometry extends the same local coordinate system.
    // Importing a road backbone first avoids downloading thousands of
    // distant building meshes on mobile before neighborhood tiles exist.
    const [initialResponse, spineResponse, feedersResponse] = await Promise.all([
      fetch("./public/data/grajau.json"),
      fetch("./public/data/belmira-marin.json"),
      fetch("./public/data/cocaia-corredores.json"),
    ]);
    if (!initialResponse.ok || !spineResponse.ok || !feedersResponse.ok)
      throw new Error("Não foi possível carregar os mapas locais (Grajaú / Belmira / Cocaia).");
    const [original, spine, feeders] = await Promise.all([
      initialResponse.json(), spineResponse.json(), feedersResponse.json(),
    ]);
    if (!Array.isArray(original.roads) || original.roads.length < 10 ||
        !Array.isArray(spine.roads) || spine.roads.length < 15 ||
        !Array.isArray(feeders.roads) || feeders.roads.length < 15)
      throw new Error("Os dados de alguma das vias estão incompletos.");
    if ([spine, feeders].some(part => part.origin.lat !== original.origin.lat ||
                                    part.origin.lon !== original.origin.lon))
      throw new Error("As origens geográficas dos arquivos não coincidem.");
    // Keep full OSM ways without duplicating pieces already seen in the
    // first neighbourhood extract. This is the permanent arterial skeleton
    // on which future streamed low-poly neighbourhood sectors can be added.
    const namedWays = new Map([...spine.roads, ...feeders.roads].map(road => [road.id, road]));
    roadData = {
      ...original,
      roads: [
        ...original.roads.filter(road => !namedWays.has(road.id)),
        ...namedWays.values(),
      ],
      backbone: spine.stats,
      feeders: feeders.stats,
    };

    status.textContent = "Construindo ruas e fachadas low poly...";
    await new Promise(resolve => setTimeout(resolve, 25));
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#a9ced0");
    scene.fog = new THREE.FogExp2("#a9ced0", .00095);
    scene.add(new THREE.HemisphereLight("#fff6e1", "#718a78", 2.35));
    const sunlight = new THREE.DirectionalLight("#ffebc4", 2.0);
    sunlight.position.set(-130, 240, 90);
    scene.add(sunlight);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.matchMedia("(pointer:coarse)").matches ? 1 : 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.55;
    camera = new THREE.PerspectiveCamera(67, 1, .1, 1600);
    resize();
    world = createWorld(scene, roadData);
    car = createCar();
    scene.add(car);
    player = { x: world.spawn.x, z: world.spawn.z, yaw: world.spawn.angle,
      speed: 0, distance: 0, boundaryWarned: false };
    // Source map outlines may overlap roads; choose a road segment without
    // building collision as a safer spawn, close to the requested terminal.
    if (world.collides(player.x, player.z)) {
      const viable = world.segments
        .filter(s => !world.collides((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2))
        .sort((a, b) =>
          Math.hypot((a.a[0] + a.b[0]) / 2 - world.terminal.x,
                     (a.a[1] + a.b[1]) / 2 - world.terminal.z)
          - Math.hypot((b.a[0] + b.b[0]) / 2 - world.terminal.x,
                       (b.a[1] + b.b[1]) / 2 - world.terminal.z));
      if (viable.length) {
        const s = viable[0];
        world.spawn = { x: (s.a[0] + s.b[0]) / 2, z: (s.a[1] + s.b[1]) / 2,
          angle: Math.atan2(s.b[0] - s.a[0], -(s.b[1] - s.a[1])) };
      }
    }
    resetCar(false);
    camera.position.set(player.x, 5, player.z + 15);
    camera.lookAt(player.x, 1, player.z);
    clock = new THREE.Clock();
    tick();
    $("map-status").textContent = world.stats.roads + " trechos reais";
    status.textContent = "Belmira Marin + ramais do Cocaia! " + world.stats.roads + " vias · " +
      world.stats.buildings + " construções low poly.";
    startButton.disabled = false;
    startButton.textContent = "COMEÇAR A DIRIGIR  ↗";
  } catch (error) {
    console.error("Buzun start error:", error);
    status.textContent = "Falha ao preparar o mundo: " + (error?.message || "Erro desconhecido");
    startButton.disabled = false;
    startButton.textContent = "TENTAR NOVAMENTE ↻";
    startButton.addEventListener("click", () => location.reload(), { once: true });
    $("map-status").textContent = "Erro ao carregar";
  }
}
start();
