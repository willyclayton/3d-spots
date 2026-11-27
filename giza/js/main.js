// Giza: the site's scene and the hooks the shared app shell needs for it
// (see shared/app/shell.js for everything common to all spots).
import * as THREE from 'three';
import { SpotApp } from '../../shared/app/shell.js';
import { SITE, PYRAMIDS, SMALL_PYRAMIDS, SPHINX } from './data/site.js';
import { PLACES, GROUPS } from './data/places.js';
import { loadTextures } from './materials.js';
import { Terrain } from './terrain.js';
import { buildPyramids, buildRubble } from './pyramids.js';
import { buildInteriors } from './interiors/index.js';
import { buildComplex } from './complex.js';
import { loadSphinx } from './sphinx.js';
import { SectionTool } from './section.js';
import { profileRangeAt } from './interiors/build.js';
import { buildScatter, buildPalms } from './scatter.js';
import { gizaTour } from './tour.js';

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

const CONFIG = {
  id: 'giza', name: 'Giza',
  site: { lat: SITE.lat, lon: SITE.lon, utcOffset: SITE.utcOffset, timeZone: SITE.timeZone },
  atmosphere: { groundY: -45, scaleHeight: 320 },
  // the explorable area (world metres): plateau, valley temples, town edge
  bounds: { x0: -1700, x1: 1500, z0: -1300, z1: 2000 },
  fly: { margin: 600, yMax: 2600 },
  maxDistance: 4200,
  hour: 15.6,
  views: {
    default: [[760, 230, 1180], [-230, 25, 330]],
    khufu: [[160, 40, -330], [0, 40, 0]],
    entrance: [[30, 22, -140], [7, 15, -100]],
    sw: [[-700, 60, 560], [-340, 50, 340]],
    sphinx: [[430, -25, 470], [330, -30, 434]],
    panorama: [[-660, 92, 1345], [-330, 55, 420]],
    close: [[-420, 14, 470], [-380, 10, 448]],
    north: [[25, 3.5, -150], [0, 25, -110]],
    hero: [[620, 260, 760], [-170, 20, 280]],
    // tall phone screens: look up the line of pyramids from the south-west instead
    portrait: [[-820, 560, 1080], [-300, 15, 380]],
  },
  places: PLACES, groups: GROUPS, shortNames: SHORT,
  section: { target: 'khufu', plane: 'x' },
  eras: { today: { short: 'Today', long: 'Today' }, built: { short: '2560 BCE', long: 'As built, c. 2560 BCE' } },
  walkFallback: [60, -175],
  toggles: { voids: true, city: true },
};

// Pyramids, solid up to their present (or original) height: the orbiting
// camera is kept out of them.
const SOLIDS = [...Object.values(PYRAMIDS), ...SMALL_PYRAMIDS];

class Giza extends SpotApp {
  constructor() {
    super(CONFIG);
    this.xrayCache = new Map();
    this.elements = new Map();
  }

  async build(progress) {
    const { scene, renderer, quality } = this;
    progress(0.04, 'Loading textures');
    await loadTextures(new THREE.LoadingManager(), renderer, 'textures/');
    progress(0.16, 'Reading SRTM elevation data');
    const terrain = new Terrain();
    await terrain.load('data/terrain.png');
    terrain.buildMasks();
    progress(0.24, 'Shaping the plateau'); await this.nextFrame();
    const t = terrain.build(quality);
    const tmat = terrain.material();
    const ground = new THREE.Mesh(t.geometry, tmat); ground.receiveShadow = true; ground.name = 'terrain';
    const skirt = new THREE.Mesh(t.skirt, tmat); skirt.name = 'terrain-skirt';
    scene.add(ground, skirt);

    progress(0.36, 'Setting 2.3 million blocks'); await this.nextFrame();
    const pyr = buildPyramids({ quality });
    for (const g of Object.values(pyr.groups)) scene.add(g.group);
    scene.add(pyr.smallGroup, pyr.smallBuilt);
    const rubble = buildRubble(pyr.info, terrain, { quality });
    scene.add(rubble);

    progress(0.55, 'Carving chambers and passages'); await this.nextFrame();
    const interiors = buildInteriors(pyr.info);
    for (const it of Object.values(interiors)) scene.add(it.group);

    progress(0.66, 'Raising temples and tombs'); await this.nextFrame();
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

    progress(0.72, 'Scattering stones and palms'); await this.nextFrame();
    const blocked = complex.obstacles.today.concat(Object.values(pyr.info).map(({ P, half }) => ({ x0: P.cx - half, x1: P.cx + half, z0: P.cz - half, z1: P.cz + half })),
      pyr.small.map((sp) => ({ x0: sp.sp.cx - sp.half, x1: sp.sp.cx + sp.half, z0: sp.sp.cz - sp.half, z1: sp.sp.cz + sp.half })));
    const scatter = buildScatter(terrain, { blocked, ruins: complex.obstacles.today, quality });
    const palms = buildPalms(terrain, { quality });
    scene.add(scatter, palms.today, palms.built);

    progress(0.74, 'Carving the Sphinx'); await this.nextFrame();
    const sphinx = loadSphinx(quality);
    scene.add(sphinx.group);
    sphinx.group.userData.setEra('today');

    // modern visitor stairs: Khufu (al-Ma'mun's tunnel) and Menkaure
    const stairs = [this.buildStairs(pyr.info.khufu, 'robbers'), this.buildStairs(pyr.info.menkaure, 'entr')];
    stairs.forEach((st) => scene.add(st.mesh));

    Object.assign(this, { terrain, ground, skirt, pyr, rubble, interiors, complex, sphinx, stairs, scatter, palms });
    this.section = new SectionTool({ scene, pyr, interiors, terrain });

    // outlines used to hide labels behind the pyramids
    this.hullsSolid = Object.values(pyr.info).map(({ P, half, tanA }) => ({ P, half, tanA, H: P.heightNow }));
    for (const sp of pyr.small) this.hullsSolid.push({ P: { cx: sp.sp.cx, cz: sp.sp.cz, baseY: sp.sp.baseY }, half: sp.half, tanA: sp.tanA, H: sp.sp.heightNow });
  }

  stillReady() { return this.sphinx.ready; }

  // ------------------------------------------------------------ walking --
  configureWorld(world, era) {
    const { interiors, pyr, complex } = this;
    // the rooms and passages inside the pyramids, from their prism profiles
    const vols = [];
    for (const it of Object.values(interiors)) {
      const P = it.P;
      for (const v of it.eras[era].walk) {
        const o = { id: v.el.id, inside: it.id, axis: v.axis, stack: v.el.stack, base: P.baseY };
        if (v.axis === 'x') {
          o.x0 = P.cx + v.a0; o.x1 = P.cx + v.a1; o.z0 = P.cz + v.smin; o.z1 = P.cz + v.smax;
          o.range = (x, z) => profileRangeAt(v.profile, z - P.cz);
        } else {
          o.z0 = P.cz + v.a0; o.z1 = P.cz + v.a1; o.x0 = P.cx + v.smin; o.x1 = P.cx + v.smax;
          o.range = (x, z) => profileRangeAt(v.profile, x - P.cx);
        }
        vols.push(o);
      }
    }
    world.setVolumes(vols);
    if (era === 'today') this.stairs.forEach((st) => world.addVolume(st.volume));
    world.footprints = Object.values(pyr.info).map(({ P, S }) => ({ x0: P.cx - S[0] - 0.3, x1: P.cx + S[0] + 0.3, z0: P.cz - S[0] - 0.3, z1: P.cz + S[0] + 0.3 }));
    for (const s of pyr.small) world.footprints.push({ x0: s.sp.cx - s.half, x1: s.sp.cx + s.half, z0: s.sp.cz - s.half, z1: s.sp.cz + s.half });
    world.obstacles = complex.obstacles[era].slice();
    // the Sphinx body and paws
    world.obstacles.push({ x0: SPHINX.cx - 37, x1: SPHINX.cx + 22, z0: SPHINX.cz - 7.5, z1: SPHINX.cz + 7.5 });
    world.obstacles.push({ x0: SPHINX.cx + 22, x1: SPHINX.cx + 37, z0: SPHINX.cz - 6.4, z1: SPHINX.cz - 2.4 });
    world.obstacles.push({ x0: SPHINX.cx + 22, x1: SPHINX.cx + 37, z0: SPHINX.cz + 2.4, z1: SPHINX.cz + 6.4 });
  }

  // modern stair and landing up the north face to an entrance
  buildStairs(info, entId) {
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
      id: 'stairs', inside: null, x0, x1, z0: zStart, z1: zTop + 0.05, base: 0,
      range: (x, z) => {
        const f = Math.min(1, Math.max(0, (z - zStart) / (zTop - 3 - zStart)));
        return [P.baseY + f * (yTop - P.baseY), 1e4];
      },
    };
    return { mesh: g, volume };
  }

  // Where to put the visitor when they switch to Walk next to a pyramid.
  walkSpawnNear() {
    const { state, controls, camera } = this;
    const face = (pos, tx, tz) => Math.atan2(-(tx - pos.x), -(tz - pos.z));
    // which pyramid is the visitor looking at (or inside)?
    let pid = null;
    if (state.section) pid = this.section.target;
    const sel = this.placeById(state.selected);
    if (!pid && sel?.struct && !sel.exterior) pid = sel.struct;
    if (!pid) {
      for (const { P, half } of Object.values(this.pyr.info)) {
        const t = controls.target;
        if (Math.abs(t.x - P.cx) < half + 10 && Math.abs(t.z - P.cz) < half + 10 && camera.position.distanceTo(t) < 900) pid = P.id;
      }
    }
    if (!pid) return null;
    const P = PYRAMIDS[pid];
    const spots = {
      khufu: [this.pyr.info.khufu.ents.find((e) => e.id === 'robbers').u, -133],
      khafre: [6.0, -122],
      menkaure: [0, -70],
    };
    const [lx, lz] = spots[pid];
    const pos = this.groundAt(P.cx + lx, P.cz + lz);
    const hint = state.era === 'built'
      ? 'In 2560 BCE the entrances were sealed: open Places to jump inside'
      : pid === 'khafre' ? 'The lower entrance is the opening in the pavement ahead'
        : 'Walk up the stairs ahead into the pyramid';
    return { pos, yaw: face(pos, P.cx + lx, P.cz), hint };
  }

  // south of the Great Pyramid, looking north-west at Khufu and Khafre
  walkDefault() {
    const pos = this.groundAt(70, 300);
    return { pos, yaw: Math.atan2(-(-150 - pos.x), -(120 - pos.z)), hint: 'Tip: open Places and choose “Walk here” to go inside a pyramid' };
  }

  groundAt(x, z) { return new THREE.Vector3(x, this.terrain.heightAt(x, z), z); }

  // -------------------------------------------------------- structures --
  structFrame(id) { return PYRAMIDS[id]; }
  structName(id) { return PYRAMIDS[id].name; }
  interiorMeshes(id) { return this.interiors[id].eras[this.state.era].meshes; }

  // which prism contains an interior place (to know whether a cut exposes it)
  elementAt(p) {
    if (this.elements.has(p.id)) return this.elements.get(p.id);
    const it = this.interiors[p.struct];
    const [x, y, z] = p.local;
    let found = null;
    for (const el of it.def.elements) {
      const s = el.axis === 'x' ? z : x, a = el.axis === 'x' ? x : z;
      if (a < el.a0 - 0.6 || a > el.a1 + 0.6) continue;
      const r = profileRangeAt(el.profile, s);
      if (!r || y < r[0] - 1.5 || y > r[1] + 1.5) continue;
      found = el; break;
    }
    this.elements.set(p.id, found);
    return found;
  }

  cutExposes(el, sec) {
    if (!el) return false;
    if (el.axis === sec.plane) return sec.offset > el.a0 - 0.4 && sec.offset < el.a1 + 0.4;
    let lo = Infinity, hi = -Infinity;
    el.profile.forEach(([s]) => { lo = Math.min(lo, s); hi = Math.max(hi, s); });
    return sec.offset > lo - 0.4 && sec.offset < hi + 0.4;
  }

  interiorExposed(p) { return p.void ? true : this.cutExposes(this.elementAt(p), this.section); }

  solidAt(pt) {
    for (const h of this.hullsSolid) {
      const y = pt.y - h.P.baseY;
      if (y < 0 || y > h.H) continue;
      const r = h.half - y / h.tanA - 1.5;
      if (Math.abs(pt.x - h.P.cx) < r && Math.abs(pt.z - h.P.cz) < r) return true;
    }
    return false;
  }

  labelVisible(p) { return !(p.void && !this.state.toggles.voids); }
  labelClass(p) { return p.void ? 'void' : ''; }

  // Keep the orbiting camera out of the solid pyramids. Orbiting about a point
  // on a face (an entrance, say) would otherwise swing it inside the stone,
  // where every block is seen from behind and the pyramid looks hollow. Not
  // applied in cutaway or x-ray, where looking from inside is the point.
  keepOutOfStone(p, margin = 1.5) {
    for (let pass = 0; pass < 2; pass++) {
      for (const P of SOLIDS) {
        const s = Math.sin(P.slope), c = Math.cos(P.slope), t = Math.tan(P.slope), hb = P.base / 2;
        const full = hb * t;
        const H = this.state.era === 'built' ? (P.heightOrig ?? full) : (P.heightNow ?? full);
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

  // Open the pyramid so an interior place can be seen, and say where to look from.
  viewInterior(p) {
    const P = PYRAMIDS[p.struct];
    const plane = p.section?.plane || 'x';
    let offset = p.section?.offset;
    if (offset === undefined) {
      const el = this.elementAt(p);
      const def = this.section.defaultOffset(p.struct, plane);
      offset = !el || this.cutExposes(el, { plane, offset: def }) ? def : (plane === 'x' ? p.local[0] : p.local[2]);
    }
    if (p.void && !this.state.section) this.setXray(true);
    else if (!p.void) this.setSection(true, { target: p.struct, plane, offset, flip: false }, false);
    const target = this.placeWorldPos(p);
    const d = ((p.view && p.view.dist) || 30) * this.fitScale();
    const pos = plane === 'x'
      ? new THREE.Vector3(P.cx + offset + d, target.y + d * 0.2, target.z + d * 0.3)
      : new THREE.Vector3(target.x - d * 0.3, target.y + d * 0.2, P.cz + offset + d);
    return { pos, target };
  }

  pickables() {
    return [this.ground, ...Object.values(this.pyr.groups).map((g) => g.group), this.pyr.smallGroup, this.pyr.smallBuilt];
  }

  // ---------------------------------------------------------------- era --
  applyEra(era) {
    const today = era === 'today';
    const { pyr, interiors, complex, sphinx, rubble, stairs, state } = this;
    for (const g of Object.values(pyr.groups)) { g.today.visible = today; g.built.visible = !today; }
    pyr.smallGroup.visible = today; pyr.smallBuilt.visible = !today;
    rubble.visible = today && !state.xray;
    for (const it of Object.values(interiors)) {
      it.eras.today.group.visible = today; it.eras.built.group.visible = !today;
      it.props.today.visible = today; it.props.built.visible = !today;
      if (it.ghost) it.ghost.children.forEach((g) => { g.visible = g.userData.era === era; });
    }
    if (this.hulls) this.hulls.children.forEach((l) => { l.visible = l.userData.era === era; });
    complex.today.visible = today; complex.built.visible = !today;
    complex.city.visible = today && state.toggles.city;
    this.scatter.visible = today;
    this.palms.today.visible = today; this.palms.built.visible = !today;
    sphinx.group.userData.setEra(era);
    stairs.forEach((st) => { st.mesh.visible = today; });
    this.terrain.uniforms.uEra.value = today ? 0 : 1;
  }

  // ------------------------------------------------------------- x-ray --
  xrayMaterials(on) {
    const mats = new Set();
    const collect = (o) => o.traverse((m) => { if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x)); });
    for (const g of Object.values(this.pyr.groups)) collect(g.group);
    collect(this.pyr.smallGroup); collect(this.pyr.smallBuilt);
    for (const m of mats) {
      if (on) {
        if (!this.xrayCache.has(m)) this.xrayCache.set(m, { t: m.transparent, o: m.opacity, d: m.depthWrite });
        m.transparent = true; m.opacity = 0.2; m.depthWrite = false;
      } else if (this.xrayCache.has(m)) {
        const c = this.xrayCache.get(m); m.transparent = c.t; m.opacity = c.o; m.depthWrite = c.d;
      }
      m.needsUpdate = true;
    }
    for (const g of Object.values(this.pyr.groups)) g.group.traverse((m) => { if (m.isMesh) m.castShadow = !on; });
  }

  applyXray(on) {
    const { state, scene } = this;
    this.xrayMaterials(on);
    this.rubble.visible = !on && state.era === 'today';
    // outlines of the pyramids
    if (!this.hulls) {
      this.hulls = new THREE.Group();
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
      for (const { P, half, tanA } of Object.values(this.pyr.info)) {
        const l = hullLines(P.cx, P.cz, P.baseY, half, tanA, P.heightNow); l.userData.era = 'today'; this.hulls.add(l);
        const l2 = hullLines(P.cx, P.cz, P.baseY, half, tanA, P.heightOrig - 0.01); l2.userData.era = 'built'; this.hulls.add(l2);
      }
      this.hulls.userData.noClip = true;
      scene.add(this.hulls);
    }
    this.hulls.visible = on;
    this.hulls.children.forEach((l) => { l.visible = l.userData.era === state.era; });
    // ghost overlay so passages below ground show through the terrain
    for (const it of Object.values(this.interiors)) {
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
      it.voidMeshes.forEach((v) => { v.visible = on && state.toggles.voids; });
    }
  }

  // the muon-detected voids show in x-ray and in a cut through their pyramid
  onSectionChange() {
    const { state, section } = this;
    for (const it of Object.values(this.interiors)) it.voidMeshes.forEach((v) => { v.visible = ((state.section && section.target === it.id) || state.xray) && state.toggles.voids; });
  }

  applyToggle(name, on) {
    if (name === 'voids') this.onSectionChange();
    if (name === 'city') this.complex.city.visible = on && this.state.era === 'today';
  }

  // ------------------------------------------------------------ lights --
  // electric lamps in the passages (today), near the visitor or in the cut pyramid
  lamps(inside) {
    const { state } = this;
    const out = [];
    if (state.era !== 'today' || !(inside || state.section)) return out;
    for (const it of Object.values(this.interiors)) {
      if (!inside && this.section.target !== it.id) continue;
      for (const l of it.lamps) out.push({ x: it.P.cx + l.p[0], y: it.P.baseY + l.p[1], z: it.P.cz + l.p[2], l });
    }
    return out;
  }

  // in 2560 BCE the passages were dark: the torch comes on
  interiorLit() { return this.state.era === 'today'; }

  onFrame(dt) {
    if (this.state.era === 'built') { const nm = this.complex.water.material.normalMap; nm.offset.x += dt * 0.012; nm.offset.y += dt * 0.007; }
  }

  tourStops(h) { return gizaTour(this, h); }
}

new Giza().start();
