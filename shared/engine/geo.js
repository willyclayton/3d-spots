// Polygon-soup geometry builder: flat-shaded faces with world-planar UVs
// (UV units are metres; set texture.repeat = 1/tileSize) and vertex colours.
import * as THREE from 'three';
import { FloatBuf } from './util.js';

export class GeoBuilder {
  constructor() {
    this.pos = new FloatBuf(1 << 14);
    this.nor = new FloatBuf(1 << 14);
    this.uv = new FloatBuf(1 << 13);
    this.col = new FloatBuf(1 << 14);
    this.aux = new FloatBuf(1 << 14);
    this.uvOff = [0, 0];   // per-face texture offset (set before poly())
    this.useAux = false;
  }

  get count() { return this.pos.n / 3; }

  _uv(p, n, uvScale) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (ay >= ax && ay >= az) return [p[0] * uvScale, p[2] * uvScale];
    if (ax >= az) return [p[2] * uvScale * Math.sign(n[0] || 1), p[1] * uvScale];
    return [-p[0] * uvScale * Math.sign(n[2] || 1), p[1] * uvScale];
  }

  vert(p, n, c, uvScale = 1, uvOverride = null, aux = null) {
    if (aux) { this.aux.push(aux[0], aux[1], aux[2]); this.useAux = true; }
    else this.aux.push(1, 1, 1);
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    const uv = uvOverride || this._uv(p, n, uvScale);
    this.uv.push(uv[0] + this.uvOff[0], uv[1] + this.uvOff[1]);
    const cc = typeof c === 'function' ? c(p) : c;
    this.col.push(cc[0], cc[1], cc[2]);
  }

  // Convex (or star-shaped from v0) polygon, fan-triangulated.  pts in CCW
  // order as seen from the side the normal points to.
  // aux: optional per-vertex vec3 (array parallel to pts)
  poly(pts, n, c = [1, 1, 1], uvScale = 1, aux = null) {
    if (pts.length < 3) return;
    const pn = polyNormal(pts);
    if (!pn) return;                       // degenerate
    if (!n) n = pn;
    else if (pn[0] * n[0] + pn[1] * n[1] + pn[2] * n[2] < 0) {
      pts = pts.slice().reverse();
      if (aux) aux = aux.slice().reverse();
    }
    for (let i = 1; i < pts.length - 1; i++) {
      this.vert(pts[0], n, c, uvScale, null, aux && aux[0]);
      this.vert(pts[i], n, c, uvScale, null, aux && aux[i]);
      this.vert(pts[i + 1], n, c, uvScale, null, aux && aux[i + 1]);
    }
  }

  tri(a, b, c, n, col = [1, 1, 1], uvScale = 1) { this.poly([a, b, c], n, col, uvScale); }

  // Planar polygon with holes given in a 2D basis.  basis: {o,u,v,n} (THREE.Vector3)
  // outer/holes: arrays of [s,t].  Orientation is fixed automatically so the
  // face points along basis.n.
  polyHoles(outer, holes, basis, c = [1, 1, 1], uvScale = 1) {
    const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
    const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    hs.forEach((h) => { if (!THREE.ShapeUtils.isClockWise(h)) h.reverse(); });
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, hs); } catch (e) { return; }
    const all = contour.concat(...hs);
    const to3 = (q) => [
      basis.o.x + basis.u.x * q.x + basis.v.x * q.y,
      basis.o.y + basis.u.y * q.x + basis.v.y * q.y,
      basis.o.z + basis.u.z * q.x + basis.v.z * q.y,
    ];
    // check basis handedness: u x v should equal n
    const cr = new THREE.Vector3().crossVectors(basis.u, basis.v);
    const flip = cr.dot(basis.n) < 0;
    const n = [basis.n.x, basis.n.y, basis.n.z];
    for (const t of tris) {
      const a = to3(all[t[0]]), b = to3(all[t[1]]), d = to3(all[t[2]]);
      if (flip) { this.vert(a, n, c, uvScale); this.vert(d, n, c, uvScale); this.vert(b, n, c, uvScale); }
      else { this.vert(a, n, c, uvScale); this.vert(b, n, c, uvScale); this.vert(d, n, c, uvScale); }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.array(), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.array(), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.array(), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.array(), 3));
    g.setAttribute('aux', new THREE.BufferAttribute(this.aux.array(), 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function polyNormal(pts) {
  // Newell's method
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]);
    ny += (p[2] - q[2]) * (p[0] + q[0]);
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) return null;
  return [nx / l, ny / l, nz / l];
}

// Box helper (outward faces), for small props.
export function addBox(b, x0, y0, z0, x1, y1, z1, c = [1, 1, 1], uvScale = 1, skip = {}) {
  const P = (x, y, z) => [x, y, z];
  if (!skip.py) b.poly([P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], [0, 1, 0], c, uvScale);
  if (!skip.ny) b.poly([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], [0, -1, 0], c, uvScale);
  if (!skip.px) b.poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], [1, 0, 0], c, uvScale);
  if (!skip.nx) b.poly([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], [-1, 0, 0], c, uvScale);
  if (!skip.pz) b.poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], [0, 0, 1], c, uvScale);
  if (!skip.nz) b.poly([P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)], [0, 0, -1], c, uvScale);
}
