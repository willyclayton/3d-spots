// The app shell shared by every spot: renderer, camera and the three ways to
// move (Explore, Fly, Walk), camera flights, places and labels, the cutaway
// and x-ray switches, the era switch, interior lighting and the frame loop.
//
// A spot subclasses SpotApp, passes its config to the constructor, builds its
// scene in build() and fills in the hooks below that concern its monuments.
//
// Config:
//   id                 storage-key prefix ('giza' -> 'giza-quality' ...)
//   site               { lat, lon, utcOffset, timeZone }
//   atmosphere         options for installAtmosphere
//   bounds             { x0, x1, z0, z1 } the explorable area (orbit centre stays inside)
//   fly                { margin, yMax } extra room for free flight
//   maxDistance        furthest orbit distance
//   views              { default, portrait, ...: [[pos], [target]] }  (?view=, Home, tour)
//   hour               default local time
//   places, groups     place list (see giza/js/data/places.js) and its groups
//   shortNames         { placeId: short map label }
//   section            { target, plane } default cutaway
//   eras               { today: { short, long }, built: { short, long } } UI names
//   walkFallback       [x, z] where to stand if the era change removes the floor
//   toggles            { name: default } extra on/off settings (data-toggle checkboxes)
//
// Cutaway tool (this.section), built by the site:
//   enabled, target, plane ('x' | 'z'), offset, flip, era    current cut
//   set({ era, flip, target, plane, offset })                 change it and rebuild
//   setEnabled(on)       clip the stone and show the cut faces (throws if the cut cannot be built)
//   update()             rebuild (after an era change)
//   defaultOffset(target, plane), range() -> [min, max] offset
//   viewpoint() -> { pos: [x, y, z], target: [x, y, z] }       a good view of the cut
//
// Places: interior places name the structure they are in (p.struct) and give
// p.local = [x, y, z] in that structure's frame (structFrame); exterior places
// give p.world = [x, y | null, z] (null: on the ground).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkySystem } from '../engine/sky.js';
import { LabelLayer } from '../engine/labels.js';
import { WalkController } from '../engine/walk.js';
import { FlyController } from '../engine/fly.js';
import { WalkWorld } from '../engine/walkworld.js';
import { installAtmosphere } from '../engine/atmosphere.js';
import { createUI } from './ui.js';
import { createTour } from './tour.js';

const $ = (id) => document.getElementById(id);

export class SpotApp {
  constructor(cfg) {
    this.cfg = cfg;
    installAtmosphere(cfg.atmosphere);
    const params = this.params = new URLSearchParams(location.search);
    this.coarse = matchMedia('(pointer: coarse)').matches;
    const storedQ = (() => { try { return localStorage.getItem(`${cfg.id}-quality`); } catch (e) { return null; } })();
    const quality = this.quality = params.get('q') || storedQ || (this.coarse || innerWidth < 900 ? 'medium' : 'high');
    this.STILL = parseInt(params.get('still') || '0', 10);
    this.places = cfg.places;
    this.groups = cfg.groups;

    const container = this.container = $('app');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      $('loadMsg').textContent = 'Sorry — this map needs WebGL, which is not available in this browser.';
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
    this.renderer = renderer;

    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.5, 40000);
    scene.add(camera);
    const controls = this.controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 1.15;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
    controls.minDistance = 2;
    controls.maxDistance = cfg.maxDistance ?? 4200;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = false;

    const { lat, lon, utcOffset, timeZone } = cfg.site;
    this.sky = new SkySystem(renderer, scene, { lat, lon, utcOffset, timeZone, shadowSize: quality === 'low' ? 2048 : 4096 });

    this.state = {
      mode: 'orbit', era: 'today', xray: false, section: false, labels: true, selected: null, torch: false,
      toggles: { ...(cfg.toggles || {}) },
    };
    this.fly = null;
    this.panKeys = new Set();
    this.lastErr = 0;
    window.__app = this;

    addEventListener('error', (ev) => this.reportError('Script', ev.error || ev.message));
    addEventListener('unhandledrejection', (ev) => this.reportError('Script', ev.reason));
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const log = (gl.getProgramInfoLog(program) || '') + ' ' + (gl.getShaderInfoLog(fs) || '') + ' ' + (gl.getShaderInfoLog(vs) || '');
      this.reportError('Graphics', log.trim() || 'shader failed to compile');
    };
    addEventListener('resize', () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      this.lastOffset = -1;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  // ---------------------------------------------------------- site hooks --
  // Build the scene. Must set this.terrain (heightAt(x, z, detail)), this.ground
  // (the ground mesh, for picking) and this.section (a cutaway tool: see
  // giza/js/section.js for the interface).
  async build(progress) { throw new Error('build() not implemented'); }   // eslint-disable-line no-unused-vars
  // resolves when everything slow (meshing in workers...) has finished; ?still waits for it
  stillReady() { return Promise.resolve(); }
  // walkable volumes, footprints and obstacles for an era
  configureWorld(world, era) {}                                    // eslint-disable-line no-unused-vars
  // origin { cx, baseY, cz } of a structure's local frame, and its name
  structFrame(id) { return { cx: 0, baseY: 0, cz: 0 }; }          // eslint-disable-line no-unused-vars
  structName(id) { return id; }
  // is an interior place visible in the current cutaway?
  interiorExposed(p) { return true; }                              // eslint-disable-line no-unused-vars
  // meshes that hide an interior's labels from a visitor walking inside
  interiorMeshes(id) { return []; }                                // eslint-disable-line no-unused-vars
  // is this point inside solid masonry (hides labels behind it)?
  solidAt(pt) { return false; }                                    // eslint-disable-line no-unused-vars
  // push an orbiting camera position out of solid masonry
  keepOutOfStone(p, margin = 1.5) {}                               // eslint-disable-line no-unused-vars
  // where to stand when switching to Walk near a structure (null: outdoors)
  walkSpawnNear() { return null; }
  // where to stand when there is nothing better
  walkDefault() { return { pos: new THREE.Vector3(0, this.terrain.heightAt(0, 0), 0), yaw: 0 }; }
  applyEra(era) {}                                                 // eslint-disable-line no-unused-vars
  applyXray(on) {}                                                 // eslint-disable-line no-unused-vars
  applyToggle(name, on) {}                                         // eslint-disable-line no-unused-vars
  onSectionChange() {}
  // open an interior place up (cutaway or x-ray) and return { pos, target } to view it from
  viewInterior(p) { return this.viewFor(p); }
  // what a double-click can land on
  pickables() { return [this.ground]; }
  // interior lamps near the visitor: [{ x, y, z, l: { i, d } }]
  lamps(inside) { return []; }                                     // eslint-disable-line no-unused-vars
  // are interiors electrically lit (otherwise the torch comes on inside)?
  interiorLit() { return true; }
  // how enclosed an interior is (0 open to the sky .. 1 dark inside): eye adaptation
  interiorDepth(inside) { return 1; }                              // eslint-disable-line no-unused-vars
  labelVisible(p) { return true; }                                 // eslint-disable-line no-unused-vars
  labelClass(p) { return ''; }                                     // eslint-disable-line no-unused-vars
  onFrame(dt) {}                                                   // eslint-disable-line no-unused-vars
  // the guided tour: return a list of stops (see shared/app/tour.js)
  tourStops(h) { return []; }                                      // eslint-disable-line no-unused-vars

  // --------------------------------------------------------------- start --
  progress(p, msg) { window.__setProgress?.(p, msg); }
  nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }

  async start() {
    try { await this.init(); } catch (e) {
      console.error(e);
      window.__error = String(e.stack || e);
      const m = $('loadMsg');
      if (m) m.textContent = 'Something went wrong while building the scene: ' + e.message;
    }
  }

  async init() {
    const { cfg, camera, controls, renderer, scene, state, params } = this;
    await this.build((p, msg) => this.progress(p, msg));

    // ---- walking and flying
    this.world = new WalkWorld(this.terrain);
    this.walk = new WalkController(camera, renderer.domElement, this.world, {
      joystickEl: $('joystick'),
      onLockChange: (locked) => this.ui?.setWalkHint(locked),
    });
    const B = cfg.bounds, m = cfg.fly?.margin ?? 600;
    this.flyer = new FlyController(camera, renderer.domElement, {
      groundAt: (x, z) => this.terrain.heightAt(x, z, false),
      limit: (p) => {
        const g = this.terrain.heightAt(p.x, p.z, false) + 2.5;
        if (p.y < g) p.y = g;
        if (!state.section && !state.xray) this.keepOutOfStone(p, 3);
      },
      joystickEl: $('joystick'),
      upEl: $('flyUp'), downEl: $('flyDown'),
      bounds: { x0: B.x0 - m, x1: B.x1 + m, z0: B.z0 - m, z1: B.z1 + m, yMax: cfg.fly?.yMax ?? 2600 },
    });
    this.setupWorld();

    // pooled point lights for interiors + a hand torch
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffe2b8, 0, 12, 2);
      scene.add(l); this.pool.push(l);
    }
    const torch = this.torch = new THREE.SpotLight(0xffc98a, 0, 40, 0.55, 0.6, 2);
    torch.position.set(0.15, -0.15, 0); torch.target.position.set(0, -0.2, -2);
    camera.add(torch, torch.target);
    const fill = this.fill = new THREE.PointLight(0xffe4bd, 0, 9, 1.4);
    fill.position.set(0, 0.25, 0.3);
    camera.add(fill);

    // ---- labels
    const reservedIds = ['toolbar', 'sectionBar', 'tour', 'info', 'compass', 'homeBtn', 'placesBtn', 'places', 'settings'];
    this.labels = new LabelLayer($('labels'), camera, {
      onSelect: (id) => this.selectPlace(id),
      reserved: () => {
        const out = [];
        const tb = document.querySelector('.topbar');
        if (tb) { const r = tb.getBoundingClientRect(); out.push({ left: r.left, right: r.left + Math.min(r.width, 330), top: r.top, bottom: r.bottom + 4 }); }
        for (const id of reservedIds) {
          const el = $(id);
          if (!el || el.classList.contains('hidden') || el.offsetParent === null) continue;
          const r = el.getBoundingClientRect();
          if (r.width && r.height) out.push(r);
        }
        return out;
      },
    });
    this.setupLabels();

    // ---- UI and tour
    const act = {
      setMode: (m, o) => this.setMode(m, o), setEra: (e) => this.setEra(e), setXray: (on, o) => this.setXray(on, o),
      setSection: (on, o, mc) => this.setSection(on, o, mc), setLabels: (on) => this.setLabels(on), setTime: (h) => this.setTime(h),
      selectPlace: (id, o) => this.selectPlace(id, o), flyHome: () => this.flyHome(), setToggle: (n, on) => this.setToggle(n, on),
      setTorch: (on) => this.setTorch(on),
    };
    this.ui = createUI(this, act);
    this.tour = createTour(this, this.tourStops(this.tourHelpers()));
    this.walk.onUserMove = () => this.tour.userInterrupt();
    this.flyer.onUserMove = () => this.tour.userInterrupt();
    this.setupMapNavigation();

    // ---- initial view
    const views = { ...cfg.views };
    // tall phone screens get their own overview
    if (camera.aspect < 0.8 && views.portrait) views.default = views.portrait;
    const [cp, ct] = views[params.get('view')] || views.default;
    camera.position.set(...cp); controls.target.set(...ct); controls.update();
    this.home = { pos: new THREE.Vector3(...views.default[0]), target: new THREE.Vector3(...views.default[1]) };
    this.setTime(params.has('t') ? parseFloat(params.get('t')) : (cfg.hour ?? 15.5));
    if (params.get('era') === 'built') this.setEra('built');
    if (params.get('xray')) this.setXray(true);
    if (params.get('section')) {
      const [tg, pl, off] = params.get('section').split(',');
      this.setSection(true, { target: tg || cfg.section?.target, plane: pl || cfg.section?.plane || 'x', offset: off !== undefined && off !== '' ? parseFloat(off) : undefined }, !params.get('view'));
    }
    if (params.get('place')) this.selectPlace(params.get('place'), { instant: true });
    if (params.get('walk')) {
      const p = this.placeById(params.get('walk'));
      if (p) this.enterWalkAt(p);
    }
    this.sky.updateEnvironment();
    this.progress(1, 'Ready');
    setTimeout(() => $('loading').classList.add('done'), 150);
    if (params.has('still')) await Promise.race([this.stillReady(), new Promise((r) => setTimeout(r, 90000))]);
    window.__ready = true;
    this.startLoop();
    if (params.has('tour')) this.tour.start(parseInt(params.get('tour'), 10) - 1 || 0);
    else this.ui.maybeShowWelcome();
  }

  setupWorld() { this.configureWorld(this.world, this.state.era); }

  // -------------------------------------------------------------- places --
  placeById(id) { return this.places.find((q) => q.id === id); }
  isInterior(p) { return !!p.struct && !p.exterior; }

  placeWorldPos(p, out = new THREE.Vector3()) {
    if (p.struct && p.local) {
      const F = this.structFrame(p.struct);
      return out.set(F.cx + p.local[0], F.baseY + p.local[1], F.cz + p.local[2]);
    }
    const [x, y, z] = p.world;
    return out.set(x, y === null ? this.terrain.heightAt(x, z) + 4 : y, z);
  }

  setupLabels() {
    const { labels, state, camera, cfg } = this;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    // outdoors: hidden behind the ground or solid masonry
    const occluded = (pos, cam) => {
      const d = pos.distanceTo(cam);
      const n = 40;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (d * (1 - t) < 8) break;
        tmp.lerpVectors(cam, pos, t);
        if (tmp.y < this.terrain.heightAt(tmp.x, tmp.z, false) - 1.5) return true;
        if (this.solidAt(tmp)) return true;
      }
      return false;
    };
    // walking inside: hidden behind the walls
    const ray = new THREE.Raycaster();
    const dirV = new THREE.Vector3();
    const insideBlocked = (p, pos, cam) => {
      if (state.mode !== 'walk') return false;
      const d = pos.distanceTo(cam);
      dirV.subVectors(pos, cam).divideScalar(d);
      ray.set(cam, dirV); ray.far = Math.max(0.1, d - 0.6);
      return ray.intersectObjects(this.interiorMeshes(p.struct), false).length > 0;
    };
    const short = cfg.shortNames || {};
    for (const p of this.places) {
      const interior = this.isInterior(p);
      const it = labels.add({
        id: p.id, text: p.name, short: short[p.id] || p.name.replace(/\s*\(.*\)\s*$/, ''), kind: p.kind, prio: p.prio,
        getPos: (out) => this.placeWorldPos(p, out),
        maxDist: p.prio === 1 ? 9000 : p.prio === 2 ? 1700 : 520,
        occlusion: interior ? (pos, cam) => insideBlocked(p, pos, cam) : occluded,
        visible: () => {
          if (p.era && p.era !== state.era) return false;
          if (!this.labelVisible(p)) return false;
          if (interior) {
            if (state.mode === 'walk') return this.walk.inside === p.struct && camera.position.distanceTo(this.placeWorldPos(p, tmp2)) < 30;
            if (state.xray) return true;
            if (state.section && this.section.target === p.struct) return this.interiorExposed(p);
            return false;
          }
          if (state.mode === 'walk' && this.walk.inside) return false;
          return true;
        },
      });
      const cls = this.labelClass(p);
      if (cls) it.el.classList.add(cls);
    }
  }

  // ------------------------------------------------------------- actions --
  setMode(mode, opts = {}) {
    const { state, walk, flyer, controls, camera } = this;
    if (mode === state.mode && !opts.force) return;
    const prev = state.mode;
    this.cancelFly();
    if (prev === 'fly' && mode !== 'fly') { flyer.disable(); this.aimAhead(); }
    if (mode === 'walk') {
      state.mode = mode;
      controls.enabled = false;
      if (state.section) this.setSection(false, { instant: true });
      if (state.xray) this.setXray(false, { instant: true });
      const sp = this.walkSpawn();
      walk.enable(sp.pos, sp.yaw, 0);
      camera.near = 0.05; camera.updateProjectionMatrix();
      this.ui.toast(sp.hint || (this.coarse ? 'Joystick to move, drag to look' : 'W A S D to move, click to look around'));
    } else if (mode === 'fly') {
      state.mode = mode;
      controls.enabled = false;
      if (prev === 'walk') {
        walk.disable(); walk.inside = null; this.sky.setInterior(0);
        camera.position.y += 30;              // take off from where you stood
      }
      flyer.enable();
      this.ui.toast(this.coarse ? 'Joystick to fly · drag to look · ▲▼ to climb' : 'W A S D to fly · Q / E down and up · drag to look · Shift faster');
    } else {
      state.mode = mode;
      controls.enabled = true;
      if (prev === 'walk') {
        const wasInside = walk.inside;
        walk.disable();
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        controls.target.copy(camera.position).addScaledVector(fwd, 30);
        walk.inside = null;
        this.sky.setInterior(0);
        if (wasInside) this.setSection(true, { target: wasInside });
      }
    }
    this.ui.syncMode(mode);
  }

  // After free flight, orbit about a point straight ahead (keeping the view
  // exactly as it is): where the line of sight meets the ground, or a few
  // hundred metres out if it never does.
  aimAhead() {
    const { camera, controls } = this;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const p = camera.position.clone();
    const h = Math.max(5, p.y - this.terrain.heightAt(p.x, p.z, false));
    const far = THREE.MathUtils.clamp(h * 3, 150, 1200);
    let d = far;
    const step = Math.max(2, h * 0.05);
    for (let s = step; s < far; s += step) {
      const q = p.clone().addScaledVector(fwd, s);
      if (q.y <= this.terrain.heightAt(q.x, q.z, false)) { d = s; break; }
    }
    controls.target.copy(p).addScaledVector(fwd, d);
    controls.update();
  }

  // Where to put the visitor when they switch to Walk.
  walkSpawn() {
    const near = this.walkSpawnNear();
    if (near) return near;
    // outdoors: stand where we were looking, facing the same way
    const { camera, controls } = this;
    const t = controls.target;
    const fwd = t.clone().sub(camera.position).setY(0);
    const yaw = fwd.lengthSq() > 1e-6 ? Math.atan2(-fwd.x, -fwd.z) : 0;
    if (camera.position.distanceTo(t) < 900) {
      for (let r = 0; r <= 60; r += 6) {
        for (let k = 0; k < (r ? 8 : 1); k++) {
          const a = (k / 8) * Math.PI * 2;
          const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
          const y = this.terrain.heightAt(x, z);
          if (this.world.fits(x, z, y)) return { pos: new THREE.Vector3(x, y, z), yaw };
        }
      }
    }
    return this.walkDefault();
  }

  enterWalkAt(p) {
    const { state, controls, camera } = this;
    let pos, yaw = 0;
    if (p.era && p.era !== state.era) this.setEra(p.era);   // e.g. a modern tunnel only exists today
    if (p._direct) { pos = p._direct.pos.clone(); yaw = p._direct.yaw; }
    else if (p.walk?.local && p.struct) {
      const F = this.structFrame(p.struct);
      pos = new THREE.Vector3(F.cx + p.walk.local[0], F.baseY + p.walk.local[1], F.cz + p.walk.local[2]);
      yaw = -THREE.MathUtils.degToRad(p.walk.yaw || 0);
    } else {
      const target = this.placeWorldPos(p);
      const view = p.view || { yaw: 0, dist: 40 };
      const a = THREE.MathUtils.degToRad(view.yaw || 0);
      const d = Math.min(Math.max((view.dist || 40) * 0.5, 18), 160);
      pos = new THREE.Vector3(target.x + Math.sin(a) * d, 0, target.z - Math.cos(a) * d);
      for (let k = 0; k < 14 && !this.world.fits(pos.x, pos.z, this.terrain.heightAt(pos.x, pos.z)); k++) {
        pos.x += Math.sin(a) * 6; pos.z -= Math.cos(a) * 6;
      }
      pos.y = this.terrain.heightAt(pos.x, pos.z);
      yaw = Math.atan2(-(target.x - pos.x), -(target.z - pos.z));
    }
    this.cancelFly();
    if (state.mode === 'fly') this.flyer.disable();
    if (state.section) this.setSection(false, { instant: true });
    if (state.xray) this.setXray(false, { instant: true });
    this.cancelFly();
    if (state.mode !== 'walk') {
      state.mode = 'walk'; controls.enabled = false; this.ui.syncMode('walk');
      camera.near = 0.05; camera.updateProjectionMatrix();
    }
    this.walk.enable(pos, yaw, 0);
  }

  // walk from a world position, facing yawDeg (0 = north, 90 = west...)
  walkFrom(pos, yawDeg) {
    pos.y = this.terrain.heightAt(pos.x, pos.z);
    this.enterWalkAt({ walk: null, world: [pos.x, pos.y, pos.z], view: { yaw: 0, dist: 0 }, _direct: { pos, yaw: -THREE.MathUtils.degToRad(yawDeg) } });
  }

  setEra(era) {
    const { state } = this;
    if (era === state.era) return;
    state.era = era;
    this.applyEra(era);
    if (this.section) {
      this.section.era = era;
      if (state.section) this.section.update();
    }
    if (state.xray) this.applyXray(true);
    this.setupWorld();
    if (state.mode === 'walk' && !this.world.resolve(this.walk.feet, 0, 0)) {
      const [x, z] = this.cfg.walkFallback || [0, 0];
      this.walk.enable(new THREE.Vector3(x, this.terrain.heightAt(x, z), z), this.walk.yaw, 0);
    }
    this.ui.syncEra(era);
  }

  setXray(on, { instant = false } = {}) {
    const { state, controls } = this;
    if (on === state.xray) return;
    state.xray = on;
    if (on && state.section) this.setSection(false);
    if (!on && !state.section && !instant && state.mode === 'orbit') { const exit = this.exitPoint(); if (exit) this.flyTo(exit, controls.target.clone(), 1100); }
    this.applyXray(on);
    this.ui.syncXray(on);
  }

  // Where to put the camera so that it is clear of the stone: straight back
  // along the line of sight from wherever it is now. null if already outside.
  exitPoint() {
    const { camera, controls } = this;
    const q = camera.position.clone();
    this.keepOutOfStone(q);
    if (q.distanceToSquared(camera.position) < 0.01) return null;
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.y < 0.15) { dir.y = 0.15; dir.normalize(); }
    const p = camera.position.clone(), t = new THREE.Vector3();
    for (let i = 0; i < 300; i++) {
      p.addScaledVector(dir, 2);
      this.keepOutOfStone(t.copy(p), 6);
      if (t.distanceToSquared(p) < 1e-4) return p.addScaledVector(dir, 70 * this.fitScale());   // and far enough to see it
    }
    return q;
  }

  setSection(on, opts = {}, moveCamera = true) {
    const { section, state, controls } = this;
    let flyP = Promise.resolve();
    if (on) {
      if (state.xray) this.setXray(false);
      if (state.mode === 'walk') this.setMode('orbit');
      const target = opts.target || section.target;
      const plane = opts.plane || section.plane;
      let offset = opts.offset;
      if (offset === undefined) offset = (opts.target || opts.plane || !state.section) ? section.defaultOffset(target, plane) : section.offset;
      try {
        section.set({ era: state.era, flip: opts.flip ?? section.flip, target, plane, offset });
        if (!section.enabled) section.setEnabled(true);
      } catch (e) {
        this.reportError('Cutaway', e);
        state.section = false;
        if (section.enabled) section.setEnabled(false);
        this.ui.syncSection(false);
        return flyP;
      }
      state.section = true;
      if (moveCamera) {
        const vp = section.viewpoint();
        const tgt = new THREE.Vector3(...vp.target);
        const pos = new THREE.Vector3(...vp.pos).sub(tgt).multiplyScalar(this.fitScale()).add(tgt);
        flyP = this.flyTo(pos, tgt);
      }
    } else if (state.section) {
      state.section = false;
      // Cut views often put the camera where the removed half of the stone
      // would be. Back out of it first, with the cut still showing, and only
      // close the stone once the camera is outside.
      const exit = !state.xray && !opts.instant && state.mode === 'orbit' ? this.exitPoint() : null;
      if (exit) {
        flyP = this.flyTo(exit, controls.target.clone(), 1100, { free: true });
        flyP.then(() => { if (!state.section) section.setEnabled(false); this.onSectionChange(); });
      } else section.setEnabled(false);
    }
    this.onSectionChange();
    this.ui.syncSection(state.section);
    return flyP;
  }

  setLabels(on) { this.state.labels = on; this.labels.setEnabled(on); this.ui.syncLabels(on); }
  setToggle(name, on) { this.state.toggles[name] = on; this.applyToggle(name, on); }
  setTorch(on) { this.state.torch = on; this.ui.toast(on ? 'Torch on' : 'Torch off'); }
  setTime(h) { this.sky.setLocalTime(h); this.ui?.syncTime(h); }

  // -------------------------------------------------------- camera moves --
  flyTo(pos, target, ms = 1600, { free = false } = {}) {
    const { camera, controls } = this;
    if (this.fly) this.fly.done();
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
      this.fly = { t0, t1, o0, o1, dTheta, bump, ms: dur, start: performance.now(), free, done: resolve };
      if (this.STILL) { camera.position.copy(pos); controls.target.copy(target); this.fly = null; controls.update(); resolve(); }
    });
  }

  stepFly(now) {
    const { camera, controls } = this;
    const f = this.fly;
    const t = Math.min(1, (now - f.start) / f.ms);
    const e = t * t * t * (t * (t * 6 - 15) + 10);                    // smootherstep
    controls.target.lerpVectors(f.t0, f.t1, e);
    const r = Math.exp(THREE.MathUtils.lerp(Math.log(f.o0.radius), Math.log(f.o1.radius), e)) * (1 + f.bump * Math.sin(Math.PI * e));
    const phi = THREE.MathUtils.clamp(THREE.MathUtils.lerp(f.o0.phi, f.o1.phi, e) - Math.min(0.35, f.bump * 0.4) * Math.sin(Math.PI * e), 0.02, Math.PI - 0.02);
    this._sph = this._sph || new THREE.Spherical();
    this._sph.set(r, phi, f.o0.theta + f.dTheta * e);
    camera.position.setFromSpherical(this._sph).add(controls.target);
    camera.lookAt(controls.target);
    if (t >= 1) { this.fly = null; f.done(); }
  }

  cancelFly() { if (this.fly) { this.fly.done(); this.fly = null; } }

  // On phones a tall portrait view sees little sideways: back off so the subject fits.
  fitScale() { return Math.max(1, 0.9 / Math.max(0.2, this.camera.aspect)); }

  // fly to one of the config's named views (portrait screens get the portrait one)
  flyToView(name) {
    const v = this.cfg.views;
    const [p, t] = (this.camera.aspect < 0.8 && v.portrait) ? v.portrait : v[name];
    return this.flyTo(new THREE.Vector3(...p), new THREE.Vector3(...t));
  }

  flyHome() {
    const { state } = this;
    if (state.mode !== 'orbit') this.setMode('orbit');
    if (state.section) this.setSection(false, { instant: true });
    if (state.xray) this.setXray(false, { instant: true });
    this.ui.hideInfo();
    const portrait = this.camera.aspect < 0.8 && this.cfg.views.portrait;
    const [p, t] = portrait ? this.cfg.views.portrait : [this.home.pos.toArray(), this.home.target.toArray()];
    this.flyTo(new THREE.Vector3(...p), new THREE.Vector3(...t));
  }

  viewFor(p) {
    const anchor = this.placeWorldPos(p);
    const v = p.view || { dist: 80, yaw: 30, pitch: 20 };
    const target = anchor.clone();
    if (v.ty) target.y += v.ty;
    const yaw = THREE.MathUtils.degToRad(v.yaw ?? 30), pitch = THREE.MathUtils.degToRad(v.pitch ?? 20);
    const dist = v.dist * (v.look ? 1 : this.fitScale());
    const pos = new THREE.Vector3(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z - Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    if (v.look) {
      target.set(...v.look);
      // narrow screens: step back along the line of sight so the whole scene fits
      const k = Math.min(1.7, this.fitScale() * 0.85);
      if (k > 1) pos.sub(target).multiplyScalar(k).add(target);
    }
    const gy = this.terrain.heightAt(pos.x, pos.z, false) + 3;
    if (pos.y < gy) pos.y = gy;
    return { pos, target };
  }

  selectPlace(id, opts = {}) {
    const { state, camera, controls } = this;
    const p = this.placeById(id);
    if (!p) return Promise.resolve();
    state.selected = id;
    this.labels.select(id);
    if (!opts.silent) this.ui.showInfo(p);
    if (opts.noMove) return Promise.resolve();
    if (this.tour?.active && !opts.silent) this.tour.stop();
    if (p.era && p.era !== state.era) this.setEra(p.era);
    if (state.mode === 'fly') this.setMode('orbit');
    const interior = this.isInterior(p);
    if (state.mode === 'walk') {
      if (p.walk || !interior) this.enterWalkAt(p);
      return Promise.resolve();
    }
    if (!interior) {
      if (state.section) this.setSection(false, { instant: true });
      if (state.xray) this.setXray(false, { instant: true });
    }
    const { pos, target } = interior ? this.viewInterior(p) : this.viewFor(p);
    if (opts.instant || this.STILL) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return Promise.resolve(); }
    return this.flyTo(pos, target);
  }

  // ------------------------------------------------------- tour helpers --
  tourHelpers() {
    const app = this;
    return {
      // show a place (opening a cutaway for interior places)
      place: (id) => async () => {
        const p = app.placeById(id);
        if (app.state.mode !== 'orbit') app.setMode('orbit');
        if (!app.isInterior(p)) { app.setSection(false); app.setXray(false); }
        await app.selectPlace(id, { silent: true });
      },
      // fly to a named view from the config, optionally in another era
      view: (name, opts = {}) => async () => {
        if (app.state.mode !== 'orbit') app.setMode('orbit');
        app.setSection(false); app.setXray(false);
        if (opts.era) app.setEra(opts.era);
        await app.flyToView(name);
      },
      // walk a route: start (world Vector3), facing yawDeg, through world points
      walkPath: (start, yawDeg, pts, { speed = 3.0, era } = {}) => async () => {
        app.setSection(false); app.setXray(false);
        if (era && app.state.era !== era) app.setEra(era);
        const s = start;
        if (app.state.mode !== 'walk' || app.walk.feet.distanceTo(new THREE.Vector3(s.x, app.walk.feet.y, s.z)) > 3) {
          app.walkFrom(s.clone(), yawDeg);
        }
        await app.walk.autoWalk(pts, { speed });
      },
      cutaway: (opts) => async () => {
        if (app.state.mode !== 'orbit') app.setMode('orbit');
        await app.setSection(true, opts);
      },
    };
  }

  // ------------------------------------------------------ map navigation --
  // Keep the orbit centre on the map, pan with the keyboard, and double-click
  // (or double-tap) anywhere to fly there.
  clampTarget() {
    const { controls, camera, cfg } = this;
    const B = cfg.bounds;
    const t = controls.target;
    const x = THREE.MathUtils.clamp(t.x, B.x0, B.x1), z = THREE.MathUtils.clamp(t.z, B.z0, B.z1);
    if (x !== t.x || z !== t.z) { camera.position.x += x - t.x; camera.position.z += z - t.z; t.x = x; t.z = z; }
    const g = this.terrain.heightAt(t.x, t.z, false);
    const y = THREE.MathUtils.clamp(t.y, g - 60, g + 320);
    if (y !== t.y) t.y += (y - t.y) * 0.15;      // ease, never jolt the camera
  }

  panByKeys(dt) {
    const { panKeys, controls, camera } = this;
    if (!panKeys.size || !controls.enabled) return;
    let f = 0, r = 0;
    if (panKeys.has('KeyW') || panKeys.has('ArrowUp')) f += 1;
    if (panKeys.has('KeyS') || panKeys.has('ArrowDown')) f -= 1;
    if (panKeys.has('KeyA') || panKeys.has('ArrowLeft')) r -= 1;
    if (panKeys.has('KeyD') || panKeys.has('ArrowRight')) r += 1;
    if (!f && !r) return;
    this.cancelFly();
    const fwd = new THREE.Vector3().copy(controls.target).sub(camera.position); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const k = camera.position.distanceTo(controls.target) * 0.9 * dt;
    const d = fwd.multiplyScalar(f * k).addScaledVector(right, r * k);
    controls.target.add(d); camera.position.add(d);
  }

  setupMapNavigation() {
    const { renderer, state, panKeys, camera, controls } = this;
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
      const hit = ray.intersectObjects(this.pickables(), true).find((h) => h.object.visible);
      if (!hit) return;
      const off = camera.position.clone().sub(controls.target);
      const d = THREE.MathUtils.clamp(off.length() * 0.55, 30, 900);
      off.setLength(d);
      const pos = hit.point.clone().add(off);
      const gy = this.terrain.heightAt(pos.x, pos.z, false) + 3;
      if (pos.y < gy) pos.y = gy;
      this.flyTo(pos, hit.point);
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
  reportError(where, e) {
    console.error(where, e);
    const now = performance.now();
    if (now - this.lastErr < 4000 || !this.ui) return;
    this.lastErr = now;
    const msg = String((e && (e.message || e.reason?.message || e.reason)) || e || 'unknown').slice(0, 140);
    this.ui.toast(`${where} problem: ${msg}`);
  }

  // ---------------------------------------------------------------- loop --
  startLoop() {
    const { renderer, scene, camera, controls, state, container } = this;
    const clock = new THREE.Clock();
    const _fwd = new THREE.Vector3(), _focus = new THREE.Vector3();
    let envTimer = 0, frames = 0;
    const loop = () => {
      const dt = Math.min(0.1, clock.getDelta());
      const now = performance.now();
      const fly = this.fly;
      if (fly && state.mode === 'orbit') this.stepFly(now);
      // never leave the stone sliced open while the cutaway is off
      if (this.section && this.section.enabled !== state.section && !this.fly?.free) {
        if (!state.section) { this.section.setEnabled(false); this.ui.syncSection(false); } else this.setSection(true);
      }
      let focus, radius;
      if (state.mode === 'walk') {
        this.walk.update(dt);
        focus = this.walk.feet; radius = 90;
        this.ui.setWhere(this.walk.inside ? this.structName(this.walk.inside) : '');
      } else if (state.mode === 'fly') {
        this.flyer.update(dt);
        const h = Math.max(2, this.flyer.height());
        camera.near = THREE.MathUtils.clamp(h * 0.004, 0.1, 2.5);
        camera.updateProjectionMatrix();
        const fwd = _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
        focus = _focus.copy(camera.position).addScaledVector(fwd, Math.min(h * 2, 400));
        focus.y = this.terrain.heightAt(focus.x, focus.z, false);
        radius = THREE.MathUtils.clamp(h * 1.6, 70, 900);
        this.ui.setWhere(`${Math.round(h)} m up`);
      } else {
        this.panByKeys(dt);
        if (!this.fly) this.clampTarget();
        controls.update();
        const minY = this.terrain.heightAt(camera.position.x, camera.position.z, false) + 1.2;
        if (camera.position.y < minY && !state.section) camera.position.y = minY;
        if (!state.section && !state.xray && !this.fly?.free) this.keepOutOfStone(camera.position);
        const dist = camera.position.distanceTo(controls.target);
        camera.near = THREE.MathUtils.clamp(dist * 0.0015, 0.08, 3);
        camera.updateProjectionMatrix();
        focus = controls.target; radius = Math.max(40, dist * 0.85);
      }
      this.sky.fitShadow(focus, radius);
      this.tour.tick(dt);
      this.onFrame(dt);
      this.applyViewOffset(this.STILL ? 1 : dt);
      this.updateLights(dt);
      envTimer += dt;
      if (envTimer > 0.25) { envTimer = 0; this.sky.updateEnvironment(); }
      renderer.render(scene, camera);
      if (state.labels) this.labels.update(container.clientWidth, container.clientHeight, dt);
      this.ui.updateCompass(camera);
      frames++;
      if (this.STILL && frames >= this.STILL) { renderer.setAnimationLoop(null); window.__stillDone = true; }
    };
    renderer.setAnimationLoop(loop);
    this.step = loop;   // one frame on demand (used by automated tests)
  }

  // On phones, keep the subject in the part of the screen not covered by the
  // bottom sheet (place details or the tour card).
  applyViewOffset(dt = 1) {
    const { camera, container, state } = this;
    const cover = state.mode === 'orbit' || this.tour?.active ? this.ui.bottomCover() : 0;
    const k = cover * 0.5;
    this.offCur = this.offCur ?? 0;
    this.offCur += (k - this.offCur) * Math.min(1, dt * 7);
    if (Math.abs(this.offCur - k) < 0.5) this.offCur = k;
    const o = Math.round(this.offCur);
    if (o === (this.lastOffset ?? 0)) return;
    this.lastOffset = o;
    const w = container.clientWidth, h = container.clientHeight;
    if (o > 0) camera.setViewOffset(w, h, 0, o, w, h);
    else camera.clearViewOffset();
  }

  // interior lamps, torch and eye adaptation
  updateLights(dt) {
    const { pool, walk, torch, sky, state, camera, controls, renderer } = this;
    const inside = state.mode === 'walk' && walk.inside;
    const want = inside ? this.interiorDepth(inside) : 0;
    this.adapt = this.adapt ?? 0;
    this.adapt += (want - this.adapt) * Math.min(1, dt * 2.5);
    if (this.STILL) this.adapt = want;
    const adapt = this.adapt;
    sky.setInterior(adapt * 0.97);
    renderer.toneMappingExposure = 0.62 + adapt * 0.75;
    const ref = state.mode === 'walk' ? camera.position : controls.target;
    const lamps = this.lamps(inside);
    for (const c of lamps) c.d = Math.hypot(c.x - ref.x, c.y - ref.y, c.z - ref.z);
    lamps.sort((a, b) => a.d - b.d);
    pool.forEach((pl, i) => {
      const c = lamps[i];
      if (c && c.d < 80) {
        pl.position.set(c.x, c.y, c.z);
        pl.intensity = c.l.i * (inside ? 20 : 22);
        pl.distance = c.l.d * (inside ? 2.2 : 2.5);
      } else pl.intensity = 0;
    });
    const lit = this.interiorLit();
    const torchOn = state.mode === 'walk' && (state.torch || (inside && !lit));
    torch.intensity = torchOn ? (inside ? 60 : 20) : 0;
    // soft light around the visitor so no passage is pitch black
    this.fill.intensity = inside ? (lit ? 5 : 2.5) * adapt : 0;
  }
}
