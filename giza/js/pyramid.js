// Procedural pyramid geometry.
//
//  * buildSteppedCore  – the weathered core as it looks today: every course
//    is split into individual blocks with their own set-back, chamfered
//    (eroded) top edge, colour, missing stones and rounded corners.  Faces of
//    neighbouring blocks are generated only where they are exposed.
//  * buildCasingLayer  – surviving outer casing stones (Khafre's cap, Menkaure's
//    granite, Khufu's base remnants), block by block.
//  * buildSmoothCasing – the finished pyramid as built, one strip per course so
//    the shader can draw the fine joints between casing stones.
//
// Local frame for one side: u = along the side, a = distance outward from the
// pyramid axis, y = height above the pyramid base.  Sides: 0 N, 1 E, 2 S, 3 W.
import * as THREE from 'three';
import { GeoBuilder } from '../../shared/engine/geo.js';
import { mulberry32, fbm2, smoothstep, clamp, clipPoly } from '../../shared/engine/util.js';

export const OUT = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
export const UDIR = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];

export function sideToWorld(side, u, a) {
  switch (side) {
    case 0: return [u, -a];
    case 1: return [a, u];
    case 2: return [-u, a];
    default: return [-a, -u];
  }
}

function localDir(side, du, da, dy) {
  const U = UDIR[side], O = OUT[side];
  return [U[0] * du + O[0] * da, dy, U[2] * du + O[2] * da];
}

const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const quadClip = (poly) => {
  let p = clipPoly(poly, (v) => v[0] - v[1], lerp3);
  if (p.length < 3) return p;
  return clipPoly(p, (v) => -v[0] - v[1], lerp3);
};

// ---------------------------------------------------------------- helpers --
export function coreGeometryParams(P, heights) {
  const n = heights.length;
  const ys = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) ys[i + 1] = ys[i] + heights[i];
  const half = P.base / 2, tanA = Math.tan(P.slope);
  const S = new Float32Array(n);
  for (let i = 0; i < n; i++) S[i] = half - P.coreInset - ys[i + 1] / tanA;
  return { ys, S, half, tanA, n };
}

// --------------------------------------------------------- stepped core ----
export function buildSteppedCore(opts) {
  const {
    cx, cz, baseY, ys, S, seed = 1,
    blockScale = 1, cornerErode = 0.35, concavity = 0, damage = 0.25,
    missing = 0.035, recesses = [], openings = [], bands = 3,
    topCourse = S.length - 1, tintBase = [1, 1, 1], palette = null,
  } = opts;
  const n = Math.min(S.length, topCourse + 1);
  const rnd = mulberry32(seed);
  const builders = [];
  for (let c = 0; c < 4 * bands; c++) builders.push(new GeoBuilder());

  // corner blocks are shared by two faces
  const corners = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let c = 0; c < 4; c++) {
      const topFactor = smoothstep(n * 0.6, n, i);
      row.push({
        d: 0.05 + cornerErode * (0.5 + rnd() * 1.0) * (1 + topFactor),
        b: 0.08 + rnd() * 0.16,
        tint: blockTint(rnd, palette),
        uvo: [rnd() * 64, rnd() * 64],
      });
    }
    corners.push(row);
  }

  // block layout
  const blocks = [];
  for (let i = 0; i < n; i++) {
    const h = ys[i + 1] - ys[i];
    const Si = S[i];
    const rowSides = [];
    for (let s = 0; s < 4; s++) {
      const breaks = [];
      const rowOpen = openings.filter((o) => o.side === s && ys[i] >= o.y0 - 1e-3 && ys[i + 1] <= o.y1 + 1e-3);
      const rowRec = recesses.filter((r) => r.side === s && ys[i + 1] > r.y0 + 0.05 && ys[i] < r.y1 - 0.05);
      for (const r of rowOpen.concat(rowRec)) breaks.push(r.u0, r.u1);
      breaks.sort((a, b) => a - b);
      const list = [];
      let u = -Si;
      while (u < Si - 1e-4) {
        const L = clamp(h * (1.15 + rnd() * 1.7), 0.7, 3.2) * blockScale;
        let next = Math.min(u + L, Si);
        if (Si - next < 0.55) next = Si;
        for (const bp of breaks) { if (bp > u + 0.05 && bp < next - 0.05) { next = bp; break; } }
        list.push({ u0: u, u1: next });
        u = next;
      }
      // offsets
      for (let k = 0; k < list.length; k++) {
        const bl = list[k];
        const uc = (bl.u0 + bl.u1) / 2;
        const isL = k === 0, isR = k === list.length - 1;
        if (isL || isR) {
          const cIdx = isR ? s : (s + 3) % 4;
          const cp = corners[i][cIdx];
          bl.d = cp.d; bl.b = cp.b; bl.tint = cp.tint; bl.uvo = cp.uvo; bl.corner = true;
        } else {
          const dist = Si - Math.abs(uc);
          let d = rnd() * 0.12 - 0.02;
          d += cornerErode * (1 - smoothstep(0.5, 4.5, dist)) * (0.5 + rnd());
          d += concavity * (1 - (uc / Si) ** 2);
          const dm = fbm2(uc * 0.07 + s * 37.1, ys[i] * 0.11 + seed * 0.13, 3, seed + s);
          const dmTh = 0.62 - damage * 0.25;
          if (dm > dmTh) d += (dm - dmTh) * 5.5 * damage * (0.4 + rnd() * 1.2);
          if (rnd() < missing) d += 0.25 + rnd() * 0.55;
          bl.d = d;
          bl.b = 0.05 + rnd() * 0.14 + damage * 0.06 + (rnd() < 0.18 ? 0.12 + rnd() * 0.22 : 0);
          bl.lean = rnd() < 0.55 ? rnd() * 0.16 : 0;
          bl.tint = blockTint(rnd, palette);
          bl.uvo = [rnd() * 64, rnd() * 64];
        }
        for (const r of rowRec) {
          if (uc > r.u0 && uc < r.u1) { bl.d = Math.max(bl.d, r.depth); bl.b = 0.12; bl.lean = 0; }
        }
        for (const o of rowOpen) {
          if (uc > o.u0 && uc < o.u1) { bl.noBack = true; bl.d = Si - o.aBack; bl.b = 0; bl.lean = 0; }
        }
      }
      rowSides.push(list);
    }
    blocks.push(rowSides);
  }

  for (const row of blocks) for (const side of row) for (const bl of side) if (bl.lean === undefined) bl.lean = 0;
  const aFront = (i, bl) => S[i] - bl.d;
  const aTopFront = (i, bl) => aFront(i, bl) - bl.lean - bl.b;

  for (let i = 0; i < n; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    const isTop = i === n - 1;
    const band = Math.min(bands - 1, Math.floor((i / n) * bands));
    const shade = 0.86 + 0.14 * smoothstep(0, n * 0.5, i);
    for (let s = 0; s < 4; s++) {
      const B = blocks[i][s];
      const up = !isTop ? blocks[i + 1][s] : null;
      const dn = i > 0 ? blocks[i - 1][s] : null;
      const gb = builders[s * bands + band];
      // auxFn(localPoint) -> [dist to left joint, dist to right joint, dist above bed] (m)
      const emit = (localPts, nLocal, col, auxFn = null) => {
        const clipped = quadClip(localPts);
        if (clipped.length < 3) return;
        const wp = clipped.map((p) => {
          const [x, z] = sideToWorld(s, p[0], p[1]);
          return [cx + x, baseY + p[2], cz + z];
        });
        gb.poly(wp, localDir(s, nLocal[0], nLocal[1], nLocal[2]), col, 1, auxFn ? clipped.map(auxFn) : null);
      };
      for (let k = 0; k < B.length; k++) {
        const bl = B[k];
        gb.uvOff = bl.uvo;
        const t = bl.tint;
        const tf = [t[0] * shade * tintBase[0], t[1] * shade * tintBase[1], t[2] * shade * tintBase[2]];
        const af = aFront(i, bl);
        const bb = bl.b;
        const yb = i === 0 ? y0 - 0.6 : y0 - 0.12;
        const ln = bl.lean;
        const auxR = (p) => [p[0] - bl.u0, bl.u1 - p[0], p[2] - y0];
        if (!bl.noBack) {
          // riser with darker foot (dust / occlusion); may lean back slightly
          const colR = (p) => {
            const f = 0.72 + 0.28 * smoothstep(y0 + baseY, y1 + baseY, p[1]);
            return [tf[0] * f, tf[1] * f, tf[2] * f];
          };
          const rl = Math.hypot(ln, y1 - bb - yb);
          emit([[bl.u0, af, yb], [bl.u1, af, yb], [bl.u1, af - ln, y1 - bb], [bl.u0, af - ln, y1 - bb]],
            [0, (y1 - bb - yb) / rl, ln / rl], colR, auxR);
          // chamfer (eroded arris)
          const nc = [0, 0.7071, 0.7071];
          emit([[bl.u0, af - ln, y1 - bb], [bl.u1, af - ln, y1 - bb], [bl.u1, af - ln - bb, y1], [bl.u0, af - ln - bb, y1]], nc,
            [tf[0] * 1.05, tf[1] * 1.04, tf[2] * 1.0], auxR);
        }
        // tread, split by blocks above
        const segs = [];
        if (isTop) segs.push([bl.u0, bl.u1, 0]);
        else {
          let cur = bl.u0;
          for (const ab of up) {
            if (ab.u1 <= bl.u0 || ab.u0 >= bl.u1) continue;
            const p0 = Math.max(bl.u0, ab.u0), p1 = Math.min(bl.u1, ab.u1);
            if (p0 > cur + 1e-4) segs.push([cur, p0, S[i + 1] - 0.35]);
            const ain = ab.noBack ? S[i + 1] - ab.d : S[i + 1] - ab.d - 0.35;
            segs.push([p0, p1, ain]);
            cur = p1;
          }
          if (cur < bl.u1 - 1e-4) segs.push([cur, bl.u1, S[i + 1] - 0.35]);
        }
        const atf = bl.noBack ? af : af - ln - bb;
        const dust = [tf[0] * 1.08, tf[1] * 1.04, tf[2] * 0.96];
        for (const [p0, p1, ain] of segs) {
          if (atf - ain < 0.01) continue;
          // aux.z = distance from the riser of the course above (inside corner)
          emit([[p0, ain, y1], [p1, ain, y1], [p1, atf, y1], [p0, atf, y1]], [0, 0, 1], dust,
            (p) => [p[0] - bl.u0, bl.u1 - p[0], isTop ? 9 : p[1] - (ain + 0.35)]);
        }
        // underside where the block below is set further back
        if (dn && !bl.noBack) {
          for (const db of dn) {
            if (db.u1 <= bl.u0 || db.u0 >= bl.u1) continue;
            const p0 = Math.max(bl.u0, db.u0), p1 = Math.min(bl.u1, db.u1);
            const abt = db.noBack ? S[i - 1] - db.d : aTopFront(i - 1, db);
            if (abt < af - 0.01) {
              emit([[p0, abt, y0], [p1, abt, y0], [p1, af, y0], [p0, af, y0]], [0, 0, -1],
                [tf[0] * 0.5, tf[1] * 0.5, tf[2] * 0.5]);
            }
          }
        }
        // joint face with right-hand neighbour
        if (k < B.length - 1) {
          const nb = B[k + 1];
          if (bl.noBack && nb.noBack) continue;
          const afN = aFront(i, nb);
          const ub = bl.u1;
          if (Math.abs(af - afN) < 0.015 && !bl.noBack && !nb.noBack) continue;
          let P, R, dir;
          const mA = af - bl.lean * 0.5, mB = afN - nb.lean * 0.5;
          if (bl.noBack) { P = nb; R = bl; dir = -1; }
          else if (nb.noBack) { P = bl; R = nb; dir = 1; }
          else if (mA > mB) { P = bl; R = nb; dir = 1; }
          else { P = nb; R = bl; dir = -1; }
          const aP = aFront(i, P), bP = P.b, lP = P.lean;
          const aE = R.noBack ? aFront(i, R) : aTopFront(i, R);
          if (aP - aE < 0.01) continue;
          const l2 = (p, q, tt) => [p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt];
          let poly2 = [[aE, y0], [aP, y0], [aP - lP, y1 - bP], [aP - lP - bP, y1], [aE, y1]];
          poly2 = clipPoly(poly2, (q) => aE - q[0] - 1e-4, l2);
          // clip to quadrant: a >= |ub|
          const lim = Math.abs(ub);
          poly2 = clipPoly(poly2, (q) => lim - q[0], l2);
          if (poly2.length < 3) continue;
          const tj = P.tint;
          const cj = [tj[0] * shade * 0.72, tj[1] * shade * 0.7, tj[2] * shade * 0.68];
          const wp = poly2.map(([a, y]) => {
            const [x, z] = sideToWorld(s, ub, a);
            return [cx + x, baseY + y, cz + z];
          });
          gb.poly(wp, localDir(s, dir, 0, 0), cj);
        }
      }
    }
  }
  return { geometries: builders.filter((b) => b.count > 0).map((b) => b.build()), blocks };
}

function blockTint(rnd, palette) {
  if (palette) return palette(rnd);
  const v = 0.84 + rnd() * 0.26;
  const r = rnd();
  if (r < 0.12) return [v * 0.93, v * 0.93, v * 0.95];        // greyer stone
  if (r < 0.22) return [v * 1.04, v * 0.97, v * 0.88];        // warmer / iron stained
  return [v, v * 0.985, v * 0.96];
}

// ------------------------------------------------------- casing layer ------
// Individual outer casing stones.  present(side, uMid, i, rnd) decides which
// survive.  boss(side,uMid,i,rnd) -> outward bulge for undressed granite.
export function buildCasingLayer(opts) {
  const { cx, cz, baseY, ys, half, tanA, coreS, i0, i1, present, boss = null,
    seed = 7, tint = [1, 1, 1], blockScale = 1, tintVar = 0.08 } = opts;
  const rnd = mulberry32(seed);
  const gb = new GeoBuilder();
  const sinA = Math.sin(Math.atan(tanA)), cosA = Math.cos(Math.atan(tanA));
  const rows = [];
  for (let i = i0; i < i1; i++) {
    const sides = [];
    const Sb = half - ys[i] / tanA;
    for (let s = 0; s < 4; s++) {
      const list = [];
      let u = -Sb;
      const h = ys[i + 1] - ys[i];
      while (u < Sb - 1e-4) {
        const L = clamp(h * (1.3 + rnd() * 1.5), 0.9, 3.0) * blockScale;
        let next = Math.min(u + L, Sb);
        if (Sb - next < 0.6) next = Sb;
        const uc = (u + next) / 2;
        const pr = present(s, uc, i, rnd);
        list.push({ u0: u, u1: next, on: pr, tv: 1 - tintVar + rnd() * tintVar * 2, boss: boss ? boss(s, uc, i, rnd) : 0 });
        u = next;
      }
      // corners: a corner stone exists on both faces or neither
      sides.push(list);
    }
    rows.push(sides);
  }
  for (let i = i0; i < i1; i++) {
    const r = i - i0;
    for (let s = 0; s < 4; s++) {
      const left = rows[r][(s + 3) % 4], me = rows[r][s];
      const on = me[0].on && left[left.length - 1].on;
      me[0].on = on; left[left.length - 1].on = on;
    }
  }
  const onAt = (r, s, u) => {
    if (r < 0 || r >= rows.length) return false;
    for (const b of rows[r][s]) if (u >= b.u0 && u <= b.u1) return b.on;
    return false;
  };
  for (let i = i0; i < i1; i++) {
    const r = i - i0;
    const y0 = ys[i], y1 = ys[i + 1];
    const Sb = half - y0 / tanA, St = half - y1 / tanA;
    const back = coreS[i] - 0.05;
    for (let s = 0; s < 4; s++) {
      const list = rows[r][s];
      const emit = (pts, nl, col) => {
        const c = quadClip(pts);
        if (c.length < 3) return;
        const wp = c.map((p) => { const [x, z] = sideToWorld(s, p[0], p[1]); return [cx + x, baseY + p[2], cz + z]; });
        gb.poly(wp, localDir(s, nl[0], nl[1], nl[2]), col);
      };
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (!b.on) continue;
        const col = [tint[0] * b.tv, tint[1] * b.tv, tint[2] * b.tv];
        const nF = [0, sinA, cosA];
        if (b.boss > 0.01) {
          const um = (b.u0 + b.u1) / 2 + (rnd() - 0.5) * 0.3 * (b.u1 - b.u0);
          const ym = (y0 + y1) / 2 + (rnd() - 0.5) * 0.3 * (y1 - y0);
          const am = half - ym / tanA;
          const c = [um, am + b.boss * sinA, ym + b.boss * cosA];
          const q = [[b.u0, Sb, y0], [b.u1, Sb, y0], [b.u1, St, y1], [b.u0, St, y1]];
          for (let e = 0; e < 4; e++) {
            const p = q[e], qq = q[(e + 1) % 4];
            const tri = quadClip([p, qq, c]);
            if (tri.length < 3) continue;
            const wp = tri.map((v) => { const [x, z] = sideToWorld(s, v[0], v[1]); return [cx + x, baseY + v[2], cz + z]; });
            gb.poly(wp, null, col);
          }
        } else {
          emit([[b.u0, Sb, y0], [b.u1, Sb, y0], [b.u1, St, y1], [b.u0, St, y1]], nF, col);
        }
        // top where nothing above
        const um = (b.u0 + b.u1) / 2;
        if (!onAt(r + 1, s, um)) {
          emit([[b.u0, coreS[i], y1], [b.u1, coreS[i], y1], [b.u1, St, y1], [b.u0, St, y1]], [0, 0, 1],
            [col[0] * 1.05, col[1] * 1.03, col[2] * 0.98]);
        }
        if (i > 0 && !onAt(r - 1, s, um)) {
          const backB = i > 0 ? coreS[i - 1] : Sb - 1;
          emit([[b.u0, backB, y0], [b.u1, backB, y0], [b.u1, Sb, y0], [b.u0, Sb, y0]], [0, 0, -1],
            [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5]);
        }
        // ends
        const lOn = k > 0 ? list[k - 1].on : true;
        const rOn = k < list.length - 1 ? list[k + 1].on : true;
        const endFace = (u, dir) => {
          const lim = Math.abs(u);
          let pts = [[back, y0], [Sb, y0], [St, y1], [back, y1]];
          pts = clipPoly(pts, (q) => lim - q[0], (p, q, tt) => [p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt]);
          if (pts.length < 3) return;
          const wp = pts.map(([a, y]) => { const [x, z] = sideToWorld(s, u, a); return [cx + x, baseY + y, cz + z]; });
          gb.poly(wp, localDir(s, dir, 0, 0), [col[0] * 0.75, col[1] * 0.74, col[2] * 0.72]);
        };
        if (!lOn) endFace(b.u0, -1);
        if (!rOn) endFace(b.u1, 1);
      }
    }
  }
  return gb.count ? gb.build() : null;
}

// ----------------------------------------------------- smooth casing -------
// One strip per course.  Attributes: uv = (u metres along the face, fraction
// of the course height), course = course index.  holes: [{side, poly:[[u,y]..]}]
export function buildSmoothCasing(opts) {
  const { cx, cz, baseY, half, tanA, ys, i0 = 0, holes = [], apexY } = opts;
  const pos = [], nor = [], uv = [], course = [];
  const sinA = Math.sin(Math.atan(tanA)), cosA = Math.cos(Math.atan(tanA));
  const topY = apexY ?? half * tanA;
  const toW = (s, u, y) => {
    const a = half - y / tanA;
    const [x, z] = sideToWorld(s, u, a);
    return [cx + x, baseY + y, cz + z];
  };
  for (let s = 0; s < 4; s++) {
    const n = localDir(s, 0, sinA, cosA);
    const push = (u, y, i, f) => {
      const p = toW(s, u, y);
      pos.push(...p); nor.push(...n); uv.push(u, f); course.push(i);
    };
    for (let i = i0; i < ys.length - 1; i++) {
      const y0 = ys[i], y1 = Math.min(ys[i + 1], topY);
      if (y0 >= topY) break;
      const h = ys[i + 1] - ys[i];
      const w0 = half - y0 / tanA, w1 = Math.max(0, half - y1 / tanA);
      const hs = holes.filter((hh) => hh.side === s && hh.y1 > y0 && hh.y0 < y1);
      if (!hs.length) {
        // two triangles (or one at the apex)
        const A = [-w0, y0], B = [w0, y0], C = [w1, y1], D = [-w1, y1];
        const tri = (P, Q, R) => {
          push(P[0], P[1], i, (P[1] - y0) / h); push(Q[0], Q[1], i, (Q[1] - y0) / h); push(R[0], R[1], i, (R[1] - y0) / h);
        };
        tri(A, B, C);
        if (w1 > 1e-4) tri(A, C, D);
      } else {
        const contour = [new THREE.Vector2(-w0, y0), new THREE.Vector2(w0, y0), new THREE.Vector2(w1, y1), new THREE.Vector2(-w1, y1)];
        const holeVs = hs.map((hh) => {
          // clip hole polygon to this strip
          let p = hh.poly.map((q) => [q[0], q[1]]);
          p = clipPoly(p, (q) => y0 + 1e-4 - q[1], (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          p = clipPoly(p, (q) => q[1] - (y1 - 1e-4), (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          return p.map((q) => new THREE.Vector2(q[0], q[1]));
        }).filter((h) => h.length >= 3);
        // a hole that spans the full strip height splits the strip: do it by hand
        const full = holeVs.length && holeVs.every((h) => {
          let mn = 1e9, mx = -1e9; h.forEach((v) => { mn = Math.min(mn, v.y); mx = Math.max(mx, v.y); });
          return mn <= y0 + 2e-3 && mx >= y1 - 2e-3;
        });
        if (full) {
          // left and right parts as separate quads
          const hb = holeVs[0];
          let umin = 1e9, umax = -1e9; hb.forEach((v) => { umin = Math.min(umin, v.x); umax = Math.max(umax, v.x); });
          const parts = [[[-w0, y0], [umin, y0], [umin, y1], [-w1, y1]], [[umax, y0], [w0, y0], [w1, y1], [umax, y1]]];
          for (const q of parts) {
            const tri = (P, Q, R) => { push(P[0], P[1], i, (P[1] - y0) / h); push(Q[0], Q[1], i, (Q[1] - y0) / h); push(R[0], R[1], i, (R[1] - y0) / h); };
            tri(q[0], q[1], q[2]); tri(q[0], q[2], q[3]);
          }
          continue;
        }
        holeVs.forEach((h) => { if (!THREE.ShapeUtils.isClockWise(h)) h.reverse(); });
        const tris = THREE.ShapeUtils.triangulateShape(contour, holeVs);
        const all = contour.concat(...holeVs);
        for (const t of tris) for (const idx of t) { const v = all[idx]; push(v.x, v.y, i, (v.y - y0) / h); }
      }
    }
  }
  // the strips above are wound clockwise as seen from outside: flip every
  // triangle so the casing faces outward (otherwise it is culled from outside)
  const swap = (arr, n) => {
    for (let t = 0; t < arr.length; t += 3 * n) {
      for (let k = 0; k < n; k++) { const a = t + n + k, b = t + 2 * n + k; const tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp; }
    }
  };
  swap(pos, 3); swap(nor, 3); swap(uv, 2); swap(course, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('course', new THREE.Float32BufferAttribute(course, 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------ section profile -----
// Outline of the pyramid cut by the plane (axis 'x' => plane x = c, profile in
// (z, y); axis 'z' => plane z = c, profile in (x, y)).  Coordinates local to
// the pyramid centre.  Returns a polygon [[s,y],...] or null.
export function steppedProfile(ys, S, c, concavity = 0) {
  const right = [], left = [];
  const ac = Math.abs(c);
  for (let i = 0; i < S.length; i++) {
    const Si = S[i] - concavity * (1 - (c / S[i]) ** 2) * 0.5;
    if (Si <= ac + 0.05) break;
    right.push([Si, ys[i]], [Si, ys[i + 1]]);
    left.push([-Si, ys[i]], [-Si, ys[i + 1]]);
  }
  if (!right.length) return null;
  return right.concat(left.reverse());
}

export function casingProfile(half, tanA, c, apexY) {
  const ac = Math.abs(c);
  if (ac >= half) return null;
  let yTop = (half - ac) * tanA;
  if (apexY !== undefined) yTop = Math.min(yTop, apexY);
  const wTop = half - yTop / tanA;
  return [[-half, 0], [half, 0], [wTop, yTop], [-wTop, yTop]];
}
