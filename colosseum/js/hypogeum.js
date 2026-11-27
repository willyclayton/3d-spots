// The hypogeum: the basement under the arena, added under Domitian.
//
// Plan (distances d in from the façade; the arena wall is at d = 51):
//   - a service corridor round the edge, inside the arena wall;
//   - two curved walls, with the lift corridor between them: 28 lifts, each
//     with a capstan on a timber deck at the upper level, a cage, a rope over
//     a pulley and a trapdoor in the arena floor above;
//   - the middle: a central corridor on the long axis and straight corridors
//     either side, their walls pierced by doorways, the lateral ones divided
//     into cells by short cross walls (cages and holding rooms);
//   - tunnels out under the seating at both ends of the long axis (the
//     eastern one towards the gladiators' school), and a stair down from the
//     north side;
//   - the arena floor over it all: sand on planks on joists (90 CE), or today
//     the modern platform at the eastern end.
// The same layout answers "can one stand here?" for walking (hypoWalk).
import * as THREE from 'three';
import { PLAN, HYPOGEUM } from './data/site.js';
import { BAY, ovalPoint, ovalNormal, ringCoords, bayOf, alphaAt } from './plan.js';
import { Surf, sweep, curvedWall, planeWall, orientedBox, box, bayScale } from './geom.js';
import { HYP_STAIR } from './layout.js';
import { Mats } from './materials.js';

const Y0 = -HYPOGEUM.depth;                 // basement floor
const DECK = -3.0;                          // upper level (timber decks)
const JOIST = -0.45;                        // underside of the arena floor
const PERIM = PLAN.bays * BAY;
const R = 0.26;                             // walking clearance

export const HYP = (() => {
  const C1 = [54.3, 55.3], C2 = [58.6, 59.4];
  const liftD = (C1[1] + C2[0]) / 2;
  // inside the ring d? (the oval offset d in from the façade)
  const inside = (u, v, d) => ringCoords(u, v).d >= d;
  const halfU = (v, d) => { let lo = 0, hi = 70; for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; if (inside(m, v, d)) lo = m; else hi = m; } return lo; };
  // straight walls: centre lines |v|
  const lines = [HYPOGEUM.central / 2 + HYPOGEUM.wall / 2, 6.8, 11.4, 16.0];
  const straight = [];
  for (const sg of [-1, 1]) {
    for (const [i, vc] of lines.entries()) {
      const v = sg * vc;
      const hu = halfU(Math.abs(v) + 0.5, C2[0]);
      if (hu < 3) continue;
      // doorways every 9 m or so, and one on the short axis: a passage across
      const doors = [0];
      for (let u = -hu + 4.5; u < hu - 2; u += 9.2) if (Math.abs(u) > 2.5) doors.push(u);
      straight.push({ v, hu, doors, i, sg });
    }
  }
  // the ends of each corridor need doorways in the inner curved wall
  const s2 = (u, v) => bayOf(ringCoords(u, v).alpha) * BAY;
  const c2doors = [];
  const corridorV = [0, ...[4.5, 9.1, 13.7].flatMap((x) => [x, -x])];
  for (const v of corridorV) {
    const hu = halfU(Math.abs(v), C2[0]) + 0.3;
    for (const u of [hu, -hu]) c2doors.push(s2(u, v));
  }
  for (const k of [20, 60]) c2doors.push(k * BAY);       // and on the short axis
  const c1doors = [0, 10, 20, 30, 40, 50, 60, 70].map((k) => k * BAY);
  // cross walls (cells) in the lateral corridors, alternate sides
  const cells = [];
  for (const sg of [-1, 1]) {
    for (let i = 1; i < lines.length; i++) {
      const va = sg * lines[i - 1], vb = sg * lines[i];
      const lo = Math.min(va, vb) + 0.5, hi = Math.max(va, vb) - 0.5;
      const hu = Math.min(halfU(Math.abs(va) + 0.5, C2[0]), halfU(Math.abs(vb) + 0.5, C2[0])) - 1.2;
      let alt = 0;
      for (let u = -hu + 1.6; u < hu - 1; u += 3.2) {
        if (Math.abs(u) < 2.2) continue;
        const len = (hi - lo) * 0.33;
        const v0 = alt % 2 ? lo : hi - len, v1 = alt % 2 ? lo + len : hi;
        cells.push({ u0: u - 0.25, u1: u + 0.25, v0, v1 });
        alt++;
      }
    }
  }
  // the lifts: 28 along the lift corridor, clear of the doorways
  const lifts = [];
  const nL = HYPOGEUM.lifts;
  for (let i = 0; i < nL; i++) {
    let s = ((i + 0.5) / nL) * PERIM;
    for (const sd of c1doors) if (Math.abs(s - sd) < 3) s = sd + 3.2 * Math.sign(s - sd || 1);
    const al = alphaAt(s);
    const [u, v] = ovalPoint(al, liftD);
    const [nu, nv] = ovalNormal(al);
    lifts.push({ i, s, u, v, n: [nu, nv], t: [-nv, nu], al });
  }
  // the capstans stand on decks beside each lift, along the corridor
  const capstans = lifts.map((L) => {
    const sC = L.s + 2.3 / bayScale(L.s, liftD);
    const al = alphaAt(sC);
    const [u, v] = ovalPoint(al, liftD);
    return { u, v, al, s: sC };
  });
  // lamps along the corridors
  const lamps = [];
  for (let u = -32; u <= 32; u += 8) lamps.push({ p: [u, Y0 + 3.0, 0], i: 0.9, d: 10 });
  for (let i = 0; i < 12; i++) { const [u, v] = ovalPoint((i / 12) * Math.PI * 2, liftD); lamps.push({ p: [u, DECK + 2.2, v], i: 0.9, d: 10 }); }
  for (let i = 0; i < 10; i++) { const [u, v] = ovalPoint((i / 10) * Math.PI * 2, 52.6); lamps.push({ p: [u, Y0 + 3.2, v], i: 0.8, d: 9 }); }
  return { C1, C2, liftD, lines, straight, c1doors, c2doors, cells, lifts, capstans, lamps, halfU, inside };
})();

// metres along ring d between two façade arc lengths (signed, shortest way round)
function ringDist(s, s0, d) {
  let ds = s - s0;
  ds -= Math.round(ds / PERIM) * PERIM;
  return ds * bayScale(s0, d);
}

// Can one stand at plan (u, v) on the floor of the basement? -> [floor, ceiling] | null
export function hypoWalk(u, v, built) {
  const rc = ringCoords(u, v);
  const d = rc.d;
  if (d < PLAN.cavea + R) return null;                         // the arena wall
  const ceil = built ? JOIST - 0.05 : Infinity;
  const s = bayOf(rc.alpha) * BAY;
  const H = HYP;
  const inWall = (d0, d1, doors, half) => {
    if (d < d0 - R || d > d1 + R) return false;
    for (const sd of doors) if (Math.abs(ringDist(s, sd, d)) < half - R) return false;
    return true;
  };
  if (inWall(H.C1[0], H.C1[1], H.c1doors, 0.8)) return null;
  if (inWall(H.C2[0], H.C2[1], H.c2doors, 0.8)) return null;
  for (const w of H.straight) {
    if (Math.abs(v - w.v) < 0.5 + R && Math.abs(u) < w.hu + 0.5) {
      if (!w.doors.some((ud) => Math.abs(u - ud) < 0.75 - R)) return null;
    }
  }
  for (const c of H.cells) if (u > c.u0 - R && u < c.u1 + R && v > c.v0 - R && v < c.v1 + R) return null;
  if (built) {
    for (const L of H.lifts) {
      const du = u - L.u, dv = v - L.v;
      const a = du * L.n[0] + dv * L.n[1], b = du * L.t[0] + dv * L.t[1];
      if (Math.abs(a) < 0.85 + R && Math.abs(b) < 0.85 + R) return null;
    }
    for (const C of H.capstans) {
      // the deck's posts
      const [nu, nv] = ovalNormal(C.al), tu = -nv, tv = nu;
      for (const [a, b] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) {
        const pu = C.u + nu * a + tu * b, pv = C.v + nv * a + tv * b;
        if (Math.hypot(u - pu, v - pv) < 0.12 + R) return null;
      }
    }
  }
  return [Y0, built && d > H.C1[1] && d < H.C2[0] && underDeck(u, v) ? DECK - 0.15 : ceil];
}
function underDeck(u, v) {
  for (const C of HYP.capstans) if (Math.hypot(u - C.u, v - C.v) < 1.6) return true;
  return false;
}

// ---------------------------------------------------------------- build --
export function buildHypogeum(ctx) {
  const { B, built, rnd, tone } = ctx;
  const H = HYP;
  const objects = [];
  const wallTop = () => (built ? JOIST : -0.4 - rnd() * 1.5);
  const brickCol = () => tone(0.82, 0.16);

  // ---- the curved walls, a bay at a time, with doorways
  for (const [[d0, d1], doors] of [[H.C1, H.c1doors], [H.C2, H.c2doors]]) {
    const dm = (d0 + d1) / 2;
    for (let k = 0; k < PLAN.bays; k++) {
      const sa = (k - 0.5) * BAY, sb = (k + 0.5) * BAY;
      const top = wallTop();
      const bottom = [[sa, Y0]];
      for (const sd of doors) {
        for (const off of [-PERIM, 0, PERIM]) {
          const c = sd + off;
          const hw = 0.8 / bayScale(c, dm);
          if (c - hw > sa + 0.05 && c + hw < sb - 0.05) bottom.push([c - hw, Y0], [c - hw, Y0 + 2.5], [c + hw, Y0 + 2.5], [c + hw, Y0]);
        }
      }
      bottom.push([sb, Y0]);
      curvedWall(B.brick, { d0, d1, contour: [...bottom, [sb, top], [sa, top]], col: brickCol() });
    }
  }

  // ---- the straight walls, with doorways
  for (const w of H.straight) {
    const top = wallTop();
    const doors = w.doors.map((u) => ({ a0: u + w.hu - 0.75, a1: u + w.hu + 0.75, y0: Y0, y1: Y0 + 2.6 }));
    planeWall(B.brick, [-w.hu, w.v], [w.hu, w.v], 1.0, Y0, top, doors, brickCol());
    // brick piers along the central corridor carry the joists (90 CE)
    if (built && w.i === 0) for (let u = -w.hu + 1; u < w.hu; u += 3.2) box(B.brick, u - 0.3, u + 0.3, w.v - 0.5 - 0.3 * w.sg, w.v + 0.5 - 0.3 * w.sg, Y0, JOIST, brickCol());
  }
  // ---- cells, and (90 CE) the iron grilles across the alternate ones
  for (const [i, c] of H.cells.entries()) {
    box(B.brick, c.u0, c.u1, c.v0, c.v1, Y0, wallTop(), brickCol());
    if (built && i % 2 === 0) {
      const v = (c.v0 + c.v1) / 2;
      // a grille across the cell mouth, between this cross wall and the next
      const u0 = c.u1, u1 = c.u1 + 2.7;
      for (let u = u0 + 0.12; u < u1; u += 0.16) box(B.iron, u - 0.015, u + 0.015, v - 0.015, v + 0.015, Y0, Y0 + 2.4, [0.6, 0.6, 0.62]);
      box(B.iron, u0, u1, v - 0.03, v + 0.03, Y0 + 2.3, Y0 + 2.4, [0.6, 0.6, 0.62]);
    }
  }

  // ---- the basement floor
  const NA = 160;
  const ring = Array.from({ length: NA }, (_, i) => ovalPoint((i / NA) * Math.PI * 2, PLAN.cavea - 0.5));
  for (let i = 0; i < NA; i++) {
    const a = ring[i], b2 = ring[(i + 1) % NA];
    const pts = [[0, Y0 + 0.01, 0], [a[0], Y0 + 0.01, a[1]], [b2[0], Y0 + 0.01, b2[1]]];
    B.floor.face(pts, pts.map((p) => [p[0], p[2]]), [0.95, 0.9, 0.85], [a[0] / 3, Y0 - 1, a[1] / 3]);
  }

  // ---- tunnels out under the seating at both ends of the long axis
  for (const k of [0, 40]) {
    const s = k * BAY, al = alphaAt(s);
    const [nu, nv] = ovalNormal(al);
    const half = 1.4;
    for (const e of [-half - 0.4, half + 0.4]) tunnelWall(al, e, 36, PLAN.cavea - 1, Y0, -3.0);
    // barrel roof, as a row of short boxes across
    for (let d = 36; d < PLAN.cavea - 1; d += 1.0) {
      const [u, v] = ovalPoint(al, d + 0.5);
      orientedBox(B.brick, [u, -3.25, v], [0.5, 0.25, half + 0.8], [nu, nv], brickCol());
    }
    // closed at the far end (the passage continued beyond)
    const [eu, ev] = ovalPoint(al, 36);
    orientedBox(B.brick, [eu, (Y0 - 3.0) / 2, ev], [0.3, (Y0 + 3.0) / -2, half + 0.8], [nu, nv], brickCol());
  }

  // ---- the stair down from the north side, under the seating
  {
    const S = HYP_STAIR, s = S.bay * BAY, al = alphaAt(s);
    const half = S.half / bayScale(s, 36);
    const n = 20, rise = -Y0 / n, tread = (S.d1 - S.d0) / n;
    const prof = [[S.d0, 0]];
    for (let i = 0; i < n; i++) { const d = S.d0 + tread * i; prof.push([d, -rise * i], [d, -rise * (i + 1)]); }
    prof.pop();
    prof.push([S.d1, Y0], [S.d1, Y0 - 0.3], [S.d0, -0.6]);
    sweep(B.trav, prof.map(([d, y]) => [d, y]), s - half, s + half, { col: tone(0.8, 0.1), closed: true, segs: 1, caps: true, inside: 'poly' });
    // side walls of the stairwell and the passage under the podium
    for (const e of [-S.half - 0.25, S.half + 0.25]) tunnelWall(al, e, S.d0, PLAN.cavea - 0.9, Y0, 0, 0.5);
    // the passage is roofed under the inner ambulatory and the podium
    for (let d = 40; d < PLAN.cavea - 1; d += 1.0) {
      const [u, v] = ovalPoint(al, d + 0.5);
      const [nu, nv] = ovalNormal(al);
      orientedBox(B.brick, [u, -0.18, v], [0.5, 0.18, S.half + 0.5], [nu, nv], brickCol());
    }
    // a parapet round the open stairwell
    for (const e of [-S.half - 0.25, S.half + 0.25]) tunnelWall(al, e, S.d0, 40, 0, built ? 1.0 : 1.05, 0.3, built ? B.trav : B.iron);
  }

  // ---- the arena floor: sand on planks on joists (90 CE), the platform today
  const lifts = built ? H.lifts : [];
  floorDeck(built ? (u, v, d) => d > PLAN.cavea - 0.6 : (u, v, d) => d > PLAN.cavea - 0.6 && u > 26, lifts);

  // ---- the lifts (90 CE): posts, decks and capstans, cages, trapdoors, ropes
  const liftObjs = [];
  if (built) {
    const cageG = cageGeometry();
    const capG = capstanGeometry();
    const doorG = trapdoorGeometry();
    const gateG = gateGeometry();
    const wood = Mats.planks(), woodDark = Mats.timber();
    for (const L of H.lifts) {
      const [nu, nv] = L.n, [tu, tv] = L.t;
      // four guide posts
      for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
        orientedBox(B.wood, [L.u + nu * a + tu * b, (Y0 + JOIST) / 2, L.v + nv * a + tv * b], [0.08, (JOIST - Y0) / 2, 0.08], [nu, nv], [0.75, 0.62, 0.5]);
      }
      // the pulley beam over the shaft
      orientedBox(B.wood, [L.u, JOIST - 0.15, L.v], [0.9, 0.1, 0.1], [nu, nv], [0.7, 0.58, 0.46]);
      const yaw = Math.atan2(-nv, nu);
      const cage = new THREE.Mesh(cageG, woodDark);
      // the cage opens towards the middle of the arena
      cage.position.set(L.u, Y0, L.v); cage.rotation.y = yaw + Math.PI; cage.castShadow = true;
      const gate = new THREE.Mesh(gateG, woodDark);
      gate.position.set(0.7, 0, 0); cage.add(gate);
      const doorA = new THREE.Mesh(doorG, wood), doorB = new THREE.Mesh(doorG, wood);
      const pivA = new THREE.Group(), pivB = new THREE.Group();
      pivA.position.set(L.u + tu * -0.8, 0, L.v + tv * -0.8); pivA.rotation.y = yaw; pivA.add(doorA);
      pivB.position.set(L.u + tu * 0.8, 0, L.v + tv * 0.8); pivB.rotation.y = yaw + Math.PI; pivB.add(doorB);
      objects.push(cage, pivA, pivB);
      // capstan on its deck
      const C = H.capstans[L.i];
      const [cnu, cnv] = ovalNormal(C.al), ctu = -cnv, ctv = cnu;
      orientedBox(B.wood, [C.u, DECK - 0.08, C.v], [1.5, 0.08, 1.2], [ctu, ctv], [0.8, 0.66, 0.52]);
      for (const [a, b] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) {
        orientedBox(B.wood, [C.u + ctu * a + cnu * b, (Y0 + DECK) / 2, C.v + ctv * a + cnv * b], [0.07, (DECK - Y0) / 2, 0.07], [cnu, cnv], [0.72, 0.6, 0.48]);
      }
      const cap = new THREE.Mesh(capG, woodDark);
      cap.position.set(C.u, DECK, C.v); cap.castShadow = true;
      objects.push(cap);
      // rope: from the drum up over the pulley and down to the cage
      const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x8a7350 }));
      objects.push(rope);
      const lift = { ...L, cage, gate, doorA, doorB, cap, rope, capPos: [C.u, C.v], y: Y0, open: 0, gateOpen: 0, spin: 0 };
      setLift(lift, 0, 0, 0);
      liftObjs.push(lift);
    }
  }

  return { objects, lifts: liftObjs, lamps: H.lamps, terrainHoles: stairwellHole() };

  // ------------------------------------------------------------ helpers
  // a straight wall along the normal at angle al, offset e across, d0..d1
  function tunnelWall(al, e, d0, d1, ya, yb, t = 0.5, b = B.brick) {
    const [nu, nv] = ovalNormal(al);
    const [u0, v0] = ovalPoint(al, d0), [u1, v1] = ovalPoint(al, d1);
    const tu = -nv, tv = nu;
    const cu = (u0 + u1) / 2 + tu * e, cv = (v0 + v1) / 2 + tv * e;
    orientedBox(b, [cu, (ya + yb) / 2, cv], [Math.hypot(u1 - u0, v1 - v0) / 2, (yb - ya) / 2, t / 2], [u1 - u0, v1 - v0], brickCol());
  }

  // The arena floor where keep(u, v, d): a 0.5 m grid of sand (or planks)
  // on a plank deck, cut round the trapdoors, on joists.
  function floorDeck(keep, holes) {
    const step = 0.5, top = built ? B.sand : B.wood, under = B.wood;
    const inHole = (u, v) => holes.some((L) => { const du = u - L.u, dv = v - L.v; return Math.abs(du * L.n[0] + dv * L.n[1]) < 0.8 && Math.abs(du * L.t[0] + dv * L.t[1]) < 0.8; });
    const ok = new Map();
    const key = (i, j) => (i + 500) * 1000 + (j + 500);
    for (let i = -100; i < 100; i++) for (let j = -64; j < 64; j++) {
      const u = (i + 0.5) * step, v = (j + 0.5) * step;
      if (Math.abs(u) > 46 || Math.abs(v) > 30) continue;
      const d = ringCoords(u, v).d;
      if (!keep(u, v, d) || inHole(u, v)) continue;
      ok.set(key(i, j), true);
    }
    const col = [1, 1, 1];
    // runs of cells along u, merged into single strips
    for (let j = -64; j < 64; j++) {
      let i = -100;
      while (i < 100) {
        if (!ok.has(key(i, j))) { i++; continue; }
        let i1 = i;
        while (i1 + 1 < 100 && ok.has(key(i1 + 1, j))) i1++;
        const u0 = i * step, u1 = (i1 + 1) * step, v0 = j * step, v1 = v0 + step;
        top.face([[u0, 0, v0], [u0, 0, v1], [u1, 0, v1], [u1, 0, v0]], [[u0, v0], [u0, v1], [u1, v1], [u1, v0]], col, [(u0 + u1) / 2, -1, v0 + 0.25]);
        under.face([[u0, -0.12, v0], [u1, -0.12, v0], [u1, -0.12, v1], [u0, -0.12, v1]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [0.8, 0.7, 0.6], [(u0 + u1) / 2, 1, v0 + 0.25]);
        const ec = [0.75, 0.65, 0.55];
        const side = (pts, c) => under.face(pts, [[0, 0], [0.5, 0], [0.5, 0.12], [0, 0.12]], ec, c);
        side([[u0, -0.12, v0], [u0, -0.12, v1], [u0, 0, v1], [u0, 0, v0]], [u0 + 0.1, -0.06, v0 + 0.25]);
        side([[u1, -0.12, v0], [u1, 0, v0], [u1, 0, v1], [u1, -0.12, v1]], [u1 - 0.1, -0.06, v0 + 0.25]);
        // edges along the run where the neighbouring row is missing
        for (let c = i; c <= i1; c++) {
          const cu0 = c * step, cu1 = cu0 + step;
          if (!ok.has(key(c, j - 1))) side([[cu0, -0.12, v0], [cu0, 0, v0], [cu1, 0, v0], [cu1, -0.12, v0]], [cu0 + 0.25, -0.06, v0 + 0.1]);
          if (!ok.has(key(c, j + 1))) side([[cu0, -0.12, v1], [cu1, -0.12, v1], [cu1, 0, v1], [cu0, 0, v1]], [cu0 + 0.25, -0.06, v1 - 0.1]);
        }
        i = i1 + 1;
      }
    }
    // joists across the short axis every 1.5 m, broken round the lift shafts
    const mat = built ? B.wood : B.iron;
    for (let u = -42; u <= 42; u += 1.5) {
      let vmax = 0;
      for (let v = 0; v < 30; v += 0.25) if (ringCoords(u, v).d >= PLAN.cavea - 0.6 && keep(u, v, PLAN.cavea)) vmax = v; else if (vmax) break;
      if (vmax < 1) continue;
      let segStart = -vmax;
      const blocked = (v) => holes.some((L) => Math.hypot(u - L.u, v - L.v) < 1.2);
      for (let v = -vmax; v <= vmax + 1e-6; v += 0.25) {
        const end = v >= vmax - 1e-6;
        if (blocked(v) || end) {
          const v1 = end ? vmax : v - 0.1;
          if (v1 - segStart > 0.6) box(mat, u - 0.12, u + 0.12, segStart, v1, JOIST, -0.12, built ? [0.7, 0.58, 0.46] : [0.55, 0.55, 0.58]);
          segStart = v + 0.35;
        }
      }
    }
  }

  // the open part of the north stairwell, cut out of the ground (world rect)
  function stairwellHole() {
    const S = HYP_STAIR, al = alphaAt(S.bay * BAY);
    const [u0, v0] = ovalPoint(al, S.d0), [u1, v1] = ovalPoint(al, 40);
    return [{ u: (u0 + u1) / 2, v: (v0 + v1) / 2, along: Math.hypot(u1 - u0, v1 - v0) / 2, across: S.half + 0.05, dir: ovalNormal(al) }];
  }
}

// Move a lift: cage floor height y, trapdoor opening (0..1), gate (0..1), capstan turn.
export function setLift(L, rise, open, gate, spin = null) {
  const y = Y0 + rise * (0 - Y0);
  L.y = y; L.cage.position.y = y;
  L.doorA.rotation.x = -open * 1.75; L.doorB.rotation.x = -open * 1.75;
  L.gate.position.y = gate * 1.25;
  if (spin !== null) L.cap.rotation.y = spin;
  // rope: drum -> pulley over the shaft -> top of the cage
  const p = L.rope.geometry.attributes.position;
  p.setXYZ(0, L.capPos[0], DECK + 0.6, L.capPos[1]);
  p.setXYZ(1, L.u, JOIST - 0.25, L.v);
  p.setXYZ(2, L.u, Math.min(y + 1.45, JOIST - 0.3), L.v);
  p.needsUpdate = true;
  L.rope.visible = y + 1.45 < JOIST - 0.3;
}
export const LIFT_TOP = 0;
export { Y0 as HYP_FLOOR, DECK as HYP_DECK };

// ---------------------------------------------------------- small parts --
// A slatted timber cage, 1.4 x 1.4 x 1.45, with its open side facing +x (local).
function cageGeometry() {
  const b = new Surf();
  const c = [0.75, 0.6, 0.45];
  const h = 1.45, w = 0.7;
  box(b, -w, w, -w, w, 0, 0.1, c);                                    // floor
  box(b, -w, w, -w, w, h - 0.08, h, c);                               // roof
  for (const [x, z] of [[-w, -w], [w, -w], [-w, w], [w, w]]) box(b, x - 0.06, x + 0.06, z - 0.06, z + 0.06, 0, h, c);
  for (let t = -w + 0.2; t < w - 0.1; t += 0.2) {
    box(b, -w - 0.03, -w + 0.03, t - 0.03, t + 0.03, 0.1, h - 0.08, c);   // back
    box(b, t - 0.03, t + 0.03, -w - 0.03, -w + 0.03, 0.1, h - 0.08, c);   // sides
    box(b, t - 0.03, t + 0.03, w - 0.03, w + 0.03, 0.1, h - 0.08, c);
  }
  return b.build();
}
// the cage's front gate: slats that slide up
function gateGeometry() {
  const b = new Surf();
  const c = [0.7, 0.56, 0.42];
  for (let t = -0.6; t <= 0.61; t += 0.2) box(b, -0.04, 0.04, t - 0.035, t + 0.035, 0.1, 1.35, c);
  box(b, -0.05, 0.05, -0.7, 0.7, 1.1, 1.25, c);
  return b.build();
}
// one leaf of a trapdoor: 1.6 x 0.8 of planks, hinged along its outer edge (local x = 0)
function trapdoorGeometry() {
  const b = new Surf();
  box(b, -0.8, 0.8, 0, 0.8, -0.1, 0, [0.85, 0.72, 0.58]);
  return b.build();
}
// a capstan: drum, iron-bound top, four bars
function capstanGeometry() {
  const b = new Surf();
  const c = [0.68, 0.55, 0.42];
  const seg = 10;
  const ring = (y, r) => Array.from({ length: seg + 1 }, (_, i) => { const a = (i / seg) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const drum = (y0, y1, r) => {
    const A = ring(y0, r), Bp = ring(y1, r);
    for (let i = 0; i < seg; i++) b.face([A[i], A[i + 1], Bp[i + 1], Bp[i]], [[i * 0.2, y0], [(i + 1) * 0.2, y0], [(i + 1) * 0.2, y1], [i * 0.2, y1]], c, [0, (y0 + y1) / 2, 0]);
    for (let i = 0; i < seg; i++) b.face([[0, y1, 0], Bp[i + 1], Bp[i]], [[0, 0], [1, 0], [0, 1]], c, [0, y1 - 0.05, 0]);
  };
  drum(0, 1.3, 0.3);
  drum(1.3, 1.42, 0.36);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    orientedBox(b, [Math.cos(a) * 0.9, 1.0, Math.sin(a) * 0.9], [0.6, 0.05, 0.05], [Math.cos(a), Math.sin(a)], c);
  }
  return b.build();
}
