// Interior builder.
//
// Every chamber / passage / shaft is a prism: a convex 2-D profile extruded
// along x or z (pyramid-local coordinates: x east, y up from the base, z south).
//   axis 'x': profile in (z, y), extruded over x in [a0, a1]  (N–S passages)
//   axis 'z': profile in (x, y), extruded over z in [a0, a1]  (E–W passages)
// Faces point INTO the room.  Wherever two rooms touch, their coplanar facing
// walls are subtracted from each other (polygon booleans), which opens every
// doorway, shaft mouth and junction automatically.  The same prisms give the
// cross-section holes and the walkable volumes.
import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { GeoBuilder, polyNormal } from '../../../shared/engine/geo.js';

// ------------------------------------------------------------- shapes ----
export function nsPassage(id, { x, w, z0, y0, z1, y1, h, vertical = false, ...rest }) {
  if (z1 < z0) [z0, y0, z1, y1] = [z1, y1, z0, y0];
  const ang = Math.atan2(y1 - y0, z1 - z0);
  const hv = vertical ? h : h / Math.cos(ang);
  return { id, axis: 'x', a0: x - w / 2, a1: x + w / 2, profile: [[z0, y0], [z1, y1], [z1, y1 + hv], [z0, y0 + hv]], ...rest };
}
export function ewPassage(id, { z, w, x0, y0, x1, y1, h, vertical = false, ...rest }) {
  if (x1 < x0) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const hv = vertical ? h : h / Math.cos(ang);
  return { id, axis: 'z', a0: z - w / 2, a1: z + w / 2, profile: [[x0, y0], [x1, y1], [x1, y1 + hv], [x0, y0 + hv]], ...rest };
}
// gable: 'x' = ridge runs east–west, 'z' = ridge runs north–south
export function room(id, { x0, x1, y0, y1, z0, z1, gable = null, rise = 0, ...rest }) {
  if (gable === 'z') {
    const xm = (x0 + x1) / 2;
    return { id, axis: 'z', a0: z0, a1: z1, profile: [[x0, y0], [x1, y0], [x1, y1], [xm, y1 + rise], [x0, y1]], ...rest };
  }
  const zm = (z0 + z1) / 2;
  const prof = gable === 'x'
    ? [[z0, y0], [z1, y0], [z1, y1], [zm, y1 + rise], [z0, y1]]
    : [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];
  return { id, axis: 'x', a0: x0, a1: x1, profile: prof, ...rest };
}
export function prism(id, axis, a0, a1, profile, rest = {}) { return { id, axis, a0, a1, profile: ccw(profile), ...rest }; }
export function ccw(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
  return a < 0 ? p.slice().reverse() : p;
}

// --------------------------------------------------------- geometry ------
function to3(axis, s, y, a) { return axis === 'x' ? [a, y, s] : [s, y, a]; }

function elementFaces(el) {
  const P = el.profile, faces = [];
  const omit = new Set(el.omit || []);
  const n = P.length;
  // caps
  const capNormal = el.axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  if (!omit.has('a0')) faces.push({ pts: P.map(([s, y]) => to3(el.axis, s, y, el.a0)), n: capNormal.slice(), el, kind: 'wall' });
  if (!omit.has('a1')) faces.push({ pts: P.map(([s, y]) => to3(el.axis, s, y, el.a1)).reverse(), n: capNormal.map((v) => -v), el, kind: 'wall' });
  for (let i = 0; i < n; i++) {
    if (omit.has(i)) continue;
    const [s0, y0] = P[i], [s1, y1] = P[(i + 1) % n];
    const ds = s1 - s0, dy = y1 - y0, L = Math.hypot(ds, dy);
    if (L < 1e-6) continue;
    const nl = [-dy / L, ds / L];                          // left normal = inward
    const nn = el.axis === 'x' ? [0, nl[1], nl[0]] : [nl[0], nl[1], 0];
    const pts = [to3(el.axis, s0, y0, el.a0), to3(el.axis, s1, y1, el.a0), to3(el.axis, s1, y1, el.a1), to3(el.axis, s0, y0, el.a1)];
    const kind = nn[1] > 0.6 ? 'floor' : nn[1] < -0.6 ? 'ceil' : 'wall';
    faces.push({ pts, n: nn, el, kind });
  }
  for (const f of faces) {
    const pn = polyNormal(f.pts);
    if (pn && pn[0] * f.n[0] + pn[1] * f.n[1] + pn[2] * f.n[2] < 0) f.pts.reverse();
    f.d = f.n[0] * f.pts[0][0] + f.n[1] * f.pts[0][1] + f.n[2] * f.pts[0][2];
  }
  return faces;
}

function basisOf(f) {
  const o = new THREE.Vector3(...f.pts[0]);
  const u = new THREE.Vector3(...f.pts[1]).sub(o).normalize();
  const n = new THREE.Vector3(...f.n);
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { o, u, v, n };
}
const proj = (b, p) => {
  const dx = p[0] - b.o.x, dy = p[1] - b.o.y, dz = p[2] - b.o.z;
  return [dx * b.u.x + dy * b.u.y + dz * b.u.z, dx * b.v.x + dy * b.v.y + dz * b.v.z];
};
const ring = (pts) => { const r = pts.map((p) => [p[0], p[1]]); r.push(r[0].slice()); return r; };

// Build render geometry for a list of elements.  matKey(el, face) -> material key
export function buildRooms(elements, { colorFor } = {}) {
  const faces = [];
  for (const el of elements) if (!el.virtual) faces.push(...elementFaces(el));
  const builders = {};
  for (const F of faces) {
    const b = basisOf(F);
    const subj = [ring(F.pts.map((p) => proj(b, p)))];
    const clips = [];
    for (const G of faces) {
      if (G === F || G.el === F.el) continue;
      const dot = F.n[0] * G.n[0] + F.n[1] * G.n[1] + F.n[2] * G.n[2];
      if (dot > -0.999) continue;
      const dist = F.n[0] * G.pts[0][0] + F.n[1] * G.pts[0][1] + F.n[2] * G.pts[0][2] - F.d;
      if (Math.abs(dist) > 0.004) continue;
      clips.push([ring(G.pts.map((p) => proj(b, p)))]);
    }
    for (const o of F.el.cut || []) {
      // explicit openings given as world-space polygons lying in this plane
      const dist = F.n[0] * o[0][0] + F.n[1] * o[0][1] + F.n[2] * o[0][2] - F.d;
      if (Math.abs(dist) < 0.01) clips.push([ring(o.map((p) => proj(b, p)))]);
    }
    let result = [subj];
    if (clips.length) {
      try { result = polygonClipping.difference(subj, ...clips); } catch (e) { result = [subj]; }
    }
    const key = F.el.mat || 'lime';
    const gb = builders[key] || (builders[key] = new GeoBuilder());
    const c = colorFor ? colorFor(F) : F.kind === 'floor' ? [0.82, 0.78, 0.72] : F.kind === 'ceil' ? [0.72, 0.7, 0.68] : [1, 1, 1];
    for (const poly of result) {
      const outer = poly[0].slice(0, -1);
      const holes = poly.slice(1).map((h) => h.slice(0, -1));
      if (outer.length < 3) continue;
      gb.polyHoles(outer, holes, b, c, 1);
    }
  }
  const out = {};
  for (const [k, gb] of Object.entries(builders)) if (gb.count) out[k] = gb.build();
  return out;
}

// ---------------------------------------------------------- sections -----
// Cross-section of the rooms by the plane x=c (axis 'x') or z=c (axis 'z'),
// as polygons in (s, y) where s = z (plane x) or s = x (plane z).
export function sectionPolys(elements, plane, c) {
  const polys = [];
  for (const el of elements) {
    if (el.noSection) continue;
    if (el.axis === plane) {
      if (c > el.a0 + 1e-4 && c < el.a1 - 1e-4) polys.push(el.profile.map((p) => [p[0], p[1]]));
    } else {
      // profile coordinate s along this plane's normal; find y-range at s=c
      const yr = profileRangeAt(el.profile, c);
      if (!yr) continue;
      polys.push([[el.a0, yr[0]], [el.a1, yr[0]], [el.a1, yr[1]], [el.a0, yr[1]]]);
    }
  }
  return polys;
}

export function profileRangeAt(profile, s) {
  let lo = Infinity, hi = -Infinity;
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const [s0, y0] = profile[i], [s1, y1] = profile[(i + 1) % n];
    if ((s0 - s) * (s1 - s) > 0) continue;
    if (Math.abs(s1 - s0) < 1e-9) { lo = Math.min(lo, y0, y1); hi = Math.max(hi, y0, y1); continue; }
    const t = (s - s0) / (s1 - s0);
    const y = y0 + (y1 - y0) * t;
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return hi > lo + 1e-4 ? [lo, hi] : null;
}

// ------------------------------------------------------- walk volumes ----
// Each walkable prism becomes a volume in pyramid-local space.
export function walkVolumes(elements) {
  const vols = [];
  for (const el of elements) {
    if (!el.walk) continue;
    let smin = Infinity, smax = -Infinity;
    el.profile.forEach(([s]) => { smin = Math.min(smin, s); smax = Math.max(smax, s); });
    vols.push({ el, axis: el.axis, a0: el.a0, a1: el.a1, smin, smax, profile: el.profile, floorOffset: el.floorOffset || 0 });
  }
  return vols;
}
