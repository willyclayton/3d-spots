// Giza — app bootstrap and orchestration.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkySystem } from '../../shared/engine/sky.js';
import { LabelLayer } from '../../shared/engine/labels.js';
import { WalkController } from '../../shared/engine/walk.js';
import { FlyController } from '../../shared/engine/fly.js';
import { SITE, PYRAMIDS, SMALL_PYRAMIDS, SPHINX } from './data/site.js';
import { PLACES } from './data/places.js';
import { loadTextures } from './materials.js';
import { Terrain } from './terrain.js';
import { buildPyramids, buildRubble } from './pyramids.js';
import { buildInteriors } from './interiors/index.js';
import { buildComplex } from './complex.js';
import { loadSphinx } from './sphinx.js';
import { SectionTool } from './section.js';
import { WalkWorld } from './walkworld.js';
import { profileRangeAt } from './interiors/build.js';
import { createUI } from './ui.js';
import { createTour } from './tour.js';
import { installAtmosphere } from '../../shared/engine/atmosphere.js';
import { buildScatter, buildPalms } from './scatter.js';

installAtmosphere({ groundY: -45, scaleHeight: 320 });

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const storedQ = (() => { try { return localStorage.getItem('giza-quality'); } catch (e) { return null; } })();
const quality = params.get('q') || storedQ || (coarse || innerWidth < 900 ? 'medium' : 'high');
const STILL = parseInt(params.get('still') || '0', 10);

const container = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('loadMsg').textContent = 'Sorry — this map needs WebGL, which is not available in this browser.';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.CustomToneMapping;   // ACES + film grade (atmosphere.js)
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.5, 40000);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.75;
controls.zoomSpeed = 1.15;
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.minDistance = 2;
controls.maxDistance = 4200;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;

const sky = new SkySystem(renderer, scene, { lat: SITE.lat, lon: SITE.lon, utcOffset: SITE.utcOffset, shadowSize: quality === 'low' ? 2048 : 4096 });
const progress = (p, msg) => window.__setProgress?.(p, msg);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// the explorable area (world metres): plateau, valley temples, town edge
const BOUNDS = { x0: -1700, x1: 1500, z0: -1300, z1: 2000 };

const state = {
  mode: 'orbit', era: 'today', xray: false, section: false, labels: true, selected: null,
  showVoids: true, showCity: true, torch: false,
};
const app = { scene, camera, controls, renderer, sky, state, quality };
window.__app = app;

async function init() {
  progress(0.04, 'Loading textures');
  await loadTextures(new THREE.LoadingManager(), renderer, 'textures/');
  progress(0.16, 'Reading SRTM elevation data');
  const terrain = new Terrain();
  await terrain.load('data/terrain.png');
  terrain.buildMasks();
  progress(0.24, 'Shaping the plateau'); await nextFrame();
  const t = terrain.build(quality);
  const tmat = terrain.material();
  const ground = new THREE.Mesh(t.geometry, tmat); ground.receiveShadow = true; ground.name = 'terrain';
  const skirt = new THREE.Mesh(t.skirt, tmat); skirt.name = 'terrain-skirt';
  scene.add(ground, skirt);

  progress(0.36, 'Setting 2.3 million blocks'); await nextFrame();
  const pyr = buildPyramids({ quality });
  for (const g of Object.values(pyr.groups)) scene.add(g.group);
  scene.add(pyr.smallGroup, pyr.smallBuilt);
  const rubble = buildRubble(pyr.info, terrain, { quality });
  scene.add(rubble);

  progress(0.55, 'Carving chambers and passages'); await nextFrame();
  const interiors = buildInteriors(pyr.info);
  for (const it of Object.values(interiors)) scene.add(it.group);

  progress(0.66, 'Raising temples and tombs'); await nextFrame();
  const complex = buildComplex(terrain, { quality });
  scene.add(complex.today, complex.built, complex.both);
  // holes in the ground: boat pits, shafts, Khafre's lower entrance
  const holes = complex.holes.slice();
  for (const it of Object.values(interiors)) {
    for (const [x0, z0, x1, z1] of it.terrainHoles) {
      holes.push({ cx: it.P.cx + (x0 + x1) / 2, cz: it.P.cz + (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, ang: 0 });
    }
  }
  terrain.setHoles(holes);
  // contact shadows where monuments stand on the ground
  const aoRects = [];
  for (const { P, half } of Object.values(pyr.info)) aoRects.push({ x0: P.cx - half, x1: P.cx + half, z0: P.cz - half, z1: P.cz + half, blur: 5, k: 0.55 });
  for (const sp of pyr.small) aoRects.push({ x0: sp.sp.cx - sp.half, x1: sp.sp.cx + sp.half, z0: sp.sp.cz - sp.half, z1: sp.sp.cz + sp.half, blur: 3, k: 0.5 });
  for (const o of complex.obstacles.today) aoRects.push({ ...o, blur: 1.1, k: 0.28 });
  aoRects.push({ x0: SPHINX.cx - 37, x1: SPHINX.cx + 37, z0: SPHINX.cz - 7.5, z1: SPHINX.cz + 7.5, blur: 2.5, k: 0.45 });
  terrain.buildAO(aoRects);

  progress(0.72, 'Scattering stones and palms'); await nextFrame();
  const blocked = complex.obstacles.today.concat(Object.values(pyr.info).map(({ P, half }) => ({ x0: P.cx - half, x1: P.cx + half, z0: P.cz - half, z1: P.cz + half })),
    pyr.small.map((sp) => ({ x0: sp.sp.cx - sp.half, x1: sp.sp.cx + sp.half, z0: sp.sp.cz - sp.half, z1: sp.sp.cz + sp.half })));
  const scatter = buildScatter(terrain, { blocked, ruins: complex.obstacles.today, quality });
  const palms = buildPalms(terrain, { quality });
  scene.add(scatter, palms.today, palms.built);

  progress(0.74, 'Carving the Sphinx'); await nextFrame();
  const sphinx = loadSphinx(quality);
  scene.add(sphinx.group);
  sphinx.group.userData.setEra('today');

  // modern stairs up to the robbers' tunnel
  // modern visitor stairs: Khufu (al-Ma'mun's tunnel) and Menkaure
  const stairs = [buildStairs(pyr.info.khufu, 'robbers'), buildStairs(pyr.info.menkaure, 'entr')];
  stairs.forEach((st) => scene.add(st.mesh));

  Object.assign(app, { terrain, ground, skirt, pyr, rubble, interiors, complex, sphinx, stairs, scatter, palms });

  // ---- tools
  const section = new SectionTool({ scene, pyr, interiors, terrain });
  app.section = section;

  const world = new WalkWorld(terrain);
  app.world = world;
  const walk = new WalkController(camera, renderer.domElement, world, {
    joystickEl: document.getElementById('joystick'),
    onLockChange: (locked) => app.ui?.setWalkHint(locked),
  });
  app.walk = walk;
  const flyer = new FlyController(camera, renderer.domElement, {
    groundAt: (x, z) => app.terrain.heightAt(x, z, false),
    limit: (p) => {
      const g = app.terrain.heightAt(p.x, p.z, false) + 2.5;
      if (p.y < g) p.y = g;
      if (!state.section && !state.xray) keepOutOfStone(p, 3);
    },
    joystickEl: document.getElementById('joystick'),
    upEl: document.getElementById('flyUp'), downEl: document.getElementById('flyDown'),
    bounds: { x0: BOUNDS.x0 - 600, x1: BOUNDS.x1 + 600, z0: BOUNDS.z0 - 600, z1: BOUNDS.z1 + 600, yMax: 2600 },
  });
  app.flyer = flyer;
  setupWorld();

  // pooled point lights for interiors + a hand torch
  const pool = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffe2b8, 0, 12, 2);
    scene.add(l); pool.push(l);
  }
  const torch = new THREE.SpotLight(0xffc98a, 0, 40, 0.55, 0.6, 2);
  torch.position.set(0.15, -0.15, 0); torch.target.position.set(0, -0.2, -2);
  camera.add(torch, torch.target);
  const fill = new THREE.PointLight(0xffe4bd, 0, 9, 1.4);
  fill.position.set(0, 0.25, 0.3);
  camera.add(fill);
  Object.assign(app, { pool, torch, fill });

  // ---- labels
  const reservedIds = ['toolbar', 'sectionBar', 'tour', 'info', 'compass', 'homeBtn', 'placesBtn', 'places', 'settings'];
  const labels = new LabelLayer(document.getElementById('labels'), camera, {
    onSelect: (id) => selectPlace(id),
    reserved: () => {
      const out = [];
      const tb = document.querySelector('.topbar');
      if (tb) { const r = tb.getBoundingClientRect(); out.push({ left: r.left, right: r.left + Math.min(r.width, 330), top: r.top, bottom: r.bottom + 4 }); }
      for (const id of reservedIds) {
        const el = document.getElementById(id);
        if (!el || el.classList.contains('hidden') || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) out.push(r);
      }
      return out;
    },
  });
  app.labels = labels;
  setupLabels();

  // ---- UI
  const ui = createUI(app, {
    setMode, setEra, setXray, setSection, setLabels, setTime, selectPlace, flyHome, setVoids, setCity, setTorch,
  });
  app.ui = ui;
  const presetViews = {
    hero: [[620, 260, 760], [-170, 20, 280]],
    default: [[760, 230, 1180], [-230, 25, 330]],
    portrait: [[-820, 560, 1080], [-300, 15, 380]],
  };
  app.tour = createTour(app, {
    setMode, setEra, setXray, setSection, selectPlace,
    placeById: (id) => PLACES.find((q) => q.id === id),
    flyToView: (name) => {
      const [p, t] = presetViews[camera.aspect < 0.8 ? 'portrait' : name];
      return flyTo(new THREE.Vector3(...p), new THREE.Vector3(...t));
    },
    walkFrom: (pos, yawDeg) => {
      pos.y = app.terrain.heightAt(pos.x, pos.z);
      enterWalkAt({ walk: null, world: [pos.x, pos.y, pos.z], view: { yaw: 0, dist: 0 }, _direct: { pos, yaw: -THREE.MathUtils.degToRad(yawDeg) } });
    },
  });
  walk.onUserMove = () => app.tour.userInterrupt();
  flyer.onUserMove = () => app.tour.userInterrupt();
  setupMapNavigation();

  // ---- initial view
  const v = params.get('view');
  const views = {
    default: [[760, 230, 1180], [-230, 25, 330]],
    khufu: [[160, 40, -330], [0, 40, 0]],
    entrance: [[30, 22, -140], [7, 15, -100]],
    sw: [[-700, 60, 560], [-340, 50, 340]],
    sphinx: [[430, -25, 470], [330, -30, 434]],
    panorama: [[-660, 92, 1345], [-330, 55, 420]],
    close: [[-420, 14, 470], [-380, 10, 448]],
    north: [[25, 3.5, -150], [0, 25, -110]],
    hero: [[620, 260, 760], [-170, 20, 280]],
    portrait: [[-820, 560, 1080], [-300, 15, 380]],
  };
  // tall phone screens: look up the line of pyramids from the south-west instead
  if (camera.aspect < 0.8) views.default = views.portrait;
  const [cp, ct] = views[v] || views.default;
  camera.position.set(...cp); controls.target.set(...ct); controls.update();
  app.home = { pos: new THREE.Vector3(...views.default[0]), target: new THREE.Vector3(...views.default[1]) };
  const hour = params.has('t') ? parseFloat(params.get('t')) : 15.6;
  setTime(hour);
  if (params.get('era') === 'built') setEra('built');
  if (params.get('xray')) setXray(true);
  if (params.get('section')) {
    const [tg, pl, off] = params.get('section').split(',');
    setSection(true, { target: tg || 'khufu', plane: pl || 'x', offset: off !== undefined && off !== '' ? parseFloat(off) : undefined }, !params.get('view'));
  }
  if (params.get('place')) selectPlace(params.get('place'), { instant: true });
  if (params.get('walk')) {
    const p = PLACES.find((q) => q.id === params.get('walk'));
    if (p) enterWalkAt(p);
  }
  sky.updateEnvironment();
  progress(1, 'Ready');
  setTimeout(() => document.getElementById('loading').classList.add('done'), 150);
  if (params.has('still')) await Promise.race([sphinx.ready, new Promise((r) => setTimeout(r, 90000))]);
  window.__ready = true;
  startLoop();
  if (params.has('tour')) app.tour.start(parseInt(params.get('tour'), 10) - 1 || 0);
  else ui.maybeShowWelcome();
}

// ------------------------------------------------------------------ world --
function setupWorld() {
  const { world, interiors, pyr, complex } = app;
  const vols = Object.values(interiors).map((it) => ({ id: it.id, P: it.P, vols: it.eras[state.era].walk }));
  world.setInteriorVolumes(vols);
  if (state.era === 'today') app.stairs.forEach((st) => world.addVolume(st.volume));
  world.footprints = Object.values(pyr.info).map(({ P, S }) => ({ x0: P.cx - S[0] - 0.3, x1: P.cx + S[0] + 0.3, z0: P.cz - S[0] - 0.3, z1: P.cz + S[0] + 0.3 }));
  for (const s of pyr.small) world.footprints.push({ x0: s.sp.cx - s.half, x1: s.sp.cx + s.half, z0: s.sp.cz - s.half, z1: s.sp.cz + s.half });
  world.obstacles = complex.obstacles[state.era].slice();
  // the Sphinx body and paws
  world.obstacles.push({ x0: SPHINX.cx - 37, x1: SPHINX.cx + 22, z0: SPHINX.cz - 7.5, z1: SPHINX.cz + 7.5 });
  world.obstacles.push({ x0: SPHINX.cx + 22, x1: SPHINX.cx + 37, z0: SPHINX.cz - 6.4, z1: SPHINX.cz - 2.4 });
  world.obstacles.push({ x0: SPHINX.cx + 22, x1: SPHINX.cx + 37, z0: SPHINX.cz + 2.4, z1: SPHINX.cz + 6.4 });
}

// modern stair and landing up the north face to al-Ma'mun's tunnel
function buildStairs(info, entId) {
  const e = info.ents.find((q) => q.id === entId);
  const P = info.P;
  const x0 = P.cx + e.u - 1.2, x1 = P.cx + e.u + 1.2;
  const zTop = P.cz - e.aBack, zFace = P.cz - (info.half + 6), yTop = P.baseY + e.yFloorBack;
  const zStart = zFace - 6;
  const mat = new THREE.MeshStandardMaterial({ color: 0xbfae94, roughness: 0.9 });
  const g = new THREE.Group(); g.name = 'stairs';
  const n = Math.ceil(yTop / 0.18);
  const run = (zTop - 3 - zStart) / n;
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * 0.18 + 0.3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, run + 0.02), mat);
    box.position.set((x0 + x1) / 2, P.baseY - 0.3 + h / 2, zStart + run * (i + 0.5));
    box.castShadow = box.receiveShadow = true;
    g.add(box);
  }
  const land = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, 3.2), mat);
  land.position.set((x0 + x1) / 2, yTop - 0.15, zTop - 1.6);
  land.castShadow = land.receiveShadow = true;
  g.add(land);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.5, metalness: 0.6 });
  for (const x of [x0, x1]) {
    const len = Math.hypot(zTop - 3 - zStart, yTop - P.baseY);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), railMat);
    r.position.set(x, (yTop + P.baseY) / 2 + 0.95, (zTop - 3 + zStart) / 2);
    r.rotation.x = -Math.atan2(yTop - P.baseY, zTop - 3 - zStart);
    g.add(r);
  }
  const volume = {
    id: 'stairs', pyr: null, x0, x1, z0: zStart, z1: zTop + 0.05, base: 0,
    range: (x, z) => {
      const f = Math.min(1, Math.max(0, (z - zStart) / (zTop - 3 - zStart)));
      return [P.baseY + f * (yTop - P.baseY), 1e4];
    },
  };
  return { mesh: g, volume };
}

// ----------------------------------------------------------------- labels --
function placeWorldPos(p, out = new THREE.Vector3()) {
  if (p.pyr && p.local) {
    const P = PYRAMIDS[p.pyr];
    return out.set(P.cx + p.local[0], P.baseY + p.local[1], P.cz + p.local[2]);
  }
  const [x, y, z] = p.world;
  return out.set(x, y === null ? app.terrain.heightAt(x, z) + 4 : y, z);
}
app.placeWorldPos = placeWorldPos;

// which prism contains an interior place (to know whether a cut exposes it)
function elementAt(p) {
  const it = app.interiors[p.pyr];
  const [x, y, z] = p.local;
  for (const el of it.def.elements) {
    const s = el.axis === 'x' ? z : x, a = el.axis === 'x' ? x : z;
    if (a < el.a0 - 0.6 || a > el.a1 + 0.6) continue;
    const r = profileRangeAt(el.profile, s);
    if (!r || y < r[0] - 1.5 || y > r[1] + 1.5) continue;
    return el;
  }
  return null;
}

function cutExposes(el, sec) {
  if (!el) return false;
  if (el.axis === sec.plane) return sec.offset > el.a0 - 0.4 && sec.offset < el.a1 + 0.4;
  let lo = Infinity, hi = -Infinity;
  el.profile.forEach(([s]) => { lo = Math.min(lo, s); hi = Math.max(hi, s); });
  return sec.offset > lo - 0.4 && sec.offset < hi + 0.4;
}

// short names for the map; the full name is in the info card
const SHORT = {
  khufu: 'Great Pyramid', khafre: 'Khafre', menkaure: 'Menkaure',
  'queens-khufu': 'Queens’ pyramids', 'queens-menkaure': 'Queens’ pyramids', satellite: 'Satellite pyramid',
  mast: 'Summit', 'k-robbers': 'Robbers’ tunnel', 'k-well': 'Well shaft', 'k-qshafts': 'Shafts', 'k-kshafts': 'Shafts',
  'k-sarc': 'Sarcophagus', 'k-ante': 'Antechamber', 'k-nfc': 'Hidden corridor', 'kh-burial': 'Burial chamber',
  'mk-niches': 'Six niches', 'mk-burial': 'Burial chamber', 'valley-khafre': 'Valley Temple', 'causeway-khafre': 'Causeway',
  'mortuary-khafre': 'Mortuary Temple', 'mortuary-khufu': 'Mortuary Temple', 'menkaure-temples': 'Menkaure’s temples',
  hetepheres: 'Hetepheres', khentkaus: 'Khentkaus', 'boat-pit': 'Ship pits', 'boat-pits-east': 'Boat pits',
  'workers-tombs': 'Builders’ tombs', 'workers-town': 'Workers’ town', panorama: 'Panorama', gem: 'Grand Egyptian Museum',
  quarry: 'Quarry',
};

function setupLabels() {
  const { labels } = app;
  const hulls = Object.values(app.pyr.info).map(({ P, half, tanA }) => ({ P, half, tanA, H: P.heightNow }));
  for (const sp of app.pyr.small) hulls.push({ P: { cx: sp.sp.cx, cz: sp.sp.cz, baseY: sp.sp.baseY }, half: sp.half, tanA: sp.tanA, H: sp.sp.heightNow });
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const occluded = (pos, cam) => {
    const d = pos.distanceTo(cam);
    const n = 40;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (d * (1 - t) < 8) break;
      tmp.lerpVectors(cam, pos, t);
      if (tmp.y < app.terrain.heightAt(tmp.x, tmp.z, false) - 1.5) return true;
      for (const h of hulls) {
        const y = tmp.y - h.P.baseY;
        if (y < 0 || y > h.H) continue;
        const r = h.half - y / h.tanA - 1.5;
        if (Math.abs(tmp.x - h.P.cx) < r && Math.abs(tmp.z - h.P.cz) < r) return true;
      }
    }
    return false;
  };
  const ray = new THREE.Raycaster();
  const dirV = new THREE.Vector3();
  const insideBlocked = (p, pos, cam) => {
    if (state.mode !== 'walk') return false;
    const it = app.interiors[p.pyr];
    const d = pos.distanceTo(cam);
    dirV.subVectors(pos, cam).divideScalar(d);
    ray.set(cam, dirV); ray.far = Math.max(0.1, d - 0.6);
    return ray.intersectObjects(it.eras[state.era].meshes, false).length > 0;
  };
  for (const p of PLACES) {
    const el = p.pyr && !p.exterior ? elementAt(p) : null;
    const it = labels.add({
      id: p.id, text: p.name, short: SHORT[p.id] || p.name.replace(/\s*\(.*\)\s*$/, ''), kind: p.kind, prio: p.prio,
      getPos: (out) => placeWorldPos(p, out),
      maxDist: p.prio === 1 ? 9000 : p.prio === 2 ? 1700 : 520,
      occlusion: (p.pyr && !p.exterior) ? (pos, cam) => insideBlocked(p, pos, cam) : occluded,
      visible: () => {
        if (p.era && p.era !== state.era) return false;
        if (p.void && !state.showVoids) return false;
        if (p.pyr && !p.exterior) {
          if (state.mode === 'walk') return app.walk.inside === p.pyr && camera.position.distanceTo(placeWorldPos(p, tmp2)) < 30;
          if (state.xray) return true;
          if (state.section && app.section.target === p.pyr) return p.void ? true : cutExposes(el, app.section);
          return false;
        }
        if (state.mode === 'walk' && app.walk.inside) return false;
        return true;
      },
    });
    if (p.void) it.el.classList.add('void');
  }
}

// ---------------------------------------------------------------- actions --
function setMode(mode, opts = {}) {
  if (mode === state.mode && !opts.force) return;
  const { walk, flyer } = app;
  const prev = state.mode;
  app.cancelFly();
  if (prev === 'fly' && mode !== 'fly') { flyer.disable(); aimAhead(); }
  if (mode === 'walk') {
    state.mode = mode;
    controls.enabled = false;
    if (state.section) setSection(false, { instant: true });
    if (state.xray) setXray(false, { instant: true });
    const sp = walkSpawn();
    walk.enable(sp.pos, sp.yaw, 0);
    camera.near = 0.05; camera.updateProjectionMatrix();
    app.ui.toast(sp.hint || (coarse ? 'Joystick to move, drag to look' : 'W A S D to move, click to look around'));
  } else if (mode === 'fly') {
    state.mode = mode;
    controls.enabled = false;
    if (prev === 'walk') {
      walk.disable(); walk.inside = null; app.sky.setInterior(0);
      camera.position.y += 30;              // take off from where you stood
    }
    flyer.enable();
    app.ui.toast(coarse ? 'Joystick to fly · drag to look · ▲▼ to climb' : 'W A S D to fly · Q / E down and up · drag to look · Shift faster');
  } else {
    state.mode = mode;
    controls.enabled = true;
    if (prev === 'walk') {
      const wasInside = walk.inside;
      walk.disable();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      controls.target.copy(camera.position).addScaledVector(fwd, 30);
      walk.inside = null;
      app.sky.setInterior(0);
      if (wasInside) setSection(true, { target: wasInside });
    }
  }
  app.ui.syncMode(mode);
}

// After free flight, orbit about a point straight ahead (keeping the view
// exactly as it is): where the line of sight meets the ground, or a few
// hundred metres out if it never does.
function aimAhead() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const p = camera.position.clone();
  const h = Math.max(5, p.y - app.terrain.heightAt(p.x, p.z, false));
  const far = THREE.MathUtils.clamp(h * 3, 150, 1200);
  let d = far;
  const step = Math.max(2, h * 0.05);
  for (let s = step; s < far; s += step) {
    const q = p.clone().addScaledVector(fwd, s);
    if (q.y <= app.terrain.heightAt(q.x, q.z, false)) { d = s; break; }
  }
  controls.target.copy(p).addScaledVector(fwd, d);
  controls.update();
}

// Where to put the visitor when they switch to Walk.
function walkSpawn() {
  const face = (pos, tx, tz) => Math.atan2(-(tx - pos.x), -(tz - pos.z));
  const ground = (x, z) => new THREE.Vector3(x, app.terrain.heightAt(x, z), z);
  // which pyramid is the visitor looking at (or inside)?
  let pid = null;
  if (state.section) pid = app.section.target;
  const sel = PLACES.find((q) => q.id === state.selected);
  if (!pid && sel?.pyr && !sel.exterior) pid = sel.pyr;
  if (!pid) {
    for (const { P, half } of Object.values(app.pyr.info)) {
      const t = controls.target;
      if (Math.abs(t.x - P.cx) < half + 10 && Math.abs(t.z - P.cz) < half + 10 && camera.position.distanceTo(t) < 900) pid = P.id;
    }
  }
  if (pid) {
    const P = PYRAMIDS[pid];
    const spots = {
      khufu: [app.pyr.info.khufu.ents.find((e) => e.id === 'robbers').u, -133],
      khafre: [6.0, -122],
      menkaure: [0, -70],
    };
    const [lx, lz] = spots[pid];
    const pos = ground(P.cx + lx, P.cz + lz);
    const hint = state.era === 'built'
      ? 'In 2560 BCE the entrances were sealed: open Places to jump inside'
      : pid === 'khafre' ? 'The lower entrance is the opening in the pavement ahead'
        : 'Walk up the stairs ahead into the pyramid';
    return { pos, yaw: face(pos, P.cx + lx, P.cz), hint };
  }
  // outdoors: stand where we were looking, facing the same way
  const t = controls.target;
  const fwd = t.clone().sub(camera.position).setY(0);
  const yaw = fwd.lengthSq() > 1e-6 ? Math.atan2(-fwd.x, -fwd.z) : 0;
  if (camera.position.distanceTo(t) < 900) {
    for (let r = 0; r <= 60; r += 6) {
      for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
        const y = app.terrain.heightAt(x, z);
        if (app.world.fits(x, z, y)) return { pos: new THREE.Vector3(x, y, z), yaw };
      }
    }
  }
  // default: south of the Great Pyramid, looking north-west at Khufu and Khafre
  const pos = ground(70, 300);
  return { pos, yaw: face(pos, -150, 120), hint: 'Tip: open Places and choose “Walk here” to go inside a pyramid' };
}

function enterWalkAt(p) {
  let pos, yaw = 0;
  if (p.era && p.era !== state.era) setEra(p.era);   // e.g. the robbers' tunnel only exists today
  if (p._direct) { pos = p._direct.pos.clone(); yaw = p._direct.yaw; }
  else if (p.walk?.local && p.pyr) {
    const P = PYRAMIDS[p.pyr];
    pos = new THREE.Vector3(P.cx + p.walk.local[0], P.baseY + p.walk.local[1], P.cz + p.walk.local[2]);
    yaw = -THREE.MathUtils.degToRad(p.walk.yaw || 0);
  } else {
    const target = placeWorldPos(p);
    const view = p.view || { yaw: 0, dist: 40 };
    const a = THREE.MathUtils.degToRad(view.yaw || 0);
    const d = Math.min(Math.max((view.dist || 40) * 0.5, 18), 160);
    pos = new THREE.Vector3(target.x + Math.sin(a) * d, 0, target.z - Math.cos(a) * d);
    for (let k = 0; k < 14 && !app.world.fits(pos.x, pos.z, app.terrain.heightAt(pos.x, pos.z)); k++) {
      pos.x += Math.sin(a) * 6; pos.z -= Math.cos(a) * 6;
    }
    pos.y = app.terrain.heightAt(pos.x, pos.z);
    yaw = Math.atan2(-(target.x - pos.x), -(target.z - pos.z));
  }
  app.cancelFly();
  if (state.mode === 'fly') app.flyer.disable();
  if (state.section) setSection(false, { instant: true });
  if (state.xray) setXray(false, { instant: true });
  app.cancelFly();
  if (state.mode !== 'walk') {
    state.mode = 'walk'; controls.enabled = false; app.ui.syncMode('walk');
    camera.near = 0.05; camera.updateProjectionMatrix();
  }
  app.walk.enable(pos, yaw, 0);
}
app.enterWalkAt = enterWalkAt;

function setEra(era) {
  if (era === state.era) return;
  state.era = era;
  const today = era === 'today';
  const { pyr, interiors, complex, sphinx, rubble, stairs } = app;
  for (const g of Object.values(pyr.groups)) { g.today.visible = today; g.built.visible = !today; }
  pyr.smallGroup.visible = today; pyr.smallBuilt.visible = !today;
  rubble.visible = today && !state.xray;
  for (const it of Object.values(interiors)) {
    it.eras.today.group.visible = today; it.eras.built.group.visible = !today;
    it.props.today.visible = today; it.props.built.visible = !today;
    if (it.ghost) it.ghost.children.forEach((g) => { g.visible = g.userData.era === era; });
  }
  if (app.hulls) app.hulls.children.forEach((l) => { l.visible = l.userData.era === era; });
  complex.today.visible = today; complex.built.visible = !today;
  complex.city.visible = today && state.showCity;
  app.scatter.visible = today;
  app.palms.today.visible = today; app.palms.built.visible = !today;
  sphinx.group.userData.setEra(era);
  stairs.forEach((st) => { st.mesh.visible = today; });
  app.terrain.uniforms.uEra.value = today ? 0 : 1;
  app.section.era = era;
  if (state.section) app.section.update();
  if (state.xray) applyXray(true);
  setupWorld();
  if (state.mode === 'walk' && !app.world.resolve(app.walk.feet, 0, 0)) {
    app.walk.enable(new THREE.Vector3(60, app.terrain.heightAt(60, -175), -175), app.walk.yaw, 0);
  }
  app.ui.syncEra(era);
}

const xrayCache = new Map();
function applyXray(on) {
  const mats = new Set();
  const collect = (o) => o.traverse((m) => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x)); });
  for (const g of Object.values(app.pyr.groups)) collect(g.group);
  collect(app.pyr.smallGroup); collect(app.pyr.smallBuilt);
  for (const m of mats) {
    if (on) {
      if (!xrayCache.has(m)) xrayCache.set(m, { t: m.transparent, o: m.opacity, d: m.depthWrite });
      m.transparent = true; m.opacity = 0.2; m.depthWrite = false;
    } else if (xrayCache.has(m)) {
      const c = xrayCache.get(m); m.transparent = c.t; m.opacity = c.o; m.depthWrite = c.d;
    }
    m.needsUpdate = true;
  }
  for (const g of Object.values(app.pyr.groups)) g.group.traverse((m) => { if (m.isMesh) m.castShadow = !on; });
}

function setXray(on, { instant = false } = {}) {
  if (on === state.xray) return;
  state.xray = on;
  if (on && state.section) setSection(false);
  if (!on && !state.section && !instant && state.mode === 'orbit') { const exit = exitPoint(); if (exit) flyTo(exit, controls.target.clone(), 1100); }
  applyXray(on);
  app.rubble.visible = !on && state.era === 'today';
  // outlines of the pyramids
  if (!app.hulls) {
    app.hulls = new THREE.Group();
    const lm = new THREE.LineBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.55, depthWrite: false });
    const hullLines = (cx, cz, by, half, tanA, H) => {
      const top = Math.max(0, half - H / tanA);
      const pts = [];
      const b = [[-half, -half], [half, -half], [half, half], [-half, half]];
      const t = b.map(([x, z]) => [x * top / half, z * top / half]);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        pts.push(cx + b[i][0], by, cz + b[i][1], cx + b[j][0], by, cz + b[j][1]);
        pts.push(cx + b[i][0], by, cz + b[i][1], cx + t[i][0], by + H, cz + t[i][1]);
        if (top > 0.01) pts.push(cx + t[i][0], by + H, cz + t[i][1], cx + t[j][0], by + H, cz + t[j][1]);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return new THREE.LineSegments(g, lm);
    };
    for (const { P, half, tanA } of Object.values(app.pyr.info)) {
      const l = hullLines(P.cx, P.cz, P.baseY, half, tanA, P.heightNow); l.userData.era = 'today'; app.hulls.add(l);
      const l2 = hullLines(P.cx, P.cz, P.baseY, half, tanA, P.heightOrig - 0.01); l2.userData.era = 'built'; app.hulls.add(l2);
    }
    app.hulls.userData.noClip = true;
    scene.add(app.hulls);
  }
  app.hulls.visible = on;
  app.hulls.children.forEach((l) => { l.visible = l.userData.era === state.era; });
  // ghost overlay so passages below ground show through the terrain
  for (const it of Object.values(app.interiors)) {
    if (!it.ghost) {
      it.ghost = new THREE.Group();
      const gm = new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      for (const era of ['today', 'built']) {
        for (const m of it.eras[era].meshes) {
          const g = new THREE.Mesh(m.geometry, gm);
          g.renderOrder = 5; g.userData.era = era; g.userData.noClip = true;
          it.ghost.add(g);
        }
      }
      it.group.add(it.ghost);
    }
    it.ghost.children.forEach((g) => { g.visible = g.userData.era === state.era; });
    it.ghost.visible = on;
    it.voidMeshes.forEach((v) => { v.visible = on && state.showVoids; });
  }
  app.ui.syncXray(on);
}

function syncVoids() {
  const { section } = app;
  for (const it of Object.values(app.interiors)) it.voidMeshes.forEach((v) => { v.visible = ((state.section && section.target === it.id) || state.xray) && state.showVoids; });
}

// Where to put the camera so that it is clear of the stone: straight back
// along the line of sight from wherever it is now. null if already outside.
function exitPoint() {
  const q = camera.position.clone();
  keepOutOfStone(q);
  if (q.distanceToSquared(camera.position) < 0.01) return null;
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.15) { dir.y = 0.15; dir.normalize(); }
  const p = camera.position.clone(), t = new THREE.Vector3();
  for (let i = 0; i < 300; i++) {
    p.addScaledVector(dir, 2);
    keepOutOfStone(t.copy(p), 6);
    if (t.distanceToSquared(p) < 1e-4) return p.addScaledVector(dir, 70 * fitScale());   // and far enough to see it
  }
  return q;
}

function setSection(on, opts = {}, moveCamera = true) {
  const { section } = app;
  let flyP = Promise.resolve();
  if (on) {
    if (state.xray) setXray(false);
    if (state.mode === 'walk') setMode('orbit');
    const target = opts.target || section.target;
    const plane = opts.plane || section.plane;
    let offset = opts.offset;
    if (offset === undefined) offset = (opts.target || opts.plane || !state.section) ? section.defaultOffset(target, plane) : section.offset;
    try {
      section.set({ era: state.era, flip: opts.flip ?? section.flip, target, plane, offset });
      if (!section.enabled) section.setEnabled(true);
    } catch (e) {
      reportError('Cutaway', e);
      state.section = false;
      if (section.enabled) section.setEnabled(false);
      app.ui.syncSection(false);
      return flyP;
    }
    state.section = true;
    if (moveCamera) {
      const vp = section.viewpoint();
      const tgt = new THREE.Vector3(...vp.target);
      const pos = new THREE.Vector3(...vp.pos).sub(tgt).multiplyScalar(fitScale()).add(tgt);
      flyP = flyTo(pos, tgt);
    }
  } else if (state.section) {
    state.section = false;
    // Cut views often put the camera where the removed half of the stone
    // would be. Back out of it first, with the cut still showing, and only
    // close the stone once the camera is outside.
    const exit = !state.xray && !opts.instant && state.mode === 'orbit' ? exitPoint() : null;
    if (exit) {
      flyP = flyTo(exit, controls.target.clone(), 1100, { free: true });
      flyP.then(() => { if (!state.section) section.setEnabled(false); syncVoids(); });
    } else section.setEnabled(false);
  }
  syncVoids();
  app.ui.syncSection(state.section);
  return flyP;
}
app.setSection = setSection;
app.selectPlace = (id, o) => selectPlace(id, o);
app.setEra = (e) => setEra(e);
app.places = PLACES;

function setLabels(on) { state.labels = on; app.labels.setEnabled(on); app.ui.syncLabels(on); }
function setVoids(on) { state.showVoids = on; for (const it of Object.values(app.interiors)) it.voidMeshes.forEach((v) => { v.visible = on && (state.xray || (state.section && app.section.target === it.id)); }); }
function setCity(on) { state.showCity = on; app.complex.city.visible = on && state.era === 'today'; }
function setTorch(on) { state.torch = on; app.ui.toast(on ? 'Torch on' : 'Torch off'); }

function setTime(h) {
  app.sky.setLocalTime(h);
  app.ui?.syncTime(h);
}

// ---------------------------------------------------------- camera moves --
let fly = null;
const _sph = new THREE.Spherical();
function flyTo(pos, target, ms = 1600, { free = false } = {}) {
  if (fly) fly.done();
  const t0 = controls.target.clone(), t1 = target.clone();
  const o0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t0));
  const o1 = new THREE.Spherical().setFromVector3(pos.clone().sub(t1));
  o0.radius = Math.max(o0.radius, 0.5); o1.radius = Math.max(o1.radius, 0.5);
  let dTheta = o1.theta - o0.theta;
  dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));        // the short way round
  const travel = t0.distanceTo(t1);
  // long trips rise up and come back down, so the destination is seen coming
  const bump = free ? 0 : Math.min(1.6, (travel / Math.max(o0.radius, o1.radius, 40)) * 0.35);
  const zoom = Math.abs(Math.log(o1.radius / o0.radius));
  const dur = free ? ms : THREE.MathUtils.clamp(650 + 480 * Math.log2(1 + travel / 120) + 260 * zoom + Math.abs(dTheta) * 220, 700, Math.max(ms, 2900));
  return new Promise((resolve) => {
    fly = { t0, t1, o0, o1, dTheta, bump, ms: dur, start: performance.now(), free, done: resolve };
    if (STILL) { camera.position.copy(pos); controls.target.copy(target); fly = null; controls.update(); resolve(); }
  });
}
function stepFly(now) {
  const f = fly;
  const t = Math.min(1, (now - f.start) / f.ms);
  const e = t * t * t * (t * (t * 6 - 15) + 10);                    // smootherstep
  controls.target.lerpVectors(f.t0, f.t1, e);
  const r = Math.exp(THREE.MathUtils.lerp(Math.log(f.o0.radius), Math.log(f.o1.radius), e)) * (1 + f.bump * Math.sin(Math.PI * e));
  const phi = THREE.MathUtils.clamp(THREE.MathUtils.lerp(f.o0.phi, f.o1.phi, e) - Math.min(0.35, f.bump * 0.4) * Math.sin(Math.PI * e), 0.02, Math.PI - 0.02);
  _sph.set(r, phi, f.o0.theta + f.dTheta * e);
  camera.position.setFromSpherical(_sph).add(controls.target);
  camera.lookAt(controls.target);
  if (t >= 1) { fly = null; f.done(); }
}
app.flyTo = flyTo;
app.cancelFly = () => { if (fly) { fly.done(); fly = null; } };

// On phones a tall portrait view sees little sideways: back off so the subject fits.
function fitScale() { return Math.max(1, 0.9 / Math.max(0.2, camera.aspect)); }
function flyHome() {
  if (state.mode !== 'orbit') setMode('orbit');
  if (state.section) setSection(false, { instant: true });
  if (state.xray) setXray(false, { instant: true });
  app.ui.hideInfo();
  const portrait = camera.aspect < 0.8;
  const [p, t] = portrait ? [[-820, 560, 1080], [-300, 15, 380]] : [app.home.pos.toArray(), app.home.target.toArray()];
  flyTo(new THREE.Vector3(...p), new THREE.Vector3(...t));
}
app.flyHome = flyHome;

function viewFor(p) {
  const anchor = placeWorldPos(p);
  const v = p.view || { dist: 80, yaw: 30, pitch: 20 };
  const target = anchor.clone();
  if (v.ty) target.y += v.ty;
  const yaw = THREE.MathUtils.degToRad(v.yaw ?? 30), pitch = THREE.MathUtils.degToRad(v.pitch ?? 20);
  const dist = v.dist * (v.look ? 1 : fitScale());
  const pos = new THREE.Vector3(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z - Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  if (v.look) {
    target.set(...v.look);
    // narrow screens: step back along the line of sight so the whole scene fits
    const k = Math.min(1.7, fitScale() * 0.85);
    if (k > 1) pos.sub(target).multiplyScalar(k).add(target);
  }
  const gy = app.terrain.heightAt(pos.x, pos.z, false) + 3;
  if (pos.y < gy) pos.y = gy;
  return { pos, target };
}

function selectPlace(id, opts = {}) {
  const p = PLACES.find((q) => q.id === id);
  if (!p) return Promise.resolve();
  state.selected = id;
  app.labels.select(id);
  if (!opts.silent) app.ui.showInfo(p);
  if (opts.noMove) return Promise.resolve();
  if (app.tour?.active && !opts.silent) app.tour.stop();
  if (p.era && p.era !== state.era) setEra(p.era);
  if (state.mode === 'fly') setMode('orbit');
  if (state.mode === 'walk') {
    if (p.walk || !p.pyr || p.exterior) enterWalkAt(p);
    return Promise.resolve();
  }
  if (!(p.pyr && !p.exterior)) {
    if (state.section) setSection(false, { instant: true });
    if (state.xray) setXray(false, { instant: true });
  }
  if (p.pyr && !p.exterior) {
    // open the pyramid so the place can be seen
    const P = PYRAMIDS[p.pyr];
    const plane = p.section?.plane || 'x';
    let offset = p.section?.offset;
    if (offset === undefined) {
      const el = elementAt(p);
      const def = app.section.defaultOffset(p.pyr, plane);
      offset = !el || cutExposes(el, { plane, offset: def }) ? def : (plane === 'x' ? p.local[0] : p.local[2]);
    }
    if (p.void && !state.section) setXray(true);
    else if (!p.void) setSection(true, { target: p.pyr, plane, offset, flip: false }, false);
    const target = placeWorldPos(p);
    const d = ((p.view && p.view.dist) || 30) * fitScale();
    const pos = plane === 'x'
      ? new THREE.Vector3(P.cx + offset + d, target.y + d * 0.2, target.z + d * 0.3)
      : new THREE.Vector3(target.x - d * 0.3, target.y + d * 0.2, P.cz + offset + d);
    if (opts.instant || STILL) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return Promise.resolve(); }
    return flyTo(pos, target);
  }
  const { pos, target } = viewFor(p);
  if (opts.instant || STILL) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return Promise.resolve(); }
  return flyTo(pos, target);
}

// Keep the orbiting camera out of the solid pyramids. Orbiting about a point
// on a face (an entrance, say) would otherwise swing it inside the stone,
// where every block is seen from behind and the pyramid looks hollow. Not
// applied in cutaway or x-ray, where looking from inside is the point.
const SOLIDS = [...Object.values(PYRAMIDS), ...SMALL_PYRAMIDS];
function keepOutOfStone(p, margin = 1.5) {
  for (let pass = 0; pass < 2; pass++) {
    for (const P of SOLIDS) {
      const s = Math.sin(P.slope), c = Math.cos(P.slope), t = Math.tan(P.slope), hb = P.base / 2;
      const full = hb * t;
      const H = state.era === 'built' ? (P.heightOrig ?? full) : (P.heightNow ?? full);
      if (H < 3) continue;
      const dx = p.x - P.cx, dz = p.z - P.cz, y = p.y - P.baseY;
      if (y < -2 || y > H + margin) continue;
      const ax = Math.abs(dx), az = Math.abs(dz), m = Math.max(ax, az);
      const reach = hb - Math.max(0, y) / t;           // half-width of the solid at this height
      if (m > reach + margin / s) continue;
      // out through the nearest face, or over the (truncated) top if that is closer
      const dFace = (reach - m) * s + margin, dTop = H + margin - y;
      if (dTop < dFace) { p.y = P.baseY + H + margin; continue; }
      if (ax >= az) p.x += Math.sign(dx || 1) * s * dFace; else p.z += Math.sign(dz || 1) * s * dFace;
      p.y += c * dFace;
    }
  }
}
app.keepOutOfStone = keepOutOfStone;

// ------------------------------------------------------- map navigation --
// Keep the orbit centre on the map, pan with the keyboard, and double-click
// (or double-tap) anywhere to fly there.
function clampTarget() {
  const t = controls.target;
  const x = THREE.MathUtils.clamp(t.x, BOUNDS.x0, BOUNDS.x1), z = THREE.MathUtils.clamp(t.z, BOUNDS.z0, BOUNDS.z1);
  if (x !== t.x || z !== t.z) { camera.position.x += x - t.x; camera.position.z += z - t.z; t.x = x; t.z = z; }
  const g = app.terrain.heightAt(t.x, t.z, false);
  const y = THREE.MathUtils.clamp(t.y, g - 60, g + 320);
  if (y !== t.y) t.y += (y - t.y) * 0.15;      // ease, never jolt the camera
}
const panKeys = new Set();
function panByKeys(dt) {
  if (!panKeys.size || !controls.enabled) return;
  let f = 0, r = 0;
  if (panKeys.has('KeyW') || panKeys.has('ArrowUp')) f += 1;
  if (panKeys.has('KeyS') || panKeys.has('ArrowDown')) f -= 1;
  if (panKeys.has('KeyA') || panKeys.has('ArrowLeft')) r -= 1;
  if (panKeys.has('KeyD') || panKeys.has('ArrowRight')) r += 1;
  if (!f && !r) return;
  app.cancelFly();
  const fwd = _fwd.copy(controls.target).sub(camera.position); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) return;
  fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const k = camera.position.distanceTo(controls.target) * 0.9 * dt;
  const d = fwd.multiplyScalar(f * k).addScaledVector(right, r * k);
  controls.target.add(d); camera.position.add(d);
}
function setupMapNavigation() {
  const dom = renderer.domElement;
  addEventListener('keydown', (e) => {
    if (state.mode !== 'orbit' || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code)) { panKeys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
  });
  addEventListener('keyup', (e) => panKeys.delete(e.code));
  addEventListener('blur', () => panKeys.clear());
  const ray = new THREE.Raycaster();
  const focusAt = (cx, cy) => {
    if (state.mode !== 'orbit') return;
    const r = dom.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const objs = [app.ground, ...Object.values(app.pyr.groups).map((g) => g.group), app.pyr.smallGroup, app.pyr.smallBuilt];
    const hit = ray.intersectObjects(objs, true).find((h) => h.object.visible);
    if (!hit) return;
    const off = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp(off.length() * 0.55, 30, 900);
    off.setLength(d);
    const pos = hit.point.clone().add(off);
    const gy = app.terrain.heightAt(pos.x, pos.z, false) + 3;
    if (pos.y < gy) pos.y = gy;
    flyTo(pos, hit.point);
  };
  dom.addEventListener('dblclick', (e) => focusAt(e.clientX, e.clientY));
  let last = null;
  // timings use when each touch happened (event.timeStamp), not when it was handled
  let down = null;
  dom.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
  dom.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !down) return;
    const d = down; down = null;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || e.timeStamp - d.t > 300) { last = null; return; }
    const now = e.timeStamp;
    if (last && now - last.t < 350 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) { last = null; focusAt(e.clientX, e.clientY); } else last = { x: e.clientX, y: e.clientY, t: now };
  });
}

// Errors show up as a short note on screen (most visitors use phones, where
// there is no console), at most one every few seconds.
let lastErr = 0;
function reportError(where, e) {
  console.error(where, e);
  const now = performance.now();
  if (now - lastErr < 4000 || !app.ui) return;
  lastErr = now;
  const msg = String((e && (e.message || e.reason?.message || e.reason)) || e || 'unknown').slice(0, 140);
  app.ui.toast(`${where} problem: ${msg}`);
}
addEventListener('error', (ev) => reportError('Script', ev.error || ev.message));
addEventListener('unhandledrejection', (ev) => reportError('Script', ev.reason));
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  const log = (gl.getProgramInfoLog(program) || '') + ' ' + (gl.getShaderInfoLog(fs) || '') + ' ' + (gl.getShaderInfoLog(vs) || '');
  reportError('Graphics', log.trim() || 'shader failed to compile');
};

// ------------------------------------------------------------------- loop --
const _fwd = new THREE.Vector3(), _focus = new THREE.Vector3();
const clock = new THREE.Clock();
let envTimer = 0;
function startLoop() {
  let frames = 0;
  const loop = () => {
    const dt = Math.min(0.1, clock.getDelta());
    const now = performance.now();
    if (fly && state.mode === 'orbit') stepFly(now);
    // never leave the stone sliced open while the cutaway is off
    if (app.section.enabled !== state.section && !fly?.free) {
      if (!state.section) { app.section.setEnabled(false); app.ui.syncSection(false); } else setSection(true);
    }
    let focus, radius;
    if (state.mode === 'walk') {
      app.walk.update(dt);
      focus = app.walk.feet; radius = 90;
      app.ui.setWhere(app.walk.inside ? PYRAMIDS[app.walk.inside].name : '');
    } else if (state.mode === 'fly') {
      app.flyer.update(dt);
      const h = Math.max(2, app.flyer.height());
      camera.near = THREE.MathUtils.clamp(h * 0.004, 0.1, 2.5);
      camera.updateProjectionMatrix();
      const fwd = _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      focus = _focus.copy(camera.position).addScaledVector(fwd, Math.min(h * 2, 400));
      focus.y = app.terrain.heightAt(focus.x, focus.z, false);
      radius = THREE.MathUtils.clamp(h * 1.6, 70, 900);
      app.ui.setWhere(`${Math.round(h)} m up`);
    } else {
      panByKeys(dt);
      if (!fly) clampTarget();
      controls.update();
      const minY = app.terrain.heightAt(camera.position.x, camera.position.z, false) + 1.2;
      if (camera.position.y < minY && !state.section) camera.position.y = minY;
      if (!state.section && !state.xray && !fly?.free) keepOutOfStone(camera.position);
      const dist = camera.position.distanceTo(controls.target);
      camera.near = THREE.MathUtils.clamp(dist * 0.0015, 0.08, 3);
      camera.updateProjectionMatrix();
      focus = controls.target; radius = Math.max(40, dist * 0.85);
    }
    app.sky.fitShadow(focus, radius);
    app.tour.tick(dt);
    if (state.era === 'built') { const nm = app.complex.water.material.normalMap; nm.offset.x += dt * 0.012; nm.offset.y += dt * 0.007; }
    applyViewOffset(STILL ? 1 : dt);
    updateLights(dt);
    envTimer += dt;
    if (envTimer > 0.25) { envTimer = 0; app.sky.updateEnvironment(); }
    renderer.render(scene, camera);
    if (state.labels) app.labels.update(container.clientWidth, container.clientHeight, dt);
    app.ui.updateCompass(camera);
    frames++;
    if (STILL && frames >= STILL) { renderer.setAnimationLoop(null); window.__stillDone = true; }
  };
  renderer.setAnimationLoop(loop);
  app.step = loop;   // one frame on demand (used by automated tests)
}

// On phones, keep the subject in the part of the screen not covered by the
// bottom sheet (place details or the tour card).
let lastOffset = 0, offCur = 0;
function applyViewOffset(dt = 1) {
  const cover = state.mode === 'orbit' || app.tour?.active ? app.ui.bottomCover() : 0;
  const k = cover * 0.5;
  offCur += (k - offCur) * Math.min(1, dt * 7);
  if (Math.abs(offCur - k) < 0.5) offCur = k;
  const o = Math.round(offCur);
  if (o === lastOffset) return;
  lastOffset = o;
  const w = container.clientWidth, h = container.clientHeight;
  if (o > 0) camera.setViewOffset(w, h, 0, o, w, h);
  else camera.clearViewOffset();
}

// interior lamps, torch and eye adaptation
let adapt = 0;
function updateLights(dt) {
  const { pool, interiors, walk, torch, sky } = app;
  const inside = state.mode === 'walk' && walk.inside;
  const want = inside ? 1 : 0;
  adapt += (want - adapt) * Math.min(1, dt * 2.5);
  if (STILL) adapt = want;
  sky.setInterior(adapt * 0.97);
  renderer.toneMappingExposure = 0.62 + adapt * 0.75;
  const ref = state.mode === 'walk' ? camera.position : controls.target;
  const lamps = [];
  const showLamps = state.era === 'today' && (inside || state.section);
  if (showLamps) {
    for (const it of Object.values(interiors)) {
      if (!inside && app.section.target !== it.id) continue;
      for (const l of it.lamps) {
        const x = it.P.cx + l.p[0], y = it.P.baseY + l.p[1], z = it.P.cz + l.p[2];
        lamps.push({ x, y, z, d: Math.hypot(x - ref.x, y - ref.y, z - ref.z), l });
      }
    }
    lamps.sort((a, b) => a.d - b.d);
  }
  pool.forEach((pl, i) => {
    const c = lamps[i];
    if (c && c.d < 80) {
      pl.position.set(c.x, c.y, c.z);
      pl.intensity = c.l.i * (inside ? 20 : 22);
      pl.distance = c.l.d * (inside ? 2.2 : 2.5);
    } else pl.intensity = 0;
  });
  const torchOn = state.mode === 'walk' && (state.torch || (inside && state.era === 'built'));
  torch.intensity = torchOn ? (inside ? 60 : 20) : 0;
  // soft light around the visitor so no passage is pitch black
  app.fill.intensity = inside ? (state.era === 'today' ? 5 : 2.5) * adapt : 0;
}

addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  lastOffset = -1;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

init().catch((e) => {
  console.error(e);
  window.__error = String(e.stack || e);
  const m = document.getElementById('loadMsg');
  if (m) m.textContent = 'Something went wrong while building the scene: ' + e.message;
});
