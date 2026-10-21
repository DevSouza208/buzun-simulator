import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { clippedLine, closestSegment, pointInPolygon, roadWidth, seeded } from "./geo.js";
import { sampleHeight, getTerrainBounds } from "./terrain.js";
import { terrainBandQuads } from "./road-geometry.js";
import { roadDimensions, auditMetricCorridor } from "./metric-audit.js";
import { createCityWorld } from "./city-world.js";
import { createStreamingCityWorld } from "./city-world-stream.js";
import { avenueMarkings } from "./road-markings.js";
import { chooseStreetFront, facadeRecipe } from "./facade-kit.js";
import { frontagePanels } from "./facade-detail.js";
import { addFictionalShopSigns } from "./store-signs.js";
import { buildStreetFurniture } from "./street-furniture.js";
import { buildCorridorLandmarks } from "./corridor-landmarks.js";
import { buildPilotFacades } from "./world-engine.js";
import { facadeRoadSpawns } from "./spawn.js";

const palette = [
  "#e9b6a0", "#f1d1a2", "#b7d0c8", "#c0b7d8", "#c8d8a2",
  "#f3c7c0", "#a9c5d6", "#d8bfaa", "#d4d3c0", "#beced0",
];
const color = str => new THREE.Color(str);
const cRoad = color("#374b53"), cAvenue = color("#32424c");
const cConcrete = color("#d2d1ba"), cStripe = color("#f1e7c3");
const buildingMaterials = palette.map(color);
const positions = () => ({ p: [], c: [] });
function tri(buf, a, b, c, tint) {
  const rgb = tint instanceof THREE.Color ? tint : color(tint);
  for (const v of [a, b, c]) {
    buf.p.push(v[0], v[1], v[2]);
    buf.c.push(rgb.r, rgb.g, rgb.b);
  }
}
function quad(buf, a, b, c, d, tint) {
  tri(buf, a, b, c, tint);
  tri(buf, a, c, d, tint);
}
function materialMesh(buf, { lit = false, opacity = 1 } = {}) {
  if (!buf.p.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(buf.p, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(buf.c, 3));
  if (lit) geo.computeVertexNormals();
  const mat = lit
    ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: opacity < 1, opacity });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
function band(buf, a, b, halfWidth, height, tint) {
  // Small, individually sampled quads hug both the longitudinal slope and
  // crossfall: long single-plane ribbons used to cut through the terrain.
  for (const [leftStart, leftEnd, rightEnd, rightStart] of
    terrainBandQuads(a, b, halfWidth, height, sampleHeight)) {
    quad(buf, leftStart, leftEnd, rightEnd, rightStart, tint);
  }
}
function simpleSign(text, backdrop = "#142b38") {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = backdrop;
  ctx.beginPath();ctx.roundRect(8, 8, 496, 112, 24);ctx.fill();
  ctx.fillStyle = "#f5f8eb";
  ctx.font = "bold 32px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 78);
  const tx = new THREE.CanvasTexture(canvas);
  tx.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthWrite: false }));
  sp.scale.set(32, 8, 1);
  return sp;
}
export function createWorld(scene, map, options = {}) {
  if(options.cityRoads===true)
    return options.progressive===true?
      createStreamingCityWorld(scene,map,{
        sheetPreview:options.sheetPreview===true,
        flatWorld:options.flatWorld===true,
        flatPaintedRoads:options.flatPaintedRoads===true,
        flatRoadRender:options.flatRoadRender==="vector"?"vector":"raster",
        flatTextureQuality:options.flatTextureQuality==="fast"?
          "fast":"smooth"
      }):createCityWorld(scene,map);
  const roadsOnly = options.roadsOnly === true;
  // Single terrain height source powers the road, ground, cars and buildings.
  // This works both for the early artificial preview and for the measured SRTM.
  const bounds=getTerrainBounds();
  const far=7000;
  const groundMaterial=new THREE.MeshLambertMaterial({color:"#a2bd9b"});
  const surround=[
    [-far,bounds.minX,-far,far], [bounds.maxX,far,-far,far],
    [bounds.minX,bounds.maxX,-far,bounds.minZ],
    [bounds.minX,bounds.maxX,bounds.maxZ,far]
  ];
  for(const [left,right,top,bottom] of surround) {
    if(right<=left||bottom<=top)continue;
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(right-left,bottom-top),groundMaterial);
    plane.rotation.x=-Math.PI/2;
    plane.position.set((left+right)/2,-.062,(top+bottom)/2);
    scene.add(plane);
  }
  const terrainWidth=bounds.maxX-bounds.minX,terrainDepth=bounds.maxZ-bounds.minZ;
  const terrainGeo=new THREE.PlaneGeometry(terrainWidth,terrainDepth,
    Math.max(2,Math.ceil(terrainWidth/12)),Math.max(2,Math.ceil(terrainDepth/12)));
  terrainGeo.rotateX(-Math.PI/2);
  const landPosition=terrainGeo.getAttribute("position");
  const terrainCX=(bounds.minX+bounds.maxX)/2,terrainCZ=(bounds.minZ+bounds.maxZ)/2;
  for(let i=0;i<landPosition.count;i++){
    const x=landPosition.getX(i)+terrainCX,z=landPosition.getZ(i)+terrainCZ;
    landPosition.setY(i,sampleHeight(x,z)-.057);
  }
  terrainGeo.computeVertexNormals();
  const localLand=new THREE.Mesh(terrainGeo,new THREE.MeshLambertMaterial({
    color:"#a5be9c",side:THREE.DoubleSide
  }));
  localLand.position.set(terrainCX,0,terrainCZ);
  scene.add(localLand);

  const shoulders = positions(), roads = positions(), stripes = positions();
  const laneWhites = positions(), laneYellows = positions();
  const routeSegments = [];
  let routeDistance = 0;
  for(let i=1;i<(map.route||[]).length;i++){
    const a=map.route[i-1],b=map.route[i];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length>.05)routeSegments.push({a,b,at:routeDistance,length});
    routeDistance+=length;
  }
  const segments = [];
  for (const road of map.roads) {
    const width = roadDimensions(road).widthMeters;
    // Authentic OSM polyline; only the paint/lane layout is approximate.
    for(const mark of avenueMarkings(road,width)){
      band(mark.color==="yellow"?laneYellows:laneWhites,
        mark.a,mark.b,mark.halfWidth,.077,
        mark.color==="yellow"?"#f4ce62":"#e6e4d9");
    }
    for (let i = 1; i < road.p.length; i++) {
      const clipped = clippedLine(road.p[i - 1], road.p[i], 6500);
      if (!clipped) continue;
      const [a, b] = clipped, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < .12) continue;
      segments.push({ a, b, width, name: road.n, type: road.t, id: road.id });
      band(shoulders, a, b, width / 2 + 1.55, .008, cConcrete);
      band(roads, a, b, width / 2, .035,
        ["primary", "secondary"].includes(road.t) ? cAvenue : cRoad);
      if (width >= 9 && len >= 9 && !/Belmira Marin/i.test(road.n||"")) {
        const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        for (let d = 4; d < len - 1; d += 14) {
          const start = [a[0] + dx * d, a[1] + dz * d];
          const end = [a[0] + dx * Math.min(d + 5, len - 1), a[1] + dz * Math.min(d + 5, len - 1)];
          band(stripes, start, end, .105, .053, cStripe);
        }
      }
    }
  }
  // Actual intersections: fill the gaps where named OSM way segments
  // share a vertex. Streets ending at the crop boundary remain unconnected.
  const junctions=positions(), crossings=new Map();
  const jointKey=(p)=>p.map(v=>Math.round(v*10)).join(":");
  for(const seg of segments){
    for(const p of [seg.a,seg.b]){
      const k=jointKey(p);
      if(!crossings.has(k))crossings.set(k,{p,arms:[],names:new Set()});
      const j=crossings.get(k);
      j.arms.push(seg);
      if(seg.name)j.names.add(seg.name);
    }
  }
  for(const joint of crossings.values()){
    // During the geometric audit do not draw synthetic intersection discs;
    // the asphalt remains on the original metre-scale OSM centreline.
    if (roadsOnly) break;
    if(joint.arms.length<3||joint.names.size<2)continue;
    const radius=Math.max(...joint.arms.map(s=>s.width))/2+.18;
    const [x,z]=joint.p,y=sampleHeight(x,z)+.046;
    const paving=joint.arms.some(s=>["primary","secondary"].includes(s.type))?cAvenue:cRoad;
    for(let i=0;i<12;i++){
      const a=i*2*Math.PI/12,b=(i+1)*2*Math.PI/12;
      tri(junctions,[x,y,z],[x+radius*Math.cos(a),sampleHeight(x+radius*Math.cos(a),z+radius*Math.sin(a))+.046,z+radius*Math.sin(a)],
        [x+radius*Math.cos(b),sampleHeight(x+radius*Math.cos(b),z+radius*Math.sin(b))+.046,z+radius*Math.sin(b)],paving);
    }
  }
  for(const b of [shoulders, roads, junctions, stripes, laneYellows, laneWhites]) {
    const mesh = materialMesh(b);
    if (mesh) scene.add(mesh);
  }

  // Temporary one-to-one ROAD SURVEY mode: retain real metre-space road
  // and altitude geometry, but skip every building, label, pole, tree and
  // generated facade without deleting any OSM data or scene assets.
  if (roadsOnly) {
    const metricAudit = auditMetricCorridor(map);
    const routeStart = map.route?.[0] || [0,0];
    const routeNext = map.route?.[1] || [0,-1];
    const nearest = closestSegment(...routeStart, segments);
    const angle = Math.atan2(routeNext[0]-routeStart[0],
      -(routeNext[1]-routeStart[1]));
    const spawn = {
      x: nearest?.x ?? routeStart[0],
      z: nearest?.z ?? routeStart[1],
      angle
    };
    const corridorLandmarks = (map.landmarks || []).map(loc => {
      const road = closestSegment(...loc.xy, segments);
      return {
        key:loc.key, label:loc.label, xy:loc.xy,
        buildingId:loc.buildingId || null,
        roadPoint:road ? [road.x,road.z] : loc.xy,
        confirmedFootprint:false
      };
    });
    const inExploreArea = (x,z) => {
      if(Math.abs(x)>6100 || Math.abs(z)>6100)return false;
      const nearby=closestSegment(x,z,segments);
      return !!nearby && nearby.distance<50;
    };
    return {
      segments, spawn, terminalSpawn:spawn, pilotSpawns:[],
      collides:()=>false, inExploreArea, heightAt:sampleHeight,
      facades:[],corridorLandmarks,
      closest:(x,z)=>closestSegment(x,z,segments),
      stats:{
        roads:map.roads.length,buildings:0,trees:0,
        pilotFacades:0,landmarks:corridorLandmarks.length,
        fictionalStores:0,utilityPoles:0,
        metricAudit
      },
      terminal:{x:spawn.x,z:spawn.z}
    };
  }

  // Keep source OSM building IDs intact: a future facade editor can store
  // overrides per id rather than rewriting the underlying map.
  const walls = positions(), details = positions();
  const signCandidates = [];
  const pilotIds = new Set((options.facadePilot?.buildings || []).map(x => x.osmId));
  const GRID = 32, collisionGrid = new Map();
  const key = (i, j) => i + ":" + j;
  const stored = [];
  for (const b of map.buildings) {
    const poly = b.p.slice(0, -1);
    if (poly.length < 3 || poly.length > 48) continue;
    const centerX = poly.reduce((a, v) => a + v[0], 0) / poly.length;
    const centerZ = poly.reduce((a, v) => a + v[1], 0) / poly.length;
    if (Math.abs(centerX) > 1300 || Math.abs(centerZ) > 1300) continue;
    const minX = Math.min(...poly.map(p => p[0])), maxX = Math.max(...poly.map(p => p[0]));
    const minZ = Math.min(...poly.map(p => p[1])), maxZ = Math.max(...poly.map(p => p[1]));
    const item = { ...b, poly, minX, maxX, minZ, maxZ };
    stored.push(item);
    for (let gx = Math.floor(minX / GRID); gx <= Math.floor(maxX / GRID); gx++)
      for (let gz = Math.floor(minZ / GRID); gz <= Math.floor(maxZ / GRID); gz++) {
        const k = key(gx, gz);
        if (!collisionGrid.has(k)) collisionGrid.set(k, []);
        collisionGrid.get(k).push(item);
      }

    if (pilotIds.has(b.id)) continue; // Replaced by a modular pilot facade.
    const baseY = sampleHeight(centerX, centerZ);
    const seed = seeded(b.id);
    const realHeight = Number.parseFloat(b.height);
    const storeyCount=Number.parseFloat(b.levels);
    const height = Number.isFinite(realHeight) && realHeight >= 2.5 && realHeight < 80
      ? realHeight
      : Number.isFinite(storeyCount) && storeyCount>=1 && storeyCount<=15
        ? storeyCount*3.05
        : b.use || b.n ? 4.2 + Math.floor(seed*3)*1.5
          : 4.4 + Math.floor(seed * 3) * 2.7 + (seeded(b.id*7)>.96?7:0);
    const facade = b.n==="Habib\'s" ? color("#dcd6c1") : buildingMaterials[Math.floor(seed * buildingMaterials.length)];
    // Enrich the road-facing side only, keeping OSM geometry and collisions
    // untouched; all unknown shop details remain clearly fictional.
    const front=chooseStreetFront(poly,segments,29);
    const recipe=front ? facadeRecipe(b,front,height) : null;
    if(recipe){
      for(const item of frontagePanels(front,recipe,sampleHeight))
        quad(details,...item.corners,color(item.color));
      if(recipe.kind==="shop" && routeSegments.length && front.roadDistance<23){
        const nearRoute=closestSegment(front.mid[0],front.mid[1],routeSegments);
        if(nearRoute && nearRoute.distance<38) {
          const along=nearRoute.segment.at+nearRoute.t*nearRoute.segment.length;
          signCandidates.push({id:b.id,x:front.mid[0],z:front.mid[1],
            nx:front.nx,nz:front.nz,width:front.length,height,
            y:sampleHeight(...front.mid),along,
            score:nearRoute.distance});
        }
      }
    }
    const roof = facade.clone().multiplyScalar(.80);
    const area = poly.reduce((sum, a, i) => {
      const next = poly[(i + 1) % poly.length];
      return sum + a[0] * next[1] - next[0] * a[1];
    }, 0);
    const outward = area >= 0 ? 1 : -1;

    // triangulate concave footprints; do not fill courtyards as skyscrapers.
    try {
      const points = poly.map(v => new THREE.Vector2(v[0], v[1]));
      const triangles = THREE.ShapeUtils.triangulateShape(points, []);
      for (const [i, j, k] of triangles)
        tri(walls, [poly[i][0], baseY + height, poly[i][1]],
          [poly[j][0], baseY + height, poly[j][1]],
          [poly[k][0], baseY + height, poly[k][1]], roof);
    } catch { /* poorly formed OSM outline: walls still appear */ }

    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (len < .2) continue;
      const tint = facade.clone().multiplyScalar(.88 + ((i % 3) * .045));
      quad(walls, [a[0], sampleHeight(a[0],a[1])-.01, a[1]],
        [c[0], sampleHeight(c[0],c[1])-.01, c[1]],
        [c[0], baseY+height, c[1]], [a[0], baseY+height, a[1]], tint);

      if (len < 5.5 || len > 72 || seeded(b.id + i * 17) < .22) continue;
      const count = Math.min(4, Math.floor(len / 5.2));
      const floors = Math.min(3, Math.floor((height - 2) / 3));
      const normalX = outward * dz / len, normalZ = -outward * dx / len;
      const glass = color(seeded(b.id + i) > .5 ? "#547e8a" : "#8fadb1");
      for (let row = 0; row < floors; row++) {
        const y = baseY + 1.6 + row * 3;
        if (y + 1.4 > baseY + height) continue;
        for (let col = 0; col < count; col++) {
          const u = (col + 1) / (count + 1);
          const x = a[0] + dx * u + normalX * .06;
          const z = a[1] + dz * u + normalZ * .06;
          const vx = dx / len * .79, vz = dz / len * .79;
          quad(details, [x - vx, y, z - vz], [x + vx, y, z + vz],
            [x + vx, y + 1.35, z + vz], [x - vx, y + 1.35, z - vz], glass);
        }
      }
    }
  }
  // Distribute fake storefronts across the real avenue instead of creating
  // dozens of repeating signs at one road junction.
  signCandidates.sort((a,b)=>a.along-b.along||a.score-b.score);
  const selectedSigns=[];
  for(const sign of signCandidates) {
    if(selectedSigns.length>=26)break;
    if(selectedSigns.some(other=>Math.abs(other.along-sign.along)<31))continue;
    selectedSigns.push(sign);
  }
  const fictionalStores=addFictionalShopSigns(scene,selectedSigns);
  const buildingMesh = materialMesh(walls, { lit: true });
  const windowMesh = materialMesh(details);
  if (buildingMesh) scene.add(buildingMesh);
  if (windowMesh) scene.add(windowMesh);
  const facades = buildPilotFacades(scene, map, options.facadePilot, {
    sampleHeight,
    nearestStreet: (x,z) => closestSegment(x,z,segments),
  });

  function collides(x, z) {
    const candidates = collisionGrid.get(key(Math.floor(x / GRID), Math.floor(z / GRID))) || [];
    for (const b of candidates)
      if (x >= b.minX - .8 && x <= b.maxX + .8 && z >= b.minZ - .8 && z <= b.maxZ + .8 &&
          pointInPolygon(x, z, b.poly)) return true;
    return false;
  }

  const streetFurniture=buildStreetFurniture(scene,map.route||[],segments,collides,sampleHeight);
  const pilotSpawns = facadeRoadSpawns(facades, segments, collides);
  const corridorLandmarks = buildCorridorLandmarks(scene, map, {sampleHeight,closestStreet:(x,z)=>closestSegment(x,z,segments)});

  // Instanced vegetation costs only two draw calls.
  const trunks = [], crowns = [];
  for (let i = 0; i < segments.length; i += 3) {
    const s = segments[i], len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (len < 18) continue;
    const dx = (s.b[0] - s.a[0]) / len, dz = (s.b[1] - s.a[1]) / len;
    const nx = -dz, nz = dx;
    for (let v = 14; v < len - 4; v += 38) {
      const side = seeded(i * 13 + v) > .5 ? 1 : -1;
      const x = s.a[0] + dx * v + nx * (s.width / 2 + 8) * side;
      const z = s.a[1] + dz * v + nz * (s.width / 2 + 8) * side;
      if (Math.abs(x) > 5800 || Math.abs(z) > 5800 || collides(x, z)) continue;
      trunks.push([x, z]);
      crowns.push([x, z]);
    }
  }
  if (trunks.length) {
    const trunkGeo = new THREE.CylinderGeometry(.34, .45, 2.5, 5);
    const crownGeo = new THREE.ConeGeometry(3.4, 8.2, 6);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: "#80664f" }), trunks.length);
    const crownMesh = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: "#548c72" }), crowns.length);
    const obj = new THREE.Object3D();
    trunks.forEach(([x, z], i) => {
      obj.position.set(x, sampleHeight(x,z)+1.25, z); obj.updateMatrix(); trunkMesh.setMatrixAt(i, obj.matrix);
      obj.position.set(x, sampleHeight(x,z)+6.1, z); obj.updateMatrix(); crownMesh.setMatrixAt(i, obj.matrix);
    });
    trunkMesh.instanceMatrix.needsUpdate = crownMesh.instanceMatrix.needsUpdate = true;
    scene.add(trunkMesh, crownMesh);
  }
  const terminal = [-46.69733, -23.73725];
  const x = (terminal[0] - map.origin.lon) * 111320 * Math.cos(map.origin.lat * Math.PI / 180);
  const z = (map.origin.lat - terminal[1]) * 111132;
  const pin = simpleSign("TERMINAL GRAJAÚ");
  pin.position.set(x, sampleHeight(x,z)+22, z);
  scene.add(pin);

  // Keep the starting point in Grajaú even after the Belmira Marin backbone
  // adds several kilometers of roads across the eastern neighborhoods.
  const start = closestSegment(x, z, segments) || closestSegment(0, 0, segments);
  const terminalSpawn = start ? { x: start.x, z: start.z, angle: start.angle } : { x: 0, z: 0, angle: 0 };
  const spawn = pilotSpawns[0] || terminalSpawn;
  // Original prototype remains freely explorable inside its square. Beyond it,
  // we allow exploration in a broad corridor along authentic OSM roads.
  // Buildings in distant neighborhoods will arrive in future map expansions.
  function inExploreArea(x, z) {
    if (Math.abs(x) > 6100 || Math.abs(z) > 6100) return false;
    if (Math.abs(x) <= 530 && Math.abs(z) <= 530) return true;
    const nearby = closestSegment(x, z, segments);
    return !!nearby && nearby.distance <= 70;
  }
  return { segments, spawn, pilotSpawns, terminalSpawn, collides, inExploreArea, heightAt:sampleHeight, facades, corridorLandmarks,
    closest: (x, z) => closestSegment(x, z, segments),
    stats: { roads: map.roads.length, buildings: stored.length, trees: trunks.length, pilotFacades:facades.length, landmarks:corridorLandmarks.length, fictionalStores, utilityPoles:streetFurniture.count },
    terminal: { x, z } };
}
