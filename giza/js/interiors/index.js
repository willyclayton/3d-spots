// Builds the three pyramid interiors for both eras, with props, lamps,
// walkable volumes and cross-section data.
import * as THREE from 'three';
import { buildRooms, sectionPolys, walkVolumes } from './build.js';
import { khufuInterior } from './khufu.js';
import { khafreInterior } from './khafre.js';
import { menkaureInterior } from './menkaure.js';
import { Mats } from '../materials.js';
import { GeoBuilder, addBox } from '../../../shared/engine/geo.js';
import { mulberry32 } from '../../../shared/engine/util.js';

const DEFS = { khufu: khufuInterior, khafre: khafreInterior, menkaure: menkaureInterior };

export function buildInteriors(pyrInfo) {
  const mats = {
    lime: Mats.interiorLimestone(), granite: Mats.interiorGranite(), rock: Mats.interiorRock(),
    rough: Mats.interiorRock(), fine: Mats.interiorLimestone(),
  };
  mats.rough.color.multiplyScalar(0.92);
  const propMats = { granite: Mats.polishedGranite(), wood: Mats.wood(), metal: Mats.metal(), lamp: Mats.lamp(), lime: Mats.interiorLimestone(), rock: Mats.interiorRock() };
  const out = {};
  for (const [id, def] of Object.entries(DEFS)) {
    const info = pyrInfo[id];
    const P = info.P;
    const d = def(info);
    const group = new THREE.Group(); group.name = id + '-interior';
    group.position.set(P.cx, P.baseY, P.cz);
    const eraGroups = {};
    for (const era of ['today', 'built']) {
      const els = d.elements.filter((e) => !e.era || e.era === era);
      const geos = buildRooms(els);
      const g = new THREE.Group(); g.name = id + '-rooms-' + era;
      const meshes = [];
      for (const [key, geo] of Object.entries(geos)) {
        const m = new THREE.Mesh(geo, mats[key] || mats.lime);
        m.receiveShadow = true; m.castShadow = false;
        g.add(m); meshes.push(m);
      }
      g.visible = era === 'today';
      group.add(g);
      eraGroups[era] = { group: g, meshes, elements: els, walk: walkVolumes(els) };
    }
    const props = buildProps(id, d, propMats);
    group.add(props.both);
    group.add(props.today);
    props.built.visible = false;
    group.add(props.built);
    // detected voids (translucent)
    const voidMeshes = [];
    for (const v of d.voids) {
      const shape = new THREE.Shape(v.profile.map(([z, y]) => new THREE.Vector2(z, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: v.x1 - v.x0, bevelEnabled: false });
      geo.rotateY(-Math.PI / 2);         // extrude along -x: shape x->z
      geo.translate(v.x1, 0, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineDashedMaterial({ color: 0x9fe3ff, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.9 }));
      edges.computeLineDistances();
      const vg = new THREE.Group(); vg.add(m, edges); vg.name = 'void-' + v.id; vg.visible = false;
      group.add(vg); voidMeshes.push(vg);
    }
    out[id] = {
      id, P, info, def: d, group, eras: eraGroups, props, mats, voidMeshes,
      lamps: props.lamps, terrainHoles: d.terrainHoles || [],
      section: (plane, c, era) => sectionPolys(d.elements.filter((e) => !e.era || e.era === era), plane, c),
    };
  }
  return out;
}

// ------------------------------------------------------------------ props --
function hollowBox(g, x0, y0, z0, x1, y1, z1, t, tb, col) {
  // outer (no top)
  addBox(g, x0, y0, z0, x1, y1, z1, col, 1, { py: true });
  // cavity walls face inward
  const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t, iy0 = y0 + tb;
  g.poly([[ix0, iy0, iz0], [ix1, iy0, iz0], [ix1, iy0, iz1], [ix0, iy0, iz1]], [0, 1, 0], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
  g.poly([[ix0, iy0, iz0], [ix0, y1, iz0], [ix0, y1, iz1], [ix0, iy0, iz1]], [1, 0, 0], col);
  g.poly([[ix1, iy0, iz0], [ix1, iy0, iz1], [ix1, y1, iz1], [ix1, y1, iz0]], [-1, 0, 0], col);
  g.poly([[ix0, iy0, iz0], [ix1, iy0, iz0], [ix1, y1, iz0], [ix0, y1, iz0]], [0, 0, 1], col);
  g.poly([[ix0, iy0, iz1], [ix0, y1, iz1], [ix1, y1, iz1], [ix1, iy0, iz1]], [0, 0, -1], col);
  // rim
  const r = [col[0] * 1.05, col[1] * 1.05, col[2] * 1.05];
  g.poly([[x0, y1, z0], [x1, y1, z0], [ix1, y1, iz0], [ix0, y1, iz0]], [0, 1, 0], r);
  g.poly([[x1, y1, z0], [x1, y1, z1], [ix1, y1, iz1], [ix1, y1, iz0]], [0, 1, 0], r);
  g.poly([[x1, y1, z1], [x0, y1, z1], [ix0, y1, iz1], [ix1, y1, iz1]], [0, 1, 0], r);
  g.poly([[x0, y1, z1], [x0, y1, z0], [ix0, y1, iz0], [ix0, y1, iz1]], [0, 1, 0], r);
}

// sloped plank walkway with cleats along a N–S floor line
function walkway(g, x, w, z0, y0, z1, y1, step = 0.42) {
  const c = [0.9, 0.85, 0.8];
  const L = Math.hypot(z1 - z0, y1 - y0);
  const t = 0.04;
  g.poly([[x - w / 2, y0 + t, z0], [x + w / 2, y0 + t, z0], [x + w / 2, y1 + t, z1], [x - w / 2, y1 + t, z1]], null, c);
  if (Math.abs(y1 - y0) < 0.2) return;
  const n = Math.floor(L / step);
  for (let i = 1; i < n; i++) {
    const f = i / n, z = z0 + (z1 - z0) * f, y = y0 + (y1 - y0) * f + t;
    addBox(g, x - w / 2 + 0.03, y, z - 0.025, x + w / 2 - 0.03, y + 0.045, z + 0.025, [0.75, 0.7, 0.66]);
  }
}

function rail(g, x, z0, y0, z1, y1, h = 0.9, posts = 3.0) {
  const c = [0.8, 0.8, 0.82];
  const r = 0.025;
  const L = Math.hypot(z1 - z0, y1 - y0);
  // top tube (square section)
  g.poly([[x - r, y0 + h, z0], [x + r, y0 + h, z0], [x + r, y1 + h, z1], [x - r, y1 + h, z1]], null, c);
  g.poly([[x - r, y0 + h - 2 * r, z0], [x - r, y0 + h, z0], [x - r, y1 + h, z1], [x - r, y1 + h - 2 * r, z1]], null, c);
  g.poly([[x + r, y0 + h - 2 * r, z0], [x + r, y1 + h - 2 * r, z1], [x + r, y1 + h, z1], [x + r, y0 + h, z0]], null, c);
  const n = Math.max(1, Math.round(L / posts));
  for (let i = 0; i <= n; i++) {
    const f = i / n, z = z0 + (z1 - z0) * f, y = y0 + (y1 - y0) * f;
    addBox(g, x - r, y, z - r, x + r, y + h, z + r, c);
  }
}

function buildProps(id, d, M) {
  const both = new THREE.Group(), today = new THREE.Group(), built = new THREE.Group();
  const gGranite = new GeoBuilder(), gWood = new GeoBuilder(), gMetal = new GeoBuilder(), gLamp = new GeoBuilder();
  const gLime = new GeoBuilder();
  const lamps = [];
  const R = d.ref;
  const rnd = mulberry32(5);
  if (id === 'khufu') {
    // sarcophagus (lidless, against the west wall)
    hollowBox(gGranite, R.KX0 + 0.67, R.yK, 9.9, R.KX0 + 1.65, R.yK + 1.05, 12.18, 0.16, 0.22, [0.92, 0.84, 0.8]);
    // three granite plugs at the foot of the ascending passage
    for (let k = 0; k < 3; k++) {
      const zA = R.zA + 0.05 + k * 1.62 * Math.cos(26.03 * Math.PI / 180);
      const zB = zA + 1.55 * Math.cos(26.03 * Math.PI / 180);
      const lo = (z) => R.yAf(z) + 0.02, hi = (z) => R.yAf(z) + R.hvA - 0.04;
      const x0 = R.X - 0.5, x1 = R.X + 0.5;
      const za = Math.max(zA, R.zA2 + 0.05);
      const P = (x, y, z) => [x, y, z];
      // shape follows the passage slope
      const front = [P(x0, lo(za), za), P(x1, lo(za), za), P(x1, hi(za), za), P(x0, hi(za), za)];
      const back = [P(x0, lo(zB), zB), P(x1, lo(zB), zB), P(x1, hi(zB), zB), P(x0, hi(zB), zB)];
      gGranite.poly(front, [0, 0, -1], [0.85, 0.78, 0.75]);
      gGranite.poly(back, [0, 0, 1], [0.85, 0.78, 0.75]);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; gGranite.poly([front[i], back[i], back[j], front[j]], null, [0.85, 0.78, 0.75]); }
    }
    // the "granite leaf" in the first portcullis slot of the antechamber
    addBox(gGranite, R.X - 0.58, R.yK + 1.12, 3.05, R.X + 0.58, R.yK + 2.65, 3.45, [0.86, 0.8, 0.76]);
    addBox(gGranite, R.X - 0.15, R.yK + 2.0, 2.98, R.X + 0.15, R.yK + 2.2, 3.05, [0.86, 0.8, 0.76]);   // the boss
    // stone "doors" in the Queen's Chamber shafts
    addBox(gLime, 4.94 - 0.1, 22.55 + 60 * Math.sin(39.6 * Math.PI / 180) - 0.02, 4.62 + 60 * Math.cos(39.6 * Math.PI / 180) - 0.06, 4.94 + 0.1, 22.55 + 60 * Math.sin(39.6 * Math.PI / 180) + 0.25, 4.62 + 60 * Math.cos(39.6 * Math.PI / 180), [0.9, 0.88, 0.85]);
    // ---- modern fittings (today) -----------------------------------------
    walkway(gWood, R.X, 0.98, R.zP + 0.3, R.yAf(R.zP + 0.3), R.zGN, R.yGN);
    walkway(gWood, R.X, 0.98, R.zGN + 2.4, R.yG(R.zGN + 2.4), R.zGS - 0.05, R.yG(R.zGS - 0.05));
    walkway(gWood, R.X, 0.98, R.zB + 0.2, R.yD(R.zB + 0.2), R.zRock, 0);
    walkway(gWood, R.X, 0.98, R.zRock, 0, R.zDend - 0.1, R.yDend);
    // bridge over the opening at the foot of the gallery
    addBox(gWood, R.X - 0.5, R.yG(R.zGN) + 0.0, R.zGN + 0.05, R.X + 0.5, R.yG(R.zGN) + 0.06, R.zGN + 2.4, [0.8, 0.75, 0.7]);
    // step up onto the Great Step
    addBox(gWood, R.X - 0.5, R.yG(R.zGS) - 0.05, R.zGS - 0.5, R.X + 0.5, R.yG(R.zGS) + 0.45, R.zGS, [0.8, 0.75, 0.7]);
    // handrails on both gallery ramps
    rail(gMetal, R.X - 0.8, R.zGN + 0.3, R.yG(R.zGN + 0.3) + 0.62, R.zGS - 0.3, R.yG(R.zGS - 0.3) + 0.62);
    rail(gMetal, R.X + 0.8, R.zGN + 0.3, R.yG(R.zGN + 0.3) + 0.62, R.zGS - 0.3, R.yG(R.zGS - 0.3) + 0.62);
    rail(gMetal, R.X - 0.45, R.zP + 1, R.yAf(R.zP + 1), R.zGN - 0.5, R.yAf(R.zGN - 0.5), 0.75, 4);
    // lights: tubes along the gallery walls, lamps in chambers
    for (let z = R.zGN + 3; z < R.zGS - 1; z += 6) {
      for (const sx of [-1, 1]) {
        const x = R.X + sx * 1.02, y = R.yG(z) + 2.4;
        addBox(gLamp, x - 0.03, y, z - 0.6, x + 0.03, y + 0.05, z + 0.6, [1, 1, 1]);
      }
      lamps.push({ p: [R.X, R.yG(z) + 3.0, z], i: 1.0, d: 14 });
    }
    const lamp = (x, y, z, i = 1.2, dist = 12) => { addBox(gLamp, x - 0.08, y - 0.04, z - 0.08, x + 0.08, y + 0.04, z + 0.08, [1, 1, 1]); lamps.push({ p: [x, y - 0.3, z], i, d: dist }); };
    lamp(3.2, R.yK + 5.7, 11.0, 1.6, 16); lamp(-0.6, R.yK + 5.7, 11.0, 1.2, 14);
    lamp(5.0, 21.2 + 4.5, 0, 1.2, 10);
    lamp(R.X, R.yK + 3.6, 4.3, 0.8, 6);
    lamp(R.X, R.yAf(-60) + 1.25, -60, 0.8, 9); lamp(R.X, R.yAf(-48) + 1.25, -48, 0.8, 9);
    lamp(R.er.u, R.yR + 2.3, -95, 1.0, 12); lamp(R.er.u, R.yR + 2.3, -80, 1.0, 12); lamp(3.5, R.yR + 2.3, -70.6, 0.9, 9);
    lamp(R.X, R.yD(-88) + 1.25, -88, 0.6, 9); lamp(R.X, R.yD(-50) + 1.25, -50, 0.6, 9); lamp(R.X, R.yD(-20) + 1.25, -20, 0.6, 9);
    lamp(1.5, R.yDend + 3.4, 5.5, 1.0, 12);
    lamp(R.X, 22.75, -25, 0.6, 9); lamp(R.X, 22.75, -12, 0.6, 9);
  }
  if (id === 'khafre') {
    // sarcophagus sunk into the floor, broken lid beside it
    hollowBox(gGranite, -6.7, R.yF - 0.55, -1.32, -5.6, R.yF + 0.38, 1.32, 0.14, 0.2, [0.9, 0.86, 0.85]);
    addBox(gGranite, -5.2, R.yF, -1.1, -4.6, R.yF + 0.22, 0.2, [0.9, 0.86, 0.85]);
    addBox(gGranite, -5.25, R.yF, 0.35, -4.55, R.yF + 0.24, 1.2, [0.88, 0.84, 0.83]);
    // granite portcullis slab, raised, at the head of the horizontal passage
    addBox(gGranite, R.X - 0.6, R.yF + 1.78, R.zUend + 1.5, R.X + 0.6, R.yF + 2.4, R.zUend + 1.9, [0.9, 0.85, 0.82]);
    walkway(gWood, R.X, 0.98, R.zB + 0.2, R.yU(R.zB + 0.2), R.zUend - 0.05, R.yF);
    const lamp = (x, y, z, i = 1.2, dist = 12) => { addBox(gLamp, x - 0.08, y - 0.04, z - 0.08, x + 0.08, y + 0.04, z + 0.08, [1, 1, 1]); lamps.push({ p: [x, y - 0.3, z], i, d: dist }); };
    lamp(0, 5.4, 0, 1.6, 16); lamp(R.X, R.yF + 1.7, -40, 0.7, 10); lamp(R.X, R.yF + 1.7, -15, 0.7, 10);
    lamp(R.X, R.yU(-88) + 1.25, -88, 0.6, 9); lamp(R.X, R.yLH + 1.7, -70, 0.6, 10); lamp(-2.6, -10.9, -75.3, 0.6, 9);
  }
  if (id === 'menkaure') {
    // three granite portcullises (raised) in the horizontal passage
    for (let k = 0; k < 3; k++) {
      const z = R.zH0 + 2.2 + k * 1.3;
      addBox(gGranite, -0.7, R.yF + 1.8, z, 0.7, R.yF + 2.6, z + 0.45, [0.88, 0.82, 0.8]);
    }
    // carved "palace façade" panels in the panelled chamber
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const z0 = R.zEnd + 0.4 + k * 0.85;
        const x = sx * (1.05 - 0.04);
        addBox(gLime, x - 0.04, R.yF + 0.25, z0, x + 0.04, R.yF + 1.85, z0 + 0.5, [0.9, 0.86, 0.8]);
      }
    }
    walkway(gWood, R.X, 0.98, R.zB + 0.2, R.yM(R.zB + 0.2), R.zEnd - 0.05, R.yF);
    const lamp = (x, y, z, i = 1.2, dist = 12) => { addBox(gLamp, x - 0.08, y - 0.04, z - 0.08, x + 0.08, y + 0.04, z + 0.08, [1, 1, 1]); lamps.push({ p: [x, y - 0.3, z], i, d: dist }); };
    lamp(0, R.yF + 4.7, -2.0, 1.4, 14); lamp(0, R.yF + 2.0, R.zEnd + 1.9, 0.8, 8); lamp(-11.0, R.yLow + 3.2, -1.0, 1.0, 9);
    lamp(-7.6, R.yLow + 2.0, 0.9, 0.7, 7); lamp(0, R.yF + 1.7, -10, 0.6, 9);
  }
  const add = (gb, mat, grp, shadow = true) => {
    if (!gb.count) return;
    const m = new THREE.Mesh(gb.build(), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    grp.add(m);
  };
  add(gGranite, M.granite, both);
  add(gLime, M.lime, both);
  add(gWood, M.wood, today);
  add(gMetal, M.metal, today);
  add(gLamp, M.lamp, today, false);
  return { both, today, built, lamps };
}
