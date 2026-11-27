// Giza — app bootstrap and orchestration.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkySystem } from '../../shared/engine/sky.js';
import { LabelLayer } from '../../shared/engine/labels.js';
import { WalkController } from '../../shared/engine/walk.js';
import { SITE, PYRAMIDS, SPHINX } from './data/site.js';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
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
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.minDistance = 2;
controls.maxDistance = 7000;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;

const sky = new SkySystem(renderer, scene, { lat: SITE.lat, lon: SITE.lon, utcOffset: SITE.utcOffset, shadowSize: quality === 'low' ? 2048 : 4096 });
const progress = (p, msg) => window.__setProgress?.(p, msg);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

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

  progress(0.74, 'Carving the Sphinx'); await nextFrame();
  const sphinx = loadSphinx(quality);
  scene.add(sphinx.group);
  sphinx.group.userData.setEra('today');

  // modern stairs up to the robbers' tunnel
  const stairs = buildStairs(pyr.info.khufu);
  scene.add(stairs.mesh);

  Object.assign(app, { terrain, ground, skirt, pyr, rubble, interiors, complex, sphinx, stairs });

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
  Object.assign(app, { pool, torch });

  // ---- labels
  const labels = new LabelLayer(document.getElementById('labels'), camera, { onSelect: (id) => selectPlace(id) });
  app.labels = labels;
  setupLabels();

  // ---- UI
  const ui = createUI(app, {
    setMode, setEra, setXray, setSection, setLabels, setTime, selectPlace, flyHome, setVoids, setCity, setTorch,
  });
  app.ui = ui;

  // ---- initial view
  const v = params.get('view');
  const views = {
    default: [[760, 230, 1180], [-230, 25, 330]],
    khufu: [[160, 40, -330], [0, 40, 0]],
    entrance: [[30, 22, -140], [7, 15, -100]],
    sw: [[-700, 60, 560], [-340, 50, 340]],
    sphinx: [[430, -25, 470], [330, -30, 434]],
    panorama: [[-1000, 30, 1100], [-300, 60, 400]],
  };
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
  ui.maybeShowHelp();
  startLoop();
}

// ------------------------------------------------------------------ world --
function setupWorld() {
  const { world, interiors, pyr, complex } = app;
  const vols = Object.values(interiors).map((it) => ({ id: it.id, P: it.P, vols: it.eras[state.era].walk }));
  world.setInteriorVolumes(vols);
  if (state.era === 'today') world.addVolume(app.stairs.volume);
  world.footprints = Object.values(pyr.info).map(({ P, S }) => ({ x0: P.cx - S[0] - 0.3, x1: P.cx + S[0] + 0.3, z0: P.cz - S[0] - 0.3, z1: P.cz + S[0] + 0.3 }));
  for (const s of pyr.small) world.footprints.push({ x0: s.sp.cx - s.half, x1: s.sp.cx + s.half, z0: s.sp.cz - s.half, z1: s.sp.cz + s.half });
  world.obstacles = complex.obstacles[state.era].slice();
  // the Sphinx body and paws
  world.obstacles.push({ x0: SPHINX.cx - 37, x1: SPHINX.cx + 22, z0: SPHINX.cz - 7.5, z1: SPHINX.cz + 7.5 });
  world.obstacles.push({ x0: SPHINX.cx + 22, x1: SPHINX.cx + 37, z0: SPHINX.cz - 6.4, z1: SPHINX.cz - 2.4 });
  world.obstacles.push({ x0: SPHINX.cx + 22, x1: SPHINX.cx + 37, z0: SPHINX.cz + 2.4, z1: SPHINX.cz + 6.4 });
}

// modern stair and landing up the north face to al-Ma'mun's tunnel
function buildStairs(info) {
  const e = info.ents.find((q) => q.id === 'robbers');
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

function setupLabels() {
  const { labels } = app;
  const hulls = Object.values(app.pyr.info).map(({ P, half, tanA }) => ({ P, half, tanA, H: P.heightNow }));
  for (const sp of app.pyr.small) hulls.push({ P: { cx: sp.sp.cx, cz: sp.sp.cz, baseY: sp.sp.baseY }, half: sp.half, tanA: sp.tanA, H: sp.sp.heightNow });
  const tmp = new THREE.Vector3();
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
  for (const p of PLACES) {
    const el = p.pyr && !p.exterior ? elementAt(p) : null;
    const it = labels.add({
      id: p.id, text: p.name, kind: p.kind, prio: p.prio,
      getPos: (out) => placeWorldPos(p, out),
      maxDist: p.prio === 1 ? 9000 : p.prio === 2 ? 2200 : 700,
      occlusion: (p.pyr && !p.exterior) ? null : occluded,
      visible: () => {
        if (p.era && p.era !== state.era) return false;
        if (p.void && !state.showVoids) return false;
        if (p.pyr && !p.exterior) {
          if (state.mode === 'walk') return app.walk.inside === p.pyr;
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
  const { walk } = app;
  if (mode === 'walk') {
    state.mode = mode;
    controls.enabled = false;
    if (state.section) setSection(false);
    if (state.xray) setXray(false);
    // drop in where we were looking, facing the same way
    const t = controls.target.clone();
    const dir = t.clone().sub(camera.position).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    let pos = t.clone().addScaledVector(dir, -14);
    if (camera.position.distanceTo(t) > 700) { pos.set(60, 0, -175); t.set(0, 60, 0); }
    pos.y = app.terrain.heightAt(pos.x, pos.z);
    if (!app.world.fits(pos.x, pos.z, pos.y)) { pos.set(60, 0, -175); pos.y = app.terrain.heightAt(60, -175); t.set(0, 60, 0); }
    const yaw = Math.atan2(-(t.x - pos.x), -(t.z - pos.z));
    walk.enable(pos, yaw, 0);
    camera.near = 0.05; camera.updateProjectionMatrix();
    app.ui.toast(coarse ? 'Walk mode: joystick to move, drag to look' : 'Walk mode: W A S D to move, click to look around');
  } else {
    state.mode = mode;
    const wasInside = walk.inside;
    walk.disable();
    controls.enabled = true;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(fwd, 30);
    walk.inside = null;
    app.sky.setInterior(0);
    if (wasInside) setSection(true, { target: wasInside });
  }
  app.ui.syncMode(mode);
}

function enterWalkAt(p) {
  let pos, yaw = 0;
  if (p.walk?.local && p.pyr) {
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
  if (state.section) setSection(false);
  if (state.xray) setXray(false);
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
  sphinx.group.userData.setEra(era);
  stairs.mesh.visible = today;
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

function setXray(on) {
  if (on === state.xray) return;
  state.xray = on;
  if (on && state.section) setSection(false);
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

function setSection(on, opts = {}, moveCamera = true) {
  const { section } = app;
  if (on) {
    if (state.xray) setXray(false);
    if (state.mode === 'walk') setMode('orbit');
    const target = opts.target || section.target;
    const plane = opts.plane || section.plane;
    let offset = opts.offset;
    if (offset === undefined) offset = (opts.target || opts.plane || !state.section) ? section.defaultOffset(target, plane) : section.offset;
    section.set({ era: state.era, flip: opts.flip ?? section.flip, target, plane, offset });
    if (!state.section) section.setEnabled(true);
    state.section = true;
    if (moveCamera) {
      const vp = section.viewpoint();
      flyTo(new THREE.Vector3(...vp.pos), new THREE.Vector3(...vp.target));
    }
  } else if (state.section) {
    section.setEnabled(false);
    state.section = false;
  }
  for (const it of Object.values(app.interiors)) it.voidMeshes.forEach((v) => { v.visible = ((state.section && section.target === it.id) || state.xray) && state.showVoids; });
  app.ui.syncSection(state.section);
}
app.setSection = setSection;

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
function flyTo(pos, target, ms = 1600) {
  const from = { p: camera.position.clone(), t: controls.target.clone() };
  const dist = from.p.distanceTo(pos);
  fly = { from, to: { p: pos.clone(), t: target.clone() }, t0: performance.now(), ms: Math.min(2600, ms + dist * 0.4), arc: Math.min(400, dist * 0.18) };
  if (STILL) { camera.position.copy(pos); controls.target.copy(target); fly = null; controls.update(); }
}
app.flyTo = flyTo;
app.cancelFly = () => { fly = null; };
function flyHome() {
  if (state.mode === 'walk') setMode('orbit');
  if (state.section) setSection(false);
  flyTo(app.home.pos, app.home.target);
}

function viewFor(p) {
  const anchor = placeWorldPos(p);
  const v = p.view || { dist: 80, yaw: 30, pitch: 20 };
  const target = anchor.clone();
  if (v.ty) target.y += v.ty;
  const yaw = THREE.MathUtils.degToRad(v.yaw ?? 30), pitch = THREE.MathUtils.degToRad(v.pitch ?? 20);
  const pos = new THREE.Vector3(
    target.x + Math.sin(yaw) * Math.cos(pitch) * v.dist,
    target.y + Math.sin(pitch) * v.dist,
    target.z - Math.cos(yaw) * Math.cos(pitch) * v.dist,
  );
  if (v.look) target.set(...v.look);
  const gy = app.terrain.heightAt(pos.x, pos.z, false) + 3;
  if (pos.y < gy) pos.y = gy;
  return { pos, target };
}

function selectPlace(id, opts = {}) {
  const p = PLACES.find((q) => q.id === id);
  if (!p) return;
  state.selected = id;
  app.labels.select(id);
  app.ui.showInfo(p);
  if (opts.noMove) return;
  if (p.era && p.era !== state.era) setEra(p.era);
  if (state.mode === 'walk') {
    if (p.walk || !p.pyr || p.exterior) enterWalkAt(p);
    return;
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
    const d = (p.view && p.view.dist) || 30;
    const pos = plane === 'x'
      ? new THREE.Vector3(P.cx + offset + d, target.y + d * 0.2, target.z + d * 0.3)
      : new THREE.Vector3(target.x - d * 0.3, target.y + d * 0.2, P.cz + offset + d);
    if (opts.instant || STILL) { camera.position.copy(pos); controls.target.copy(target); controls.update(); }
    else flyTo(pos, target);
    return;
  }
  const { pos, target } = viewFor(p);
  if (opts.instant || STILL) { camera.position.copy(pos); controls.target.copy(target); controls.update(); }
  else flyTo(pos, target);
}

// ------------------------------------------------------------------- loop --
const clock = new THREE.Clock();
let envTimer = 0;
function startLoop() {
  let frames = 0;
  const loop = () => {
    const dt = Math.min(0.1, clock.getDelta());
    const now = performance.now();
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(fly.from.p, fly.to.p, e);
      camera.position.y += Math.sin(Math.PI * e) * fly.arc;
      controls.target.lerpVectors(fly.from.t, fly.to.t, e);
      if (t >= 1) fly = null;
    }
    let focus, radius;
    if (state.mode === 'walk') {
      app.walk.update(dt);
      focus = app.walk.feet; radius = 90;
      app.ui.setWhere(app.walk.inside ? PYRAMIDS[app.walk.inside].name : '');
    } else {
      controls.update();
      const minY = app.terrain.heightAt(camera.position.x, camera.position.z, false) + 1.2;
      if (camera.position.y < minY && !state.section) camera.position.y = minY;
      const dist = camera.position.distanceTo(controls.target);
      camera.near = THREE.MathUtils.clamp(dist * 0.0015, 0.08, 3);
      camera.updateProjectionMatrix();
      focus = controls.target; radius = Math.max(40, dist * 0.85);
    }
    app.sky.fitShadow(focus, radius);
    updateLights(dt);
    envTimer += dt;
    if (envTimer > 0.25) { envTimer = 0; app.sky.updateEnvironment(); }
    renderer.render(scene, camera);
    if (state.labels) app.labels.update(container.clientWidth, container.clientHeight);
    app.ui.updateCompass(camera);
    frames++;
    if (STILL && frames >= STILL) { renderer.setAnimationLoop(null); window.__stillDone = true; }
  };
  renderer.setAnimationLoop(loop);
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
  renderer.toneMappingExposure = 0.62 + adapt * 0.55;
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
      pl.intensity = c.l.i * (inside ? 9 : 45);
      pl.distance = c.l.d * (inside ? 1.6 : 2.5);
    } else pl.intensity = 0;
  });
  const torchOn = state.mode === 'walk' && (state.torch || (inside && state.era === 'built'));
  torch.intensity = torchOn ? (inside ? 60 : 20) : 0;
}

addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

init().catch((e) => {
  console.error(e);
  window.__error = String(e.stack || e);
  const m = document.getElementById('loadMsg');
  if (m) m.textContent = 'Something went wrong while building the scene: ' + e.message;
});
