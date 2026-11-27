// The amphitheatre, generated bay by bay along the four-centred oval: the
// façade and the travertine rings, the barrel-vaulted ambulatories, and the
// assembly of the seating (cavea.js), the basement (hypogeum.js) and the
// decoration (decor.js) into meshes.
//
// Everything is built in the plan frame (x = u along the long axis, y up,
// z = v along the short axis) and placed in the world by rotating the group
// (PLAN_ROT). See geom.js for the developed (s, y) coordinates.
//
// era 'today': what stands now (survives() in data/site.js); 'built': c. 90 CE.
import * as THREE from 'three';
import { mulberry32 } from '../../shared/engine/util.js';
import { PLAN, RINGS, STOREYS, BUTTRESSES, survives } from './data/site.js';
import { alphaAt, ovalPoint, ovalNormal, BAY, PLAN_ROT } from './plan.js';
import { Mats } from './materials.js';
import { Surf, P, sweep, curvedWall, archPts, archedBay, bayScale, solidAt, centreOf, SUB } from './geom.js';
import { ambVaults, isAxial } from './layout.js';
import { buildCavea } from './cavea.js';
import { buildHypogeum } from './hypogeum.js';
import { buildDecor } from './decor.js';

const NB = PLAN.bays;

export function buildAmphitheatre({ era = 'today', quality = 'high' } = {}) {
  const built = era === 'built';
  const rnd = mulberry32(built ? 90 : 2026);
  const B = {
    trav: new Surf(), tuff: new Surf(), brick: new Surf(), marble: new Surf(), wood: new Surf(),
    sand: new Surf(), floor: new Surf(), plaster: new Surf(), bronze: new Surf(), iron: new Surf(),
  };
  const tone = (lo = 0.9, span = 0.16) => { const t = lo + rnd() * span; return [t, t * 0.99, t * 0.96]; };
  const S = (k, f = 0) => (k + f) * BAY;
  const surv = (k, ring) => (built ? 4 : survives(k, ring));
  const ctx = { built, era, rnd, tone, S, surv, B, quality };
  const [fd0, fd1] = RINGS.facade;

  // ------------------------------------------------ outer façade (ring 1)
  const archHalf = 2.1, ENT = 2.2;
  for (let k = 0; k < NB; k++) {
    const n = surv(k, 'facade');
    if (!n) continue;
    const sa = S(k, -0.5), sb = S(k, 0.5), sc = S(k);
    for (let st = 0; st < n; st++) {
      const T = STOREYS[st];
      const c = tone();
      if (T.order === 'attic') {
        const holes = [];
        if (k % 2 === 1) {
          const [w, h] = T.window;
          holes.push([[sc - w / 2, 37.4], [sc + w / 2, 37.4], [sc + w / 2, 37.4 + h], [sc - w / 2, 37.4 + h]]);
        }
        curvedWall(B.trav, { d0: fd0, d1: fd1, contour: [[sa, T.y0], [sb, T.y0], [sb, T.y1], [sa, T.y1]], holes, col: c });
        continue;
      }
      const ped = st === 0 ? 0 : 2.25;
      const yb = T.y0 + ped, yt = yb + T.arch[1];
      if (st === 0) {
        curvedWall(B.trav, { d0: fd0, d1: fd1, contour: archedBay(sa, sb, T.y0, T.y1, sc - archHalf, sc + archHalf, yt), col: c });
      } else {
        curvedWall(B.trav, { d0: fd0, d1: fd1, contour: [[sa, T.y0], [sb, T.y0], [sb, T.y1], [sa, T.y1]], holes: [archPts(sc - archHalf, sc + archHalf, yb, yt)], col: c });
        // the pedestal course under the arches, standing proud
        const pedP = [[fd0, T.y0], [-0.3, T.y0], [-0.3, T.y0 + 0.3], [-0.2, T.y0 + 0.4], [-0.2, yb - 0.3], [-0.3, yb - 0.2], [-0.3, yb], [fd0, yb]];
        sweep(B.trav, pedP, sa, sb, { col: c, inside: solidAt(fd0 + 0.5, (T.y0 + yb) / 2) });
      }
      // keystone
      sweep(B.trav, [[fd0 - 0.05, yt - 0.55], [-0.12, yt - 0.5], [-0.12, yt + 0.25], [fd0 - 0.05, yt + 0.25]], sc - 0.32, sc + 0.32, { col: c, closed: true, caps: true, segs: 1, inside: solidAt(-0.05, yt - 0.1) });
      // entablature: architrave in three fasciae, frieze, cornice
      const y1 = T.y1;
      const entP = [[fd0, y1 - ENT], [-0.12, y1 - ENT], [-0.12, y1 - ENT + 0.22], [-0.16, y1 - ENT + 0.26], [-0.16, y1 - ENT + 0.5], [-0.2, y1 - ENT + 0.54],
        [-0.2, y1 - ENT + 0.78], [-0.08, y1 - ENT + 0.85], [-0.08, y1 - 0.7], [-0.22, y1 - 0.62], [-0.3, y1 - 0.5], [-0.62, y1 - 0.4],
        [-0.68, y1 - 0.25], [-0.68, y1], [fd0, y1]];
      sweep(B.trav, entP, sa, sb, { col: c, inside: solidAt(fd0 + 0.5, y1 - ENT / 2) });
      // impost mouldings at the spring of the arch
      const ys = yt - archHalf;
      band(B.trav, sa, sc - archHalf, ys - 0.35, ys, -0.08, c);
      band(B.trav, sc + archHalf, sb, ys - 0.35, ys, -0.08, c);
      halfColumn(B.trav, sa, yb, y1 - ENT, 0.5 * (st === 0 ? 1.08 : 1.0), T.order, c);
    }
    if (n === 4) {
      const T = STOREYS[3];
      pilaster(B.trav, sa, T.y0 + 1.2, T.y1 - 2.1, 0.55, tone());
      sweep(B.trav, [[fd0, T.y0], [-0.25, T.y0], [-0.25, T.y0 + 1.2], [fd0, T.y0 + 1.2]], sa, sb, { col: tone(), inside: solidAt(fd0 + 0.5, T.y0 + 0.6) });
      for (const f of [-0.28, 0, 0.28]) consoleBlock(B.trav, S(k, f), T.y1 - 4.2, tone());
      const corn = [[fd0, T.y1 - 2.1], [-0.12, T.y1 - 2.1], [-0.12, T.y1 - 1.4], [-0.45, T.y1 - 1.0], [-0.75, T.y1 - 0.5], [-0.75, T.y1], [fd0, T.y1]];
      sweep(B.trav, corn, sa, sb, { col: tone(), inside: solidAt(fd0 + 0.5, T.y1 - 1) });
    }
    // where the standing wall ends, close it off (the buttresses cover this)
    if (!built) {
      const yTop = STOREYS[n - 1].y1;
      if (!surv(k - 1, 'facade')) endCap(B.trav, sa, fd0, fd1, 0, yTop, tone(), +1);
      if (!surv(k + 1, 'facade')) endCap(B.trav, sb, fd0, fd1, 0, yTop, tone(), -1);
    }
  }

  // ------------------------------------------------ second ring (arcade)
  const [r2a, r2b] = RINGS.ring2;
  const n2Of = (k) => Math.min(3, surv(k, 'ring2'));
  for (let k = 0; k < NB; k++) {
    const n = n2Of(k);
    if (!n) continue;
    const sa = S(k, -0.5), sb = S(k, 0.5), sc = S(k);
    const sc2 = bayScale(sc, r2a);
    const half = Math.max(0.8, (BAY * sc2 - 2.2) / 2) / sc2;     // piers stay 2.2 m wide
    for (let st = 0; st < n; st++) {
      const T = STOREYS[st];
      const c = tone();
      const yb = st === 0 ? T.y0 : T.y0 + 1.4;
      const yt = st === 0 ? 7.0 : yb + 6.6;
      if (st === 0) curvedWall(B.trav, { d0: r2a, d1: r2b, contour: archedBay(sa, sb, T.y0, T.y1, sc - half, sc + half, yt), col: c });
      else curvedWall(B.trav, { d0: r2a, d1: r2b, contour: [[sa, T.y0], [sb, T.y0], [sb, T.y1], [sa, T.y1]], holes: [archPts(sc - half, sc + half, yb, yt)], col: c });
      band(B.trav, sa, sb, T.y1 - 0.45, T.y1, r2a - 0.12, c, r2a);
    }
    if (!built) {
      if (!n2Of(k - 1)) endCap(B.trav, sa, r2a, r2b, 0, STOREYS[n - 1].y1, tone(), +1);
      if (!n2Of(k + 1)) endCap(B.trav, sb, r2a, r2b, 0, STOREYS[n - 1].y1, tone(), -1);
    }
  }
  // the attic storey of the second ring, behind the attic of the façade
  for (let k = 0; k < NB; k++) {
    if (surv(k, 'facade') < 4) continue;
    const sa = S(k, -0.5), sb = S(k, 0.5), sc = S(k);
    const sc2 = bayScale(sc, r2a);
    const holes = [archPts(sc - 1.0 / sc2, sc + 1.0 / sc2, STOREYS[3].y0 + 0.2, STOREYS[3].y0 + 3.0)];
    curvedWall(B.trav, { d0: r2a, d1: r2b, contour: [[sa, STOREYS[3].y0], [sb, STOREYS[3].y0], [sb, 41], [sa, 41]], holes, col: tone() });
  }

  // ------------------------------------- barrel vaults over the ambulatories
  for (let k = 0; k < NB; k++) {
    const sa = S(k, -0.5), sb = S(k, 0.5);
    const nF = surv(k, 'facade'), n2 = n2Of(k), n3 = surv(k, 'ring3');
    for (const V of ambVaults()) {
      const outer = V.amb === 'amb1' ? nF : n2, inner = V.amb === 'amb1' ? n2 : n3;
      if (outer <= V.st || inner <= V.st) continue;
      sweep(B.tuff, vaultProfile(V), sa, sb, { col: tone(0.74, 0.08), closed: true, segs: SUB, inside: solidAt(...vaultInside(V)) });
    }
  }

  // ------------------------------------------------ third ring (tuff)
  const [r3a, r3b] = RINGS.ring3;
  for (let k = 0; k < NB; k++) {
    const n = surv(k, 'ring3');
    if (!n) continue;
    const sa = S(k, -0.5), sb = S(k, 0.5), sc = S(k);
    const sc3 = bayScale(sc, r3a);
    const half = Math.max(0.6, (BAY * sc3 - 2.6) / 2) / sc3;
    const yTop = built ? 30.6 : n >= 3 ? STOREYS[1].y1 + 4 + rnd() * 4 : STOREYS[1].y1 - rnd() * 3;
    const holes = [];
    if (yTop > STOREYS[1].y0 + 8) holes.push(archPts(sc - half * 0.8, sc + half * 0.8, STOREYS[1].y0 + 0.2, STOREYS[1].y0 + 6.0));
    curvedWall(B.tuff, { d0: r3a, d1: r3b, contour: archedBay(sa, sb, 0, yTop, sc - half, sc + half, isAxial(k) ? 7.6 : 6.4), holes, col: tone() });
  }

  buildCavea(ctx);
  const hyp = buildHypogeum(ctx);
  const decor = buildDecor(ctx);
  if (!built) for (const bt of BUTTRESSES) buttress(B.brick, bt, tone(0.85, 0.1));

  // ---------------------------------------------------------- meshes
  const group = new THREE.Group();
  group.name = 'amphitheatre-' + era;
  group.rotation.y = PLAN_ROT;
  const meshes = [];
  const add = (b, mat, name) => {
    if (!b.count) return;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    group.add(m); meshes.push(m);
  };
  add(B.trav, Mats.travertine(), 'travertine');
  add(B.tuff, Mats.tuff(), 'tuff');
  add(B.brick, Mats.brick(), 'brick');
  add(B.marble, Mats.marble(), 'marble');
  add(B.wood, Mats.planks(), 'planks');
  add(B.sand, Mats.arenaSand(), 'sand');
  add(B.floor, Mats.basementFloor(), 'basement-floor');
  add(B.plaster, Mats.plaster(), 'plaster');
  add(B.bronze, Mats.bronze(), 'bronze');
  add(B.iron, Mats.iron(), 'iron');
  for (const o of [...hyp.objects, ...decor.objects]) group.add(o);
  group.updateMatrixWorld(true);
  return { group, meshes, hyp, decor, ctx };

  // ---------------------------------------------------------- helpers
  function band(b, s0, s1, y0, y1, dOut, col, dIn = fd0) {
    sweep(b, [[dIn, y0], [dOut, y0], [dOut, y1], [dIn, y1]], s0, s1, { col, segs: 2, inside: solidAt(dIn + 0.3, (y0 + y1) / 2) });
  }
  function endCap(b, s, d0, d1, y0, y1, col, dir) {
    const q = [P(s, y0, d0), P(s, y0, d1), P(s, y1, d1), P(s, y1, d0)];
    b.face(q, [[0, y0], [d1 - d0, y0], [d1 - d0, y1], [0, y1]], col, P(s + dir * 0.3, (y0 + y1) / 2, (d0 + d1) / 2));
  }
  function halfColumn(b, s, y0, y1, r, order, col) {
    const al = alphaAt(s);
    const [nu, nv] = ovalNormal(al);
    const tu = -nv, tv = nu;
    const [cu, cv] = ovalPoint(al, fd0);
    const seg = 12;
    const axis = (y) => [cu, y, cv];
    const ring = (y, rr) => { const pts = []; for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (i / seg) * Math.PI; pts.push([cu + nu * rr * Math.cos(a) + tu * rr * Math.sin(a), y, cv + nv * rr * Math.cos(a) + tv * rr * Math.sin(a)]); } return pts; };
    const drum = (ya, yb, ra, rb) => {
      const A = ring(ya, ra), Bp = ring(yb, rb);
      const mid = axis((ya + yb) / 2);
      for (let i = 0; i < seg; i++) b.face([A[i], A[i + 1], Bp[i + 1], Bp[i]], [[i * 0.25, ya], [(i + 1) * 0.25, ya], [(i + 1) * 0.25, yb], [i * 0.25, yb]], col, mid);
      for (let i = 0; i < seg; i++) b.face([axis(yb), Bp[i], Bp[i + 1]], [[0, 0], [1, 0], [0, 1]], col, axis(yb - 0.1));
    };
    // base (plinth and torus), shaft with a slight taper, capital by order
    drum(y0, y0 + 0.2, r * 1.42, r * 1.42);
    drum(y0 + 0.2, y0 + 0.36, r * 1.3, r * 1.18);
    const capH = order === 'tuscan' ? 0.5 : order === 'ionic' ? 0.55 : 1.0;
    const yS = y1 - capH;
    const mid = (y0 + yS) / 2;
    drum(y0 + 0.36, mid, r, r * 0.98);
    drum(mid, yS, r * 0.98, r * 0.88);
    if (order === 'tuscan') { drum(yS, yS + 0.18, r * 0.92, r * 1.12); drum(yS + 0.18, y1, r * 1.3, r * 1.3); }
    else if (order === 'ionic') { drum(yS, yS + 0.22, r * 0.92, r * 1.05); drum(yS + 0.22, y1 - 0.12, r * 1.45, r * 1.45); drum(y1 - 0.12, y1, r * 1.3, r * 1.3); }
    else { drum(yS, yS + 0.35, r * 0.92, r * 1.1); drum(yS + 0.35, yS + 0.7, r * 1.1, r * 1.28); drum(yS + 0.7, y1, r * 1.4, r * 1.45); }
  }
  function pilaster(b, s, y0, y1, w, col) {
    const dw = w / 2;
    sweep(b, [[fd0, y0], [-0.15, y0], [-0.15, y1], [fd0, y1]], s - dw, s + dw, { col, segs: 1, closed: true, caps: true, inside: solidAt(-0.07, (y0 + y1) / 2) });
    sweep(b, [[fd0, y1 - 0.6], [-0.25, y1 - 0.6], [-0.25, y1], [fd0, y1]], s - dw - 0.08, s + dw + 0.08, { col, segs: 1, closed: true, caps: true, inside: solidAt(-0.1, y1 - 0.3) });
  }
  function consoleBlock(b, s, y, col) {
    const p = [[fd0, y], [-0.55, y + 0.25], [-0.55, y + 0.65], [fd0, y + 0.65]];
    sweep(b, p, s - 0.32, s + 0.32, { col, segs: 1, closed: true, caps: true, inside: solidAt(...centreOf(p)) });
  }
}

// A barrel vault over an ambulatory, as a closed profile: the semicircle of
// the soffit, the haunches, and the floor of the storey above.
function vaultProfile(V) {
  const w = V.d1 - V.d0, r = w / 2, dm = (V.d0 + V.d1) / 2;
  const spring = V.crown - r;
  const pts = [[V.d0, spring]];
  for (let i = 1; i < 12; i++) { const a = Math.PI - (i / 12) * Math.PI; pts.push([dm + r * Math.cos(a), spring + r * Math.sin(a)]); }
  pts.push([V.d1, spring], [V.d1, V.top], [V.d0, V.top]);
  return pts;
}
function vaultInside(V) { return [(V.d0 + V.d1) / 2, (V.crown + V.top) / 2]; }

// A buttress against a broken end of the outer wall.
function buttress(b, bt, col) {
  const s = bt.bay * BAY;
  const H = STOREYS[3].y1;
  const al = alphaAt(s);
  const [nu, nv] = ovalNormal(al);
  const tu = -nv, tv = nu;
  const dir = bt.id === 'stern' ? -1 : 1;     // it leans against the wall from the fallen side
  const at = (d, e, y) => { const [u, v] = ovalPoint(al, d); return [u + tu * e * dir, y, v + tv * e * dir]; };
  const hexa = (pts) => {
    const ctr = pts.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
    const uv = [[0, 0], [8, 0], [8, 8], [0, 8]];
    for (const [i, j, k, l] of [[0, 4, 7, 3], [1, 2, 6, 5], [4, 5, 6, 7], [3, 7, 6, 2], [0, 1, 5, 4], [0, 3, 2, 1]]) b.face([pts[i], pts[j], pts[k], pts[l]], uv, col, ctr);
  };
  if (bt.id === 'stern') {
    const L = 15, D0 = -1.2, D1 = RINGS.amb1[1];
    hexa([at(D0, 0, 0), at(D1, 0, 0), at(D1, 0, H - 1), at(D0, 0, H - 1), at(D0, L, 0), at(D1, L * 0.7, 0), at(D1, 1.5, H - 1), at(D0, 1.5, H - 1)]);
  } else {
    const tiers = [[0, H - 1, 4.5], [4.5, STOREYS[2].y1, 9], [9, STOREYS[1].y1, 13], [13, STOREYS[0].y1, 17]];
    for (const [e0, h, e1] of tiers) {
      const D0 = -0.8, D1 = RINGS.ring2[1];
      hexa([at(D0, e0, 0), at(D1, e0, 0), at(D1, e0, h), at(D0, e0, h), at(D0, e1, 0), at(D1, e1, 0), at(D1, e1, h), at(D0, e1, h)]);
    }
  }
}
