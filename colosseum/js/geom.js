// Geometry helpers for the amphitheatre, all in the plan frame (x = u along
// the long axis, y up, z = v along the short axis). A wall on ring d is drawn
// in "developed" coordinates (s, y), where s is arc length along the façade,
// then bent onto the oval: P(s, y, d). Faces are oriented explicitly, each
// turned away from a reference point inside the solid it bounds, so walls are
// closed solids whose back faces the cutaway paints as cut stone.
import * as THREE from 'three';
import { GeoBuilder, polyNormal } from '../../shared/engine/geo.js';
import { lerp } from '../../shared/engine/util.js';
import { alphaAt, ovalPoint, ovalNormal, ovalRadius } from './plan.js';

export const SUB = 3;          // subdivisions of a bay along the curve for swept profiles

// ------------------------------------------------------------- builders --
// One builder per material. Faces get explicit UVs (metres) so textures
// follow the curved walls instead of being projected.
export class Surf extends GeoBuilder {
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
export function P(s, y, d) { const [u, v] = ovalPoint(alphaAt(s), d); return [u, y, v]; }
// the ring's own arc length at s (texture u on inner rings)
export function sOn(s, d) { const a = alphaAt(s); return s * (ovalRadius(a, d) / ovalRadius(a, 0)); }
// bay width on ring d, as a fraction of the façade bay
export function bayScale(s, d) { const a = alphaAt(s); return ovalRadius(a, d) / ovalRadius(a, 0); }

export function triangulate(contour, holes) {
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
export function curvedWall(b, { d0, d1, contour, holes = [], col, ends = false, bottom = false }) {
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
export function sweep(b, profile, s0, s1, { col = [1, 1, 1], closed = false, segs = SUB, caps = false, inside }) {
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
  // inside === 'poly': a closed profile; the solid is on the interior side
  // of each edge, found from the winding of the outline
  let wind = 0;
  if (inside === 'poly') {
    for (let j = 0; j < n; j++) { const a = profile[j], c = profile[(j + 1) % n]; wind += (c[0] - a[0]) * (c[1] + a[1]); }
    wind = wind < 0 ? 1 : -1;                 // +1: counter-clockwise in (d, y)
  }
  for (let j = 0; j < m; j++) {
    const j2 = (j + 1) % n;
    const dm = (profile[j][0] + profile[j2][0]) / 2, ym = (profile[j][1] + profile[j2][1]) / 2;
    let dr, yr;
    if (inside === 'poly') {
      const ed = profile[j2][0] - profile[j][0], ey = profile[j2][1] - profile[j][1], l = Math.hypot(ed, ey) || 1;
      dr = dm - (ey / l) * 0.04 * wind; yr = ym + (ed / l) * 0.04 * wind;
    } else [dr, yr] = inside(dm, ym, profile[j], profile[j2]);
    for (let i = 0; i < segs; i++) {
      const sa = lerp(s0, s1, i / segs), sb = lerp(s0, s1, (i + 1) / segs);
      const q = [ring[i][j], ring[i + 1][j], ring[i + 1][j2], ring[i][j2]];
      const uv = [[sa, vAt[j]], [sb, vAt[j]], [sb, vAt[j + 1]], [sa, vAt[j + 1]]];
      b.face(q, uv, col, P((sa + sb) / 2, yr, dr));
    }
  }
  if (caps) {
    // flat ends, triangulated (the profile need not be convex)
    const T = triangulate(profile, []);
    if (T) {
      const pts = T.all.map((q) => [q.x, q.y]);
      for (const [s, ds] of [[s0, 0.05], [s1, -0.05]]) {
        for (const [i, j, k] of T.tris) {
          const a = pts[i], c = pts[j], e = pts[k];
          b.face([P(s, a[1], a[0]), P(s, c[1], c[0]), P(s, e[1], e[0])], [a, c, e], col, P(s + ds, (a[1] + c[1] + e[1]) / 3, (a[0] + c[0] + e[0]) / 3));
        }
      }
    }
  }
}
// common `inside` rules for sweep
export const centreOf = (profile) => { let d = 0, y = 0; profile.forEach((p) => { d += p[0]; y += p[1]; }); return [d / profile.length, y / profile.length]; };
export const solidAt = (d, y) => () => [d, y];

// A radial wall (along the curve's normal) at façade arc length s, thickness
// t, between the profile of its top `tops` ([[d, y], ...] in increasing d)
// and yb, with arched passages through its foot: notches [{ d0, d1, y1 }].
export function radialWall(b, s, t, tops, yb, col, notches = []) {
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
export function archPts(sl, sr, yb, ytop, segs = 8) {
  const r = (sr - sl) / 2, cs = (sl + sr) / 2, ys = ytop - r;
  const pts = [[sl, yb], [sl, ys]];
  for (let i = 1; i < segs; i++) { const a = Math.PI - (i / segs) * Math.PI; pts.push([cs + r * Math.cos(a), ys + r * Math.sin(a)]); }
  pts.push([sr, ys], [sr, yb]);
  return pts;
}
// a rectangle of wall (s0..s1, y0..y1) with an arch rising from its bottom edge
export function archedBay(s0, s1, y0, y1, sl, sr, ytop) {
  return [[s0, y0], ...archPts(sl, sr, y0, ytop), [s1, y0], [s1, y1], [s0, y1]];
}


// An axis-aligned box in plan coordinates.
export function box(b, u0, u1, v0, v1, y0, y1, col) {
  const c = [(u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2];
  const f = (pts, uv) => b.face(pts, uv, col, c);
  f([[u0, y1, v0], [u0, y1, v1], [u1, y1, v1], [u1, y1, v0]], [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]);
  f([[u0, y0, v0], [u1, y0, v0], [u1, y0, v1], [u0, y0, v1]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  f([[u0, y0, v0], [u1, y0, v0], [u1, y1, v0], [u0, y1, v0]], [[u0, y0], [u1, y0], [u1, y1], [u0, y1]]);
  f([[u1, y0, v1], [u0, y0, v1], [u0, y1, v1], [u1, y1, v1]], [[u1, y0], [u0, y0], [u0, y1], [u1, y1]]);
  f([[u0, y0, v1], [u0, y0, v0], [u0, y1, v0], [u0, y1, v1]], [[v1, y0], [v0, y0], [v0, y1], [v1, y1]]);
  f([[u1, y0, v0], [u1, y0, v1], [u1, y1, v1], [u1, y1, v0]], [[v0, y0], [v1, y0], [v1, y1], [v0, y1]]);
}

// A box centred at (u, y, v) with half sizes (hu along `dir`, hy, hv across),
// turned so its first axis points along the plan direction dir = [du, dv].
export function orientedBox(b, c, [hu, hy, hv], dir, col) {
  const l = Math.hypot(dir[0], dir[1]) || 1;
  const ax = [dir[0] / l, dir[1] / l], cx = [-ax[1], ax[0]];
  const p = (i, j, k) => [c[0] + ax[0] * hu * i + cx[0] * hv * k, c[1] + hy * j, c[2] + ax[1] * hu * i + cx[1] * hv * k];
  const ctr = [c[0], c[1], c[2]];
  const quads = [
    [p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)], [p(-1, -1, -1), p(-1, -1, 1), p(1, -1, 1), p(1, -1, -1)],
    [p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1)], [p(-1, -1, 1), p(-1, 1, 1), p(1, 1, 1), p(1, -1, 1)],
    [p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), p(-1, -1, 1)], [p(1, -1, -1), p(1, -1, 1), p(1, 1, 1), p(1, 1, -1)],
  ];
  const s = [hu * 2, hy * 2, hv * 2];
  for (const q of quads) b.face(q, [[0, 0], [s[0], 0], [s[0], s[1]], [0, s[1]]], col, ctr);
}

// A straight wall in plan from p0 to p1 (centre line), thickness t, from y0
// to y1, with holes in developed (along, y) coordinates measured from p0.
export function planeWall(b, p0, p1, t, y0, y1, holes, col) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (L < 0.05) return;
  const ax = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L], nx = [-ax[1], ax[0]];
  const at = (a, y, e) => [p0[0] + ax[0] * a + nx[0] * e, y, p0[1] + ax[1] * a + nx[1] * e];
  const outline = (h, yb) => (h.round === false ? [[h.a0, yb], [h.a0, h.y1], [h.a1, h.y1], [h.a1, yb]] : archPts(h.a0, h.a1, yb, h.y1, 6));
  const notches = holes.filter((h) => h.y0 <= y0 + 1e-6);
  const inner = holes.filter((h) => h.y0 > y0 + 1e-6);
  const foot = [[0, y0]];
  for (const h of notches.sort((p, q) => p.a0 - q.a0)) foot.push(...outline(h, y0));
  foot.push([L, y0]);
  const contour = [...foot, [L, y1], [0, y1]];
  const T = triangulate(contour, inner.map((h) => outline(h, h.y0)));
  if (!T) return;
  for (const [i, j, k] of T.tris) {
    const a = T.all[i], c = T.all[j], e = T.all[k];
    const cen = at((a.x + c.x + e.x) / 3, (a.y + c.y + e.y) / 3, 0);
    for (const e2 of [-t / 2, t / 2]) b.face([at(a.x, a.y, e2), at(c.x, c.y, e2), at(e.x, e.y, e2)], [[a.x, a.y], [c.x, c.y], [e.x, e.y]], col, cen);
  }
  const side = (a, c, bottom) => {
    if (bottom) return;
    const q = [at(a.x, a.y, -t / 2), at(c.x, c.y, -t / 2), at(c.x, c.y, t / 2), at(a.x, a.y, t / 2)];
    const l2 = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const n2 = [-(c.y - a.y) / l2, (c.x - a.x) / l2];
    b.face(q, [[0, 0], [l2, 0], [l2, t], [0, t]], col, at((a.x + c.x) / 2 + n2[0] * 0.1, (a.y + c.y) / 2 + n2[1] * 0.1, 0));
  };
  const C = T.contour;
  for (let i = 0; i < C.length; i++) { const a = C[i], c = C[(i + 1) % C.length]; side(a, c, Math.abs(a.y - y0) < 1e-6 && Math.abs(c.y - y0) < 1e-6); }
  for (const h of T.holes) for (let i = 0; i < h.length; i++) side(h[i], h[(i + 1) % h.length], false);
}
