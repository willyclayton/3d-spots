// Assembles the three kings' pyramids (both eras) and the small pyramids.
import * as THREE from 'three';
import { PYRAMIDS, SMALL_PYRAMIDS, courseHeights, forceBoundary } from './data/site.js';
import {
  buildSteppedCore, buildCasingLayer, buildSmoothCasing, coreGeometryParams, sideToWorld,
} from './pyramid.js';
import { Mats } from './materials.js';
import { GeoBuilder, addBox } from '../../shared/engine/geo.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm2, smoothstep, mulberry32, deg } from '../../shared/engine/util.js';

// Entrance passages, defined where they meet the ORIGINAL casing face.
// slope: degrees downward going into the pyramid; w,h: width and height
// (perpendicular to the floor).
export const ENTRANCES = {
  khufu: [
    { id: 'desc', side: 0, u: 7.29, yCasing: 16.98, slope: 26.523, w: 1.05, h: 1.2, depth: 2.6, chevrons: true },
    { id: 'robbers', side: 0, u: -0.6, yFloor: 6.9, slope: 0, w: 2.3, h: 2.4, depth: 1.8, modern: true },
  ],
  khafre: [
    { id: 'upper', side: 0, u: 6.0, yCasing: 11.54, slope: 25.92, w: 1.05, h: 1.2, depth: 2.2 },
  ],
  menkaure: [
    { id: 'entr', side: 0, u: 0, yCasing: 4.0, slope: 26.03, w: 1.06, h: 1.21, depth: 1.6 },
  ],
};

export function buildPyramids({ quality = 'high' } = {}) {
  const blockScale = quality === 'low' ? 2.2 : quality === 'medium' ? 1.45 : 1.0;
  const out = { info: {}, groups: {} };

  for (const P of Object.values(PYRAMIDS)) {
    const cfg = PER[P.id];
    const heights = courseHeights(P.courses, P.heightNow, cfg.first, cfg.last, cfg.resets, P.seed);
    const half = P.base / 2, tanA = Math.tan(P.slope);
    // --- entrances: choose back planes and force course boundaries
    const ents = [];
    for (const e of ENTRANCES[P.id]) {
      const coreAt = (y) => half - P.coreInset - y / tanA;
      const tanS = Math.tan(deg(e.slope));
      let aCasing, aBack, yFloorBack;
      if (e.slope > 0) {
        aCasing = half - e.yCasing / tanA;
        aBack = coreAt(e.yCasing) - e.depth;
        yFloorBack = e.yCasing - (aCasing - aBack) * tanS;
      } else {
        aBack = coreAt(e.yFloor) - e.depth;
        aCasing = half - e.yFloor / tanA;
        yFloorBack = e.yFloor;
      }
      const hv = e.h / Math.cos(deg(e.slope));
      const k0 = forceBoundary(heights, Math.max(0.5, yFloorBack - (e.slope > 0 ? 0.35 : 0.0)));
      // top boundary: first boundary >= floor + hv + 0.25
      let acc = 0, k1 = -1;
      for (let i = 0; i < heights.length; i++) { acc += heights[i]; if (acc >= yFloorBack + hv + 0.25) { k1 = i + 1; break; } }
      let y0 = 0; for (let i = 0; i < k0; i++) y0 += heights[i];
      let y1 = 0; for (let i = 0; i < k1; i++) y1 += heights[i];
      ents.push({ ...e, aCasing, aBack, yFloorBack, hv, tanS, y0, y1, k0, k1 });
    }
    const geo = coreGeometryParams(P, heights);
    const { ys, S } = geo;
    const openings = ents.map((e) => ({
      side: e.side, u0: e.u - e.w / 2 - (e.slope > 0 ? 0.7 : 0.5), u1: e.u + e.w / 2 + (e.slope > 0 ? 0.7 : 0.5),
      y0: e.y0, y1: e.y1, aBack: e.aBack,
    }));
    const recesses = [];
    for (const e of ents) {
      if (e.chevrons) recesses.push({ side: 0, u0: e.u - 3.1, u1: e.u + 3.1, y0: e.y1, y1: e.y1 + 6.8, depth: 1.9 });
    }
    if (P.id === 'menkaure') recesses.push({ side: 0, u0: -8.5, u1: 6.5, y0: 13, y1: 37, depth: 4.2 });

    const core = buildSteppedCore({
      cx: P.cx, cz: P.cz, baseY: P.baseY, ys, S, seed: P.seed,
      blockScale: blockScale * cfg.blockScale, cornerErode: cfg.cornerErode, concavity: cfg.concavity,
      damage: cfg.damage, missing: cfg.missing, recesses, openings, bands: 3,
    });
    const coreMat = Mats.coreStone();
    if (cfg.coreTint) coreMat.color.multiply(new THREE.Color(...cfg.coreTint));
    const today = new THREE.Group(); today.name = P.id + '-today';
    const built = new THREE.Group(); built.name = P.id + '-built';
    const exterior = [];
    core.geometries.forEach((g) => {
      const m = new THREE.Mesh(g, coreMat);
      m.castShadow = m.receiveShadow = true;
      today.add(m); exterior.push(m);
    });

    // back walls of the entrance openings (with the passage hole)
    const backB = new GeoBuilder();
    for (const e of ents) {
      const o = openings.find((q) => q.aBack === e.aBack);
      const u0 = o.u0 - 0.05, u1 = o.u1 + 0.05;
      const outer = [[u0, e.y0 - 0.05], [u1, e.y0 - 0.05], [u1, e.y1 + 0.05], [u0, e.y1 + 0.05]];
      const hole = [[e.u - e.w / 2, e.yFloorBack], [e.u + e.w / 2, e.yFloorBack], [e.u + e.w / 2, e.yFloorBack + e.hv], [e.u - e.w / 2, e.yFloorBack + e.hv]];
      const [ox, oz] = sideToWorld(e.side, 0, e.aBack);
      const UD = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]][e.side];
      const OD = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][e.side];
      backB.polyHoles(outer, [hole], {
        o: new THREE.Vector3(P.cx + ox, P.baseY, P.cz + oz),
        u: new THREE.Vector3(...UD), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(...OD),
      }, [0.85, 0.82, 0.78]);
    }
    if (backB.count) {
      const m = new THREE.Mesh(backB.build(), coreMat);
      m.castShadow = m.receiveShadow = true; today.add(m); exterior.push(m);
    }

    // --- surviving casing (today)
    const casingParts = [];
    if (P.id === 'khafre') {
      const capMat = Mats.weatheredCasing();
      const g = buildCasingLayer({
        cx: P.cx, cz: P.cz, baseY: P.baseY, ys, half, tanA, coreS: S, i0: 0, i1: S.length,
        seed: 77, tint: [0.9, 0.86, 0.8],
        present: (s, u, i, rnd) => {
          const t = Math.abs(u) / (half - ys[i] / tanA + 1e-3);
          const cap = 103.5 + (fbm2(u * 0.09 + s * 13, s * 7.7, 3, 5) - 0.5) * 9 + smoothstep(0.55, 1, t) * 11;
          return ys[i] >= cap && rnd() > 0.02;
        },
      });
      if (g) { const m = new THREE.Mesh(g, capMat); m.castShadow = m.receiveShadow = true; today.add(m); exterior.push(m); casingParts.push(m); }
      // granite first course remnants
      const gm = Mats.roughGranite();
      const g2 = buildCasingLayer({
        cx: P.cx, cz: P.cz, baseY: P.baseY, ys, half, tanA, coreS: S, i0: 0, i1: 1, seed: 78, tint: [0.95, 0.9, 0.88],
        present: (s, u, i, rnd) => (s === 0 || s === 3) && rnd() < 0.35,
      });
      if (g2) { const m = new THREE.Mesh(g2, gm); m.castShadow = m.receiveShadow = true; today.add(m); exterior.push(m); }
    }
    if (P.id === 'menkaure') {
      const gm = Mats.roughGranite();
      const ent = ents[0];
      const g = buildCasingLayer({
        cx: P.cx, cz: P.cz, baseY: P.baseY, ys, half, tanA, coreS: S, i0: 0, i1: 16, seed: 91,
        tint: [1, 1, 1],
        present: (s, u, i, rnd) => {
          if (s === 0 && Math.abs(u - ent.u) < 1.9 && ys[i] < ent.y1 + 0.6 && ys[i + 1] > ent.y0 - 0.2) return false;
          const nz = fbm2(u * 0.06 + s * 19, i * 0.15, 3, 31);
          const lim = (s === 0 || s === 1 ? 6.5 : 2.5) + nz * 6;
          if (s === 0 && Math.abs(u) < 10 && i < 9) return true;
          if (s === 1 && Math.abs(u) < 16 && i < 6) return true;
          return i < lim && nz > 0.32 && rnd() > 0.06;
        },
        boss: (s, u, i, rnd) => ((s === 0 && Math.abs(u) < 10) || (s === 1 && Math.abs(u) < 16) ? 0 : 0.12 + rnd() * 0.3),
      });
      if (g) { const m = new THREE.Mesh(g, gm); m.castShadow = m.receiveShadow = true; today.add(m); exterior.push(m); }
    }
    if (P.id === 'khufu') {
      const cm = Mats.weatheredCasing();
      const g = buildCasingLayer({
        cx: P.cx, cz: P.cz, baseY: P.baseY, ys, half, tanA, coreS: S, i0: 0, i1: 1, seed: 55, tint: [1.02, 1.0, 0.96],
        present: (s, u) => s === 0 && u > -15 && u < 11,
      });
      if (g) { const m = new THREE.Mesh(g, cm); m.castShadow = m.receiveShadow = true; today.add(m); exterior.push(m); }
      today.add(buildMast(P, ys[ys.length - 1]));
    }

    // chevron gable stones over Khufu's entrance
    const ch = ents.find((e) => e.chevrons);
    if (ch) {
      const m = buildChevrons(P, ch, coreMat);
      today.add(m); built.add(m.clone());
    }

    // --- as built: smooth casing with entrance holes
    const builtHeights = courseHeights(Math.round(P.courses * P.heightOrig / P.heightNow), P.heightOrig, cfg.first, cfg.last, cfg.resets, P.seed + 1);
    const bys = [0]; builtHeights.forEach((h) => bys.push(bys[bys.length - 1] + h));
    const holes = ents.filter((e) => !e.modern).map((e) => {
      // passage mouth projected onto the sloping face, in (u, y)
      const yB = e.yCasing, hvv = e.hv;
      // the floor meets the casing at yCasing; the roof meets it higher up
      const tA = Math.tan(P.slope), tS = e.tanS;
      const yTop = yB + hvv / (1 + tS / tA) ;
      return { side: e.side, y0: yB, y1: yTop, poly: [[e.u - e.w / 2, yB], [e.u + e.w / 2, yB], [e.u + e.w / 2, yTop], [e.u - e.w / 2, yTop]] };
    });
    let i0Smooth = 0;
    if (P.id === 'menkaure') {
      // lower 16 courses: undressed red granite (as left unfinished)
      i0Smooth = 16;
      const gm = Mats.roughGranite();
      const ent = ents[0];
      const g = buildCasingLayer({
        cx: P.cx, cz: P.cz, baseY: P.baseY, ys: bys, half, tanA, coreS: bys.slice(1).map((y) => half - P.coreInset - y / tanA), i0: 0, i1: 16, seed: 92,
        present: (s, u, i) => !(s === 0 && Math.abs(u - ent.u) < 0.75 && bys[i] < ent.yCasing + 1.6 && bys[i + 1] > ent.yCasing - 0.1),
        boss: (s, u, i, rnd) => ((s === 0 && Math.abs(u) < 10) || (s === 1 && Math.abs(u) < 16) ? 0 : 0.1 + rnd() * 0.22),
      });
      if (g) { const m = new THREE.Mesh(g, gm); m.castShadow = m.receiveShadow = true; built.add(m); }
    }
    const smooth = buildSmoothCasing({ cx: P.cx, cz: P.cz, baseY: P.baseY, half, tanA, ys: bys, i0: i0Smooth, holes });
    const tura = Mats.tura();
    const sm = new THREE.Mesh(smooth, tura);
    sm.castShadow = sm.receiveShadow = true;
    built.add(sm);
    if (P.id === 'khafre') {
      // first course of red granite
      const gr = buildSmoothCasing({ cx: P.cx, cz: P.cz, baseY: P.baseY, half, tanA, ys: [0, bys[1]], i0: 0 });
      const gm = new THREE.Mesh(gr, Mats.tura({ color: 0xffffff, granite: true }));
      gm.castShadow = gm.receiveShadow = true; built.add(gm);
      sm.geometry.dispose();
      sm.geometry = buildSmoothCasing({ cx: P.cx, cz: P.cz, baseY: P.baseY, half, tanA, ys: bys, i0: 1, holes });
    }
    built.visible = false;

    const group = new THREE.Group(); group.name = P.id;
    group.add(today, built);
    out.groups[P.id] = { group, today, built, coreMat, exterior, builtMeshes: built.children.slice() };
    out.info[P.id] = { P, ys, S, half, tanA, ents, bys, heights, cfg };
  }

  // ---------------------------------------------------- small pyramids ---
  const small = new THREE.Group(); small.name = 'small-pyramids';
  const smallBuilt = new THREE.Group(); smallBuilt.visible = false;
  const smat = Mats.coreStone();
  smat.color.multiply(new THREE.Color(0.97, 0.95, 0.92));
  out.small = [];
  for (const sp of SMALL_PYRAMIDS) {
    const half = sp.base / 2, tanA = Math.tan(sp.slope);
    const hOrig = half * tanA;
    const nC = Math.max(2, Math.round(sp.heightNow / 0.75));
    const hs = courseHeights(nC, sp.heightNow, 1.0, 0.6, [], sp.seed);
    const ys = [0]; hs.forEach((h) => ys.push(ys[ys.length - 1] + h));
    let S;
    if (sp.stepped) {
      // step pyramid: 4 steep stages with terraces
      const tiers = sp.stepped, tierH = hOrig / tiers, wall = Math.tan(deg(76));
      const terr = (half - hOrig / tanA * 0) / tiers * 0.48;
      S = new Float32Array(nC);
      for (let i = 0; i < nC; i++) {
        const y = ys[i + 1];
        const k = Math.floor(y / tierH - 1e-6);
        const yt = y - k * tierH;
        S[i] = half - 0.8 - k * (terr + tierH / wall) - yt / wall;
      }
    } else {
      S = new Float32Array(nC);
      for (let i = 0; i < nC; i++) S[i] = half - 1.0 - ys[i + 1] / tanA;
    }
    const core = buildSteppedCore({
      cx: sp.cx, cz: sp.cz, baseY: sp.baseY, ys, S, seed: sp.seed * 13, blockScale: blockScale * 0.9,
      cornerErode: 0.9 * sp.damage, damage: sp.damage, missing: 0.08, bands: 1,
    });
    core.geometries.forEach((g) => { const m = new THREE.Mesh(g, smat); m.castShadow = m.receiveShadow = true; small.add(m); });
    if (sp.id === 'g3a') {
      // a few granite casing blocks survive at the base
      const g = buildCasingLayer({
        cx: sp.cx, cz: sp.cz, baseY: sp.baseY, ys, half, tanA, coreS: S, i0: 0, i1: Math.min(3, nC), seed: 5,
        present: (s, u, i, rnd) => rnd() < 0.45, boss: (s, u, i, rnd) => 0.1 + rnd() * 0.2,
      });
      if (g) { const m = new THREE.Mesh(g, Mats.roughGranite()); m.castShadow = m.receiveShadow = true; small.add(m); }
    }
    // as built
    const nb = Math.max(4, Math.round(hOrig / 0.8));
    const hb = courseHeights(nb, hOrig, 0.9, 0.7, [], sp.seed + 5);
    const bys = [0]; hb.forEach((h) => bys.push(bys[bys.length - 1] + h));
    if (sp.stepped) {
      const g = new GeoBuilder();
      const tiers = sp.stepped, tierH = hOrig / tiers, wall = Math.tan(deg(76));
      const terr = half / tiers * 0.48;
      for (let k = 0; k < tiers; k++) {
        const a0 = half - k * (terr + tierH / wall), a1 = a0 - tierH / wall;
        const yb = k * tierH, yt = (k + 1) * tierH;
        for (let s = 0; s < 4; s++) {
          const P = (u, a, y) => { const [x, z] = sideToWorld(s, u, a); return [sp.cx + x, sp.baseY + y, sp.cz + z]; };
          const O = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][s];
          g.poly([P(-a0, a0, yb), P(a0, a0, yb), P(a1, a1, yt), P(-a1, a1, yt)], [O[0] * 0.97, 0.24, O[2] * 0.97], [1, 0.98, 0.95]);
        }
        const a2 = k < tiers - 1 ? a1 - terr : 0;
        const y = yt;
        const pts = [[a1, a1], [a1, -a1], [-a1, -a1], [-a1, a1]].map(([x, z]) => [sp.cx + x, sp.baseY + y, sp.cz + z]);
        g.poly(pts, [0, 1, 0], [1, 1, 0.97]);
        void a2;
      }
      const m = new THREE.Mesh(g.build(), Mats.plaster()); m.castShadow = m.receiveShadow = true; smallBuilt.add(m);
    } else {
      const sm = buildSmoothCasing({ cx: sp.cx, cz: sp.cz, baseY: sp.baseY, half, tanA, ys: bys });
      const m = new THREE.Mesh(sm, Mats.tura({ granite: sp.id === 'g3a' }));
      m.castShadow = m.receiveShadow = true; smallBuilt.add(m);
    }
    out.small.push({ sp, ys, S, half, tanA, hOrig });
  }
  out.smallGroup = small; out.smallBuilt = smallBuilt;
  return out;
}

const PER = {
  khufu: { first: 1.49, last: 0.56, resets: [35, 67, 98, 118, 144, 177], blockScale: 1, cornerErode: 0.45, concavity: 0.55, damage: 0.3, missing: 0.035 },
  khafre: { first: 1.25, last: 0.55, resets: [28, 61, 95, 129, 160], blockScale: 1.1, cornerErode: 0.4, concavity: 0, damage: 0.36, missing: 0.04, coreTint: [1.0, 0.97, 0.92] },
  menkaure: { first: 1.05, last: 0.58, resets: [16, 42], blockScale: 1.0, cornerErode: 0.5, concavity: 0, damage: 0.4, missing: 0.05, coreTint: [1.0, 0.98, 0.95] },
};

// The 1874 survey mast on Khufu's summit marks the original apex height.
function buildMast(P, topY) {
  const g = new GeoBuilder();
  const h = P.heightOrig - topY;
  const base = 1.6;
  const legs = [[-base, -base], [base, -base], [base, base], [-base, base]];
  for (const [x, z] of legs) {
    const top = [0, topY + h, 0], bot = [x, topY, z];
    const n = 0.07;
    for (let s = 0; s < 4; s++) {
      const off = [[n, 0], [0, n], [-n, 0], [0, -n]];
      const a = off[s], b = off[(s + 1) % 4];
      g.poly([[bot[0] + a[0], bot[1], bot[2] + a[1]], [bot[0] + b[0], bot[1], bot[2] + b[1]], [top[0] + b[0] * 0.3, top[1], top[2] + b[1] * 0.3], [top[0] + a[0] * 0.3, top[1], top[2] + a[1] * 0.3]], null, [0.5, 0.45, 0.4]);
    }
  }
  // cross bars
  for (const f of [0.35, 0.7]) {
    const y = topY + h * f, s2 = base * (1 - f);
    addBox(g, -s2, y - 0.04, -s2 - 0.04, s2, y + 0.04, -s2 + 0.04, [0.45, 0.42, 0.38]);
    addBox(g, -s2, y - 0.04, s2 - 0.04, s2, y + 0.04, s2 + 0.04, [0.45, 0.42, 0.38]);
  }
  const m = new THREE.Mesh(g.build(), Mats.metal());
  m.position.set(P.cx, P.baseY, P.cz);
  m.castShadow = true;
  m.name = 'survey-mast';
  return m;
}

// Two pairs of huge limestone gable beams over the descending passage.
function buildChevrons(P, e, mat) {
  const g = new GeoBuilder();
  const rnd = mulberry32(9);
  const aFront = e.aBack + e.depth + 0.6;
  const a0 = e.aBack - 0.1;
  const beam = (yBase, span, rise, thick, aF) => {
    for (const sgn of [-1, 1]) {
      const footU = e.u + sgn * span, apexU = e.u;
      const yFoot = yBase, yApex = yBase + rise;
      const du = apexU - footU, dy = yApex - yFoot, L = Math.hypot(du, dy);
      const nu = -dy / L * sgn, ny = du / L * sgn;  // upward-ish normal
      const pts = [[footU, yFoot], [apexU, yApex], [apexU + nu * thick * sgn * 0 + 0, yApex + thick / Math.cos(Math.atan2(dy, Math.abs(du)))], [footU + nu * thick, yFoot + ny * thick]];
      const Wd = (u, y, a) => { const [x, z] = sideToWorld(e.side, u, a); return [P.cx + x, P.baseY + y, P.cz + z]; };
      const tint = [0.95 + rnd() * 0.05, 0.92, 0.86];
      // faces: front, top, bottom
      const F = pts.map(([u, y]) => Wd(u, y, aF));
      const B = pts.map(([u, y]) => Wd(u, y, a0));
      g.poly(F, null, tint);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        g.poly([F[i], B[i], B[j], F[j]], null, [tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8]);
      }
    }
  };
  beam(e.y1 + 0.05, 2.25, 1.85, 0.85, aFront - 0.35);
  beam(e.y1 + 1.15, 2.6, 2.15, 0.9, aFront - 0.9);
  const m = new THREE.Mesh(g.build(), mat);
  m.castShadow = m.receiveShadow = true;
  m.material.side = THREE.FrontSide;
  m.name = 'chevrons';
  return m;
}


// Fallen stones on the steps and debris along the foot of each face.
export function buildRubble(info, terrain, { quality = 'high' } = {}) {
  const k = quality === 'low' ? 0.3 : quality === 'medium' ? 0.6 : 1;
  const base = new THREE.IcosahedronGeometry(0.5, 0);
  base.deleteAttribute('normal');
  const merged = BufferGeometryUtils.mergeVertices(base);
  const pa = merged.attributes.position;
  const r0 = mulberry32(4);
  for (let i = 0; i < pa.count; i++) {
    const f = 0.7 + r0() * 0.55;
    pa.setXYZ(i, pa.getX(i) * f * 1.25, pa.getY(i) * f * 0.75, pa.getZ(i) * f);
  }
  const rock = merged.toNonIndexed();
  rock.computeVertexNormals();
  const mat = Mats.rubble();
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  for (const [id, I] of Object.entries(info)) {
    const { P, ys, S } = I;
    const n = Math.round((id === 'menkaure' ? 2200 : 5200) * k);
    const nb = Math.round((id === 'menkaure' ? 700 : 1600) * k);
    const im = new THREE.InstancedMesh(rock, mat, n + nb);
    const rnd = mulberry32(P.seed * 7);
    let c = 0;
    for (let t = 0; t < n; t++) {
      const i = Math.min(S.length - 2, Math.floor(Math.pow(rnd(), 1.6) * (S.length - 1)));
      const s = Math.floor(rnd() * 4);
      const tread = S[i] - S[i + 1];
      const u = (rnd() * 2 - 1) * S[i] * 0.97;
      const a = S[i] - 0.1 - rnd() * tread * 0.7;
      const size = 0.12 + Math.pow(rnd(), 2.2) * 0.55;
      const [x, z] = sideToWorld(s, u, a);
      p.set(P.cx + x, P.baseY + ys[i + 1] + size * 0.18, P.cz + z);
      e.set(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5); q.setFromEuler(e);
      sc.set(size, size * (0.6 + rnd() * 0.5), size);
      m4.compose(p, q, sc); im.setMatrixAt(c, m4);
      const v = 0.82 + rnd() * 0.25; col.setRGB(v, v * 0.97, v * 0.93); im.setColorAt(c, col);
      c++;
    }
    for (let t = 0; t < nb; t++) {
      const s = Math.floor(rnd() * 4);
      const u = (rnd() * 2 - 1) * (S[0] + 2);
      const near = Math.pow(rnd(), 1.8);
      const a = S[0] + 0.4 + near * 7;
      const size = (0.2 + Math.pow(rnd(), 2) * 1.1) * (1.2 - near * 0.6);
      const [x, z] = sideToWorld(s, u, a);
      const wx = P.cx + x, wz = P.cz + z;
      p.set(wx, terrain.heightAt(wx, wz) + size * 0.15, wz);
      e.set(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6); q.setFromEuler(e);
      sc.set(size, size * (0.5 + rnd() * 0.5), size * (0.8 + rnd() * 0.5));
      m4.compose(p, q, sc); im.setMatrixAt(c, m4);
      const v = 0.78 + rnd() * 0.28; col.setRGB(v, v * 0.96, v * 0.9); im.setColorAt(c, col);
      c++;
    }
    im.count = c;
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'rubble-' + id;
    group.add(im);
  }
  return group;
}
