// The amphitheatre, generated bay by bay along the four-centred oval.
//
// Everything is built in the plan frame (x = u along the long axis, y up,
// z = v along the short axis) and placed in the world by rotating the group
// (PLAN_ROT). A wall on ring d is drawn in "developed" coordinates (s, y),
// where s is arc length along the façade, then bent onto the oval: the point
// (s, y) of the ring at depth d is ovalPoint(alphaAt(s), d). Since every ring
// is an offset of the façade, radial lines (the bay divisions, the radial
// walls) are the curve's normals.
//
// Faces are oriented explicitly: each one is turned to face away from a
// reference point inside the solid it bounds, so the walls are closed solids
// whose back faces the cutaway can paint as cut stone.
//
// era 'today': what stands now (survives() in data/site.js); 'built': c. 90 CE.
import * as THREE from 'three';
import { GeoBuilder, polyNormal } from '../../shared/engine/geo.js';
import { mulberry32, lerp } from '../../shared/engine/util.js';
import { PLAN, RINGS, STOREYS, SEATING, HYPOGEUM, BUTTRESSES, survives } from './data/site.js';
import { alphaAt, ovalPoint, ovalNormal, BAY, PLAN_ROT, ovalRadius } from './plan.js';
import { Mats } from './materials.js';

const NB = PLAN.bays;
const SUB = 3;                 // subdivisions of a bay along the curve for swept profiles

// ------------------------------------------------------------- builders --
// One builder per material. Faces get explicit UVs (metres) so textures
// follow the curved walls instead of being projected.
class Surf extends GeoBuilder {
  // a planar polygon facing away from `inside` (a point in the solid behind it)
  face(pts, uvs, col, inside) {
    if (pts.length < 3) return;
    let n = polyNormal(pts);
    if (!n) return;
    if (inside) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
      cx /= pts.length; cy /= pts.length; cz /= pts.length;
      if (n[0] * (cx - inside[0]) + n[1] * (cy - inside[1]) + n[2] * (cz - inside[2]) < 0) {
        pts = pts.slice().reverse(); uvs = uvs.slice().reverse(); n = [-n[0], -n[1], -n[2]];
      }
    }
    for (let i = 1; i < pts.length - 1; i++) {
      this.vert(pts[0], n, col, 1, uvs[0]);
      this.vert(pts[i], n, col, 1, uvs[i]);
      this.vert(pts[i + 1], n, col, 1, uvs[i + 1]);
    }
  }
}

// point on ring d at façade arc length s, height y -> [u, y, v]
function P(s, y, d) { const [u, v] = ovalPoint(alphaAt(s), d); return [u, y, v]; }
// the ring's own arc length at s (texture u on inner rings)
function sOn(s, d) { const a = alphaAt(s); return s * (ovalRadius(a, d) / ovalRadius(a, 0)); }
// bay width on ring d, as a fraction of the façade bay
function bayScale(s, d) { const a = alphaAt(s); return ovalRadius(a, d) / ovalRadius(a, 0); }

function triangulate(contour, holes) {
  const c = contour.map((p) => new THREE.Vector2(p[0], p[1]));
  const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
  if (THREE.ShapeUtils.isClockWise(c)) c.reverse();
  hs.forEach((h) => { if (!THREE.ShapeUtils.isClockWise(h)) h.reverse(); });
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(c, hs); } catch (e) { return null; }
  return { tris, all: c.concat(...hs), contour: c, holes: hs };
}

// A curved wall between depths d0 and d1 (d0 < d1), drawn from a developed
// outline in (s, y) with optional holes (arches, windows). Builds both faces,
// the reveals round the holes, and the edges of the outline except where it
// continues into a neighbouring wall (its left/right ends, unless `ends`).
function curvedWall(b, { d0, d1, contour, holes = [], col, ends = false, bottom = false }) {
  const T = triangulate(contour, holes);
  if (!T) return;
  const dm = (d0 + d1) / 2;
  const inside = (q) => P(q.x, q.y, dm);
  for (const [i, j, k] of T.tris) {
    const a = T.all[i], c = T.all[j], e = T.all[k];
    const cen = { x: (a.x + c.x + e.x) / 3, y: (a.y + c.y + e.y) / 3 };
    const ref = inside(cen);
    for (const d of [d0, d1]) {
      const sgn = d === d0 ? 1 : -1;
      b.face([P(a.x, a.y, d), P(c.x, c.y, d), P(e.x, e.y, d)], [[sgn * sOn(a.x, d), a.y], [sgn * sOn(c.x, d), c.y], [sgn * sOn(e.x, d), e.y]], col, ref);
    }
  }
  const s0 = Math.min(...contour.map((p) => p[0])), s1 = Math.max(...contour.map((p) => p[0]));
  const y0 = Math.min(...contour.map((p) => p[1]));
  const edge = (a, c) => {
    const q = [P(a.x, a.y, d0), P(c.x, c.y, d0), P(c.x, c.y, d1), P(a.x, a.y, d1)];
    const L = Math.hypot(c.x - a.x, c.y - a.y), w = d1 - d0;
    return { q, uv: [[0, 0], [L, 0], [L, w], [0, w]] };
  };
  // the edges of holes and of the outline: triangulate() leaves the outline
  // counter-clockwise and the holes clockwise, so the solid is always on the
  // left of an edge
  const side = (a, c) => {
    const { q, uv } = edge(a, c);
    const L = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const nx = -(c.y - a.y) / L, ny = (c.x - a.x) / L;
    b.face(q, uv, col, P((a.x + c.x) / 2 + nx * 0.2, (a.y + c.y) / 2 + ny * 0.2, dm));
  };
  for (const h of T.holes) for (let i = 0; i < h.length; i++) side(h[i], h[(i + 1) % h.length]);
  const C = T.contour;
  for (let i = 0; i < C.length; i++) {
    const a = C[i], c = C[(i + 1) % C.length];
    const vert = Math.abs(a.x - c.x) < 1e-6, horiz = Math.abs(a.y - c.y) < 1e-6;
    if (vert && (Math.abs(a.x - s0) < 1e-6 || Math.abs(a.x - s1) < 1e-6) && !ends) continue;
    if (horiz && Math.abs(a.y - y0) < 1e-6 && !bottom) continue;
    side(a, c);
  }
}

// Sweep a profile [[d, y], ...] along the oval from s0 to s1. `inside(d, y)`
// gives, for the middle of each profile segment, a point [d, y] in the solid
// behind it. closed profiles can also get end caps.
function sweep(b, profile, s0, s1, { col = [1, 1, 1], closed = false, segs = SUB, caps = false, inside }) {
  const n = profile.length;
  const ring = [];
  for (let i = 0; i <= segs; i++) {
    const s = lerp(s0, s1, i / segs);
    ring.push(profile.map(([d, y]) => P(s, y, d)));
  }
  const m = closed ? n : n - 1;
  const vAt = [0];
  for (let j = 1; j <= n; j++) {
    const a = profile[j - 1], c = profile[j % n];
    vAt.push(vAt[j - 1] + Math.hypot(c[0] - a[0], c[1] - a[1]));
  }
  for (let j = 0; j < m; j++) {
    const j2 = (j + 1) % n;
    const dm = (profile[j][0] + profile[j2][0]) / 2, ym = (profile[j][1] + profile[j2][1]) / 2;
    const [dr, yr] = inside(dm, ym, profile[j], profile[j2]);
    for (let i = 0; i < segs; i++) {
      const sa = lerp(s0, s1, i / segs), sb = lerp(s0, s1, (i + 1) / segs);
      const q = [ring[i][j], ring[i + 1][j], ring[i + 1][j2], ring[i][j2]];
      const uv = [[sa, vAt[j]], [sb, vAt[j]], [sb, vAt[j + 1]], [sa, vAt[j + 1]]];
      b.face(q, uv, col, P((sa + sb) / 2, yr, dr));
    }
  }
  if (caps) {
    let cd = 0, cy = 0; profile.forEach(([d, y]) => { cd += d; cy += y; }); cd /= n; cy /= n;
    const uv = profile.map(([d, y]) => [d, y]);
    b.face(ring[0], uv, col, P(s0 + 0.05, cy, cd));
    b.face(ring[segs], uv, col, P(s1 - 0.05, cy, cd));
  }
}
// common `inside` rules for sweep
const centreOf = (profile) => { let d = 0, y = 0; profile.forEach((p) => { d += p[0]; y += p[1]; }); return [d / profile.length, y / profile.length]; };
const solidAt = (d, y) => () => [d, y];

// A radial wall (along the curve's normal) at façade arc length s, thickness
// t, between the profile of its top `tops` ([[d, y], ...] in increasing d)
// and yb, with arched passages through its foot: notches [{ d0, d1, y1 }].
function radialWall(b, s, t, tops, yb, col, notches = []) {
  const al = alphaAt(s);
  const [nu, nv] = ovalNormal(al);
  const tu = -nv, tv = nu;                     // tangent (towards increasing s)
  const at = (d, y, e) => { const [u, v] = ovalPoint(al, d); return [u + tu * e, y, v + tv * e]; };
  const dA = tops[0][0], dB = tops[tops.length - 1][0];
  const foot = [[dA, yb]];
  for (const o of notches) if (o.d0 > dA + 0.5 && o.d1 < dB - 0.5) foot.push(...archPts(o.d0, o.d1, yb, o.y1, 6));
  foot.push([dB, yb]);
  const T = triangulate([...foot, ...tops.slice().reverse()], []);
  if (!T) return;
  for (const [i, j, k] of T.tris) {
    const a = T.all[i], c = T.all[j], e = T.all[k];
    const cen = at((a.x + c.x + e.x) / 3, (a.y + c.y + e.y) / 3, 0);
    for (const e2 of [-t / 2, t / 2]) {
      b.face([at(a.x, a.y, e2), at(c.x, c.y, e2), at(e.x, e.y, e2)], [[a.x, a.y], [c.x, c.y], [e.x, e.y]], col, cen);
    }
  }
  const C = T.contour;                         // counter-clockwise: the solid is on the left
  for (let i = 0; i < C.length; i++) {
    const a = C[i], c = C[(i + 1) % C.length];
    if (Math.abs(a.y - yb) < 1e-6 && Math.abs(c.y - yb) < 1e-6) continue;   // standing on the ground
    const q = [at(a.x, a.y, -t / 2), at(c.x, c.y, -t / 2), at(c.x, c.y, t / 2), at(a.x, a.y, t / 2)];
    const L = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const nx = -(c.y - a.y) / L, ny = (c.x - a.x) / L;
    b.face(q, [[0, 0], [L, 0], [L, t], [0, t]], col, at((a.x + c.x) / 2 + nx * 0.2, (a.y + c.y) / 2 + ny * 0.2, 0));
  }
}

// arch outline: from (sl, yb) up the left jamb, round the top, down to (sr, yb)
function archPts(sl, sr, yb, ytop, segs = 8) {
  const r = (sr - sl) / 2, cs = (sl + sr) / 2, ys = ytop - r;
  const pts = [[sl, yb], [sl, ys]];
  for (let i = 1; i < segs; i++) { const a = Math.PI - (i / segs) * Math.PI; pts.push([cs + r * Math.cos(a), ys + r * Math.sin(a)]); }
  pts.push([sr, ys], [sr, yb]);
  return pts;
}
// a rectangle of wall (s0..s1, y0..y1) with an arch rising from its bottom edge
function archedBay(s0, s1, y0, y1, sl, sr, ytop) {
  return [[s0, y0], ...archPts(sl, sr, y0, ytop), [s1, y0], [s1, y1], [s0, y1]];
}

// ----------------------------------------------------------- the build --
export function buildAmphitheatre({ era = 'today' } = {}) {
  const built = era === 'built';
  const rnd = mulberry32(built ? 90 : 2026);
  const B = { trav: new Surf(), tuff: new Surf(), brick: new Surf(), marble: new Surf(), wood: new Surf(), sand: new Surf(), floor: new Surf() };
  const tone = (lo = 0.9, span = 0.16) => { const t = lo + rnd() * span; return [t, t * 0.99, t * 0.96]; };
  const S = (k, f = 0) => (k + f) * BAY;               // façade arc length of bay k, offset f
  const surv = (k, ring) => (built ? 4 : survives(k, ring));
  const hd = HYPOGEUM;
  const [fd0, fd1] = RINGS.facade;

  // ------------------------------------------------ outer façade (ring 1)
  const archHalf = 2.1, colR = 0.5, ENT = 2.2;
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
      // entablature: architrave, frieze, cornice
      const y1 = T.y1;
      const entP = [[fd0, y1 - ENT], [-0.15, y1 - ENT], [-0.15, y1 - ENT + 0.75], [-0.08, y1 - ENT + 0.8], [-0.08, y1 - 0.65],
        [-0.35, y1 - 0.5], [-0.65, y1 - 0.25], [-0.65, y1], [fd0, y1]];
      sweep(B.trav, entP, sa, sb, { col: c, inside: solidAt(fd0 + 0.5, y1 - ENT / 2) });
      // impost mouldings at the spring of the arch
      const ys = yt - archHalf;
      band(B.trav, sa, sc - archHalf, ys - 0.35, ys, -0.08, c);
      band(B.trav, sc + archHalf, sb, ys - 0.35, ys, -0.08, c);
      halfColumn(B.trav, sa, yb, y1 - ENT, colR * (st === 0 ? 1.08 : 1.0), T.order, c);
    }
    if (n === 4) {
      // attic: pilasters, consoles for the velarium masts, the top cornice
      const T = STOREYS[3];
      pilaster(B.trav, sa, T.y0 + 1.2, T.y1 - 2.1, 0.55, tone());
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
  // the attic storey behind the façade (90 CE, and where the outer wall stands)
  for (let k = 0; k < NB; k++) {
    if (surv(k, 'facade') < 4) continue;
    const sa = S(k, -0.5), sb = S(k, 0.5);
    curvedWall(B.trav, { d0: r2a, d1: r2b, contour: [[sa, STOREYS[3].y0], [sb, STOREYS[3].y0], [sb, 41], [sa, 41]], col: tone() });
  }

  // --------------------------------------------- ambulatory floors
  for (let k = 0; k < NB; k++) {
    const sa = S(k, -0.5), sb = S(k, 0.5);
    const nF = surv(k, 'facade'), n2 = n2Of(k), n3 = surv(k, 'ring3');
    for (let st = 1; st <= 3; st++) {
      const y = STOREYS[st].y0;
      const c = tone(0.75, 0.08);
      if (nF > st && n2 >= st) slab(B.tuff, sa, sb, RINGS.amb1[0], RINGS.amb1[1], y - 1.0, y, c);
      if (n2 >= st && n3 >= st && st < 3) slab(B.tuff, sa, sb, RINGS.amb2[0], RINGS.amb2[1], y - 1.0, y, c);
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
    curvedWall(B.tuff, { d0: r3a, d1: r3b, contour: archedBay(sa, sb, 0, yTop, sc - half, sc + half, 6.4), col: tone() });
  }

  // ------------------------------------------------------- the seating
  const steps = seatProfile();
  for (let k = 0; k < NB; k++) {
    const sa = S(k, -0.5), sb = S(k, 0.5);
    const north = surv(k, 'facade') > 0;
    // what survives of the seating: a cap height, ragged from bay to bay
    const cap = built ? 99 : north ? 24 + rnd() * 5 : 14 + rnd() * 6;
    const prof = steps.filter(([, y]) => y <= cap);
    if (prof.length < 2) continue;
    const c = built ? [1, 1, 1] : tone(0.8, 0.12);
    // in the ruin the marble is gone: the brick and concrete over the vaults,
    // the treads broken into a rough slope
    const surf = built ? prof : prof.map(([d, y], i) => [d, y - 0.45 - ((i * 7) % 5 === 0 ? rnd() * 0.6 : 0)]);
    sweep(built ? B.marble : B.brick, surf, sa, sb, { col: c, segs: built ? SUB : 2, inside: (d, y) => [d - 0.8, y - 0.8] });
    // the back of the seating where it ends
    const last = surf[surf.length - 1];
    if (last[0] > r3b + 0.2) sweep(B.brick, [[last[0], last[1]], [last[0], 0]], sa, sb, { col: c, segs: 2, inside: (d, y) => [d + 0.5, y] });
    // the radial wall under the seating, at the start of each bay. Where the
    // seating has fallen it still runs out to the third ring, broken off
    // at the height of the vaults that remain
    let tops = surf.filter(([d]) => d >= r3b && d <= RINGS.radial[1]).map(([d, y]) => [d, y + (built ? -0.35 : 0.15 + rnd() * 0.5)]);
    if (!built && last[0] > r3b + 1) {
      const yBroken = Math.min(last[1], 9 + rnd() * 6);
      for (let d = r3b; d < last[0] - 0.5; d += 1.8) tops.push([d, yBroken + (rnd() - 0.5) * 2.5]);
    }
    tops = thin(tops.sort((p, q) => p[0] - q[0]), 0.9);
    if (tops.length >= 2) radialWall(B.brick, sa, 1.2, tops, 0, tone(0.85, 0.12), [{ d0: 27.4, d1: 29.8, y1: 4.2 }]);
    // the vault over the ground-floor passages, where the seating above is gone
    if (!built && last[0] > r3b + 1) {
      const yv = 7.6 + rnd() * 0.6;
      slab(B.brick, sa, sb, r3b, last[0], yv, yv + 0.9, tone(0.75, 0.1));
    }
  }

  // ------------------------------------- podium and the inner ambulatory
  const [, pb] = RINGS.podium;
  for (let k = 0; k < NB; k++) {
    const sa = S(k, -0.5), sb = S(k, 0.5), sc = S(k);
    const c = tone(0.85, 0.12);
    // the arena wall, down to the floor of the basement
    sweep(B.brick, [[pb - 1.0, 4.0], [pb, 4.0], [pb, -hd.depth], [pb - 1.0, -hd.depth]], sa, sb, { col: c, closed: true, inside: solidAt(pb - 0.5, 0) });
    // the podium terrace
    slab(built ? B.marble : B.brick, sa, sb, RINGS.amb3[0], pb - 1.0, 3.4, 4.0, c);
    // the wall between the inner ambulatory and the substructures, a door per bay
    const s3 = bayScale(sc, RINGS.amb3[0]);
    const half = Math.min(0.9, BAY * s3 * 0.25) / s3;
    curvedWall(B.brick, { d0: RINGS.amb3[0] - 0.5, d1: RINGS.amb3[0] + 0.5, contour: archedBay(sa, sb, 0, 3.4, sc - half, sc + half, 2.9), col: c });
  }

  // ---------------------------------------------------- the arena floor
  if (built) arenaFloor(B.sand, 0, [1, 1, 1], () => true);
  else arenaFloor(B.wood, 0, [1, 1, 1], (u) => u > 26);    // the modern platform at the east end

  hypogeum(B, built, rnd);
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
  group.updateMatrixWorld(true);
  return { group, meshes };

  // ---------------------------------------------------------- helpers
  function band(b, s0, s1, y0, y1, dOut, col, dIn = fd0) {
    sweep(b, [[dIn, y0], [dOut, y0], [dOut, y1], [dIn, y1]], s0, s1, { col, segs: 2, inside: solidAt(dIn + 0.3, (y0 + y1) / 2) });
  }
  function slab(b, s0, s1, d0, d1, y0, y1, col) {
    const p = [[d0, y1], [d1, y1], [d1, y0], [d0, y0]];
    sweep(b, p, s0, s1, { col, closed: true, segs: 2, inside: solidAt(...centreOf(p)) });
  }
  // dir: +1 if the solid continues towards increasing s
  function endCap(b, s, d0, d1, y0, y1, col, dir) {
    const q = [P(s, y0, d0), P(s, y0, d1), P(s, y1, d1), P(s, y1, d0)];
    b.face(q, [[0, y0], [d1 - d0, y0], [d1 - d0, y1], [0, y1]], col, P(s + dir * 0.3, (y0 + y1) / 2, (d0 + d1) / 2));
  }
  function halfColumn(b, s, y0, y1, r, order, col) {
    const al = alphaAt(s);
    const [nu, nv] = ovalNormal(al);
    const tu = -nv, tv = nu;
    const [cu, cv] = ovalPoint(al, fd0);
    const seg = 10;
    const axis = (y) => [cu, y, cv];
    const ring = (y, rr) => { const pts = []; for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (i / seg) * Math.PI; pts.push([cu + nu * rr * Math.cos(a) + tu * rr * Math.sin(a), y, cv + nv * rr * Math.cos(a) + tv * rr * Math.sin(a)]); } return pts; };
    const drum = (ya, yb, ra, rb) => {
      const A = ring(ya, ra), Bp = ring(yb, rb);
      const mid = axis((ya + yb) / 2);
      for (let i = 0; i < seg; i++) b.face([A[i], A[i + 1], Bp[i + 1], Bp[i]], [[i * 0.3, ya], [(i + 1) * 0.3, ya], [(i + 1) * 0.3, yb], [i * 0.3, yb]], col, mid);
      for (let i = 0; i < seg; i++) b.face([axis(yb), Bp[i], Bp[i + 1]], [[0, 0], [1, 0], [0, 1]], col, axis(yb - 0.1));
    };
    const capH = order === 'tuscan' ? 0.5 : order === 'ionic' ? 0.6 : 0.95;
    drum(y0, y0 + 0.35, r * 1.3, r * 1.3);                // base
    drum(y0 + 0.35, y1 - capH, r, r * 0.92);              // shaft, slightly tapered
    drum(y1 - capH, y1, r * 1.2, r * (order === 'corinthian' ? 1.4 : 1.25));
  }
  function pilaster(b, s, y0, y1, w, col) {
    const dw = w / 2;
    sweep(b, [[fd0, y0], [-0.15, y0], [-0.15, y1], [fd0, y1]], s - dw, s + dw, { col, segs: 1, closed: true, caps: true, inside: solidAt(-0.07, (y0 + y1) / 2) });
  }
  function consoleBlock(b, s, y, col) {
    const p = [[fd0, y], [-0.55, y + 0.25], [-0.55, y + 0.65], [fd0, y + 0.65]];
    sweep(b, p, s - 0.32, s + 0.32, { col, segs: 1, closed: true, caps: true, inside: solidAt(...centreOf(p)) });
  }
  // the arena, between the arena wall and the middle, at height y; keep(u) picks the part
  function arenaFloor(b, y, col, keep) {
    const NA = 160, rings = [PLAN.cavea, 54, 57, 59.5, 61.5];
    const pts = rings.map((d) => Array.from({ length: NA }, (_, i) => ovalPoint((i / NA) * Math.PI * 2, d)));
    const below = (pp) => { let u = 0, v = 0; pp.forEach((p) => { u += p[0]; v += p[2]; }); return [u / pp.length, y - 1, v / pp.length]; };
    const quad = (a, c, d, e) => {
      const pp = [[a[0], y, a[1]], [c[0], y, c[1]], [d[0], y, d[1]], [e[0], y, e[1]]];
      if (!keep((a[0] + c[0] + d[0] + e[0]) / 4)) return;
      b.face(pp, pp.map((p) => [p[0], p[2]]), col, below(pp));
    };
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < NA; i++) { const i2 = (i + 1) % NA; quad(pts[r][i], pts[r][i2], pts[r + 1][i2], pts[r + 1][i]); }
    }
    const inner = pts[rings.length - 1];
    for (let i = 0; i < NA / 2; i++) quad(inner[i], inner[i + 1], inner[NA - 1 - i], inner[(NA - i) % NA]);
  }
}

// keep points of a top profile at least `gap` apart in d
function thin(pts, gap) {
  if (!pts.length) return pts;
  const out = [pts[0]];
  for (const p of pts.slice(1)) if (p[0] - out[out.length - 1][0] >= gap) out.push(p);
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) { if (last[0] - out[out.length - 1][0] < gap * 0.5) out.pop(); out.push(last); }
  return out;
}

// The stepped profile of the seating, from the arena wall outwards (d
// decreasing as y rises). Each maenianum is a flight of steps; between them a
// walkway (praecinctio) and a wall (balteus).
export function seatProfile() {
  const out = [];
  for (const m of SEATING) {
    if (m.id === 'podium') { out.push([m.d0, m.y0], [m.d1, m.y1]); continue; }
    const n = Math.max(2, Math.round((m.y1 - m.y0) / 0.44));
    const rise = (m.y1 - m.y0) / n, tread = (m.d0 - m.d1) / n;
    out.push([m.d0, out[out.length - 1][1]], [m.d0, m.y0]);
    for (let i = 0; i < n; i++) {
      const d = m.d0 - tread * i, y = m.y0 + rise * (i + 1);
      out.push([d, y], [d - tread, y]);
    }
  }
  return out.filter((p, i) => i === 0 || Math.abs(p[0] - out[i - 1][0]) > 1e-6 || Math.abs(p[1] - out[i - 1][1]) > 1e-6);
}

// inside the oval offset d metres in from the façade?
function insideRing(u, v, d) {
  const { a, b, r, R } = PLAN;
  const CE = a - r, CS = R - b;
  const au = Math.abs(u), av = Math.abs(v);
  const inEnd = au >= CE && Math.atan2(av, au - CE) <= Math.atan2(CS, CE) + 1e-9;
  return inEnd ? Math.hypot(au - CE, av) <= r - d : Math.hypot(u, av + CS) <= R - d;
}

// The basement under the arena: the walls of its corridors, its floor and
// (90 CE) the lifts.
function hypogeum(B, built, rnd) {
  const hd = HYPOGEUM;
  const y0 = -hd.depth;
  const wallTop = () => (built ? -0.3 : -0.3 - rnd() * 1.4);
  const c = () => { const t = 0.85 + rnd() * 0.15; return [t, t * 0.97, t * 0.94]; };
  const box = (b, u0, u1, v0, v1, ya, yb, col) => {
    const ctr = [(u0 + u1) / 2, (ya + yb) / 2, (v0 + v1) / 2];
    const f = (pts, uv) => b.face(pts, uv, col, ctr);
    f([[u0, yb, v0], [u0, yb, v1], [u1, yb, v1], [u1, yb, v0]], [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]);
    f([[u0, ya, v0], [u1, ya, v0], [u1, yb, v0], [u0, yb, v0]], [[u0, ya], [u1, ya], [u1, yb], [u0, yb]]);
    f([[u1, ya, v1], [u0, ya, v1], [u0, yb, v1], [u1, yb, v1]], [[u1, ya], [u0, ya], [u0, yb], [u1, yb]]);
    f([[u0, ya, v1], [u0, ya, v0], [u0, yb, v0], [u0, yb, v1]], [[v1, ya], [v0, ya], [v0, yb], [v1, yb]]);
    f([[u1, ya, v0], [u1, ya, v1], [u1, yb, v1], [u1, yb, v0]], [[v0, ya], [v1, ya], [v1, yb], [v0, yb]]);
  };
  // the curved walls: two rings round the edge, in short lengths so their tops can vary
  for (const [da, db] of [[54.3, 55.3], [58.6, 59.4]]) {
    const N = 40;
    for (let i = 0; i < N; i++) {
      const s0 = (i / N) * NB * BAY, s1 = ((i + 1) / N) * NB * BAY;
      const yt = wallTop();
      const p = [[da, yt], [db, yt], [db, y0], [da, y0]];
      sweep(B.brick, p, s0, s1, { col: c(), closed: true, segs: 3, inside: solidAt(...centreOf(p)) });
    }
  }
  // the straight walls either side of the central corridor and the lateral
  // corridors, with cross walls making cells
  const halfU = (v) => { let lo = 0, hi = 60; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (insideRing(m, v, 55.3)) lo = m; else hi = m; } return lo; };
  const lines = [hd.central / 2 + hd.wall / 2, ...hd.straight.map((s) => s + 2.3)];
  for (const sgn of [-1, 1]) {
    for (const [li, vc] of lines.entries()) {
      const v = sgn * vc;
      const hu = halfU(Math.abs(v) + hd.wall / 2);
      if (hu < 4) continue;
      box(B.brick, -hu, hu, v - hd.wall / 2, v + hd.wall / 2, y0, wallTop(), c());
      if (li === 0) continue;
      const vPrev = sgn * lines[li - 1];
      const va = Math.min(v, vPrev) + hd.wall / 2, vb = Math.max(v, vPrev) - hd.wall / 2;
      if (vb - va < 0.5) continue;
      const hu2 = Math.min(hu, halfU(Math.abs(vPrev)));
      for (let u = -hu2 + 2.2; u < hu2 - 1; u += 3.4) {
        if (Math.abs(u) < 2) continue;
        const len = (vb - va) * 0.45;
        box(B.brick, u - 0.3, u + 0.3, sgn > 0 ? va : vb - len, sgn > 0 ? va + len : vb, y0, wallTop(), c());
      }
    }
  }
  // floor of the basement
  const NA = 120;
  const ring = Array.from({ length: NA }, (_, i) => ovalPoint((i / NA) * Math.PI * 2, PLAN.cavea));
  const fc = [0.95, 0.9, 0.85];
  for (let i = 0; i < NA; i++) {
    const a = ring[i], b2 = ring[(i + 1) % NA];
    const pts = [[0, y0 + 0.02, 0], [a[0], y0 + 0.02, a[1]], [b2[0], y0 + 0.02, b2[1]]];
    B.floor.face(pts, pts.map((p) => [p[0], p[2]]), fc, [a[0] / 3, y0 - 1, a[1] / 3]);
  }
  // lifts (90 CE): 28 shafts along the curved corridor
  if (built) {
    for (let i = 0; i < hd.lifts; i++) {
      const [u, v] = ovalPoint(((i + 0.5) / hd.lifts) * Math.PI * 2, 57);
      box(B.wood, u - 0.7, u + 0.7, v - 0.7, v + 0.7, y0, -0.3, [0.9, 0.85, 0.8]);
    }
  }
}

// A buttress against a broken end of the outer wall.
function buttress(b, bt, col) {
  const s = bt.bay * BAY;
  const H = STOREYS[3].y1;
  const al = alphaAt(s);
  const [nu, nv] = ovalNormal(al);
  const tu = -nv, tv = nu;
  // it leans against the wall from the side where the wall has fallen
  const dir = bt.id === 'stern' ? -1 : 1;
  const at = (d, e, y) => { const [u, v] = ovalPoint(al, d); return [u + tu * e * dir, y, v + tv * e * dir]; };
  const hexa = (pts) => {
    const ctr = pts.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
    const uv = [[0, 0], [8, 0], [8, 8], [0, 8]];
    for (const [i, j, k, l] of [[0, 4, 7, 3], [1, 2, 6, 5], [4, 5, 6, 7], [3, 7, 6, 2], [0, 1, 5, 4], [0, 3, 2, 1]]) b.face([pts[i], pts[j], pts[k], pts[l]], uv, col, ctr);
  };
  if (bt.id === 'stern') {
    // a brick wedge sloping down from the top of the wall
    const L = 15, D0 = -1.2, D1 = RINGS.amb1[1];
    hexa([at(D0, 0, 0), at(D1, 0, 0), at(D1, 0, H - 1), at(D0, 0, H - 1), at(D0, L, 0), at(D1, L * 0.7, 0), at(D1, 1.5, H - 1), at(D0, 1.5, H - 1)]);
  } else {
    // Valadier's: the arcade continued in brick, stepping down
    const tiers = [[0, H - 1, 4.5], [4.5, STOREYS[2].y1, 9], [9, STOREYS[1].y1, 13], [13, STOREYS[0].y1, 17]];
    for (const [e0, h, e1] of tiers) {
      const D0 = -0.8, D1 = RINGS.ring2[1];
      hexa([at(D0, e0, 0), at(D1, e0, 0), at(D1, e0, h), at(D0, e0, h), at(D0, e1, 0), at(D1, e1, 0), at(D1, e1, h), at(D0, e1, h)]);
    }
  }
}
