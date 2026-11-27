// Elevation models and ground meshes.
//
// Heightmaps are 8-bit RGB PNGs written by tools/gen_terrain.py:
//     v = round((elevation_asl_m + 20) * 400)   ->  R = v >> 8, G = v & 255
// covering a square of `size` metres centred on (cx, cz) in world x/z.
// World y = elevation above sea level - baseASL.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

export class HeightField {
  constructor({ cx, cz, size, baseASL = 0 }) {
    Object.assign(this, { cx, cz, size, baseASL });
    this.data = null; this.res = 0;
  }

  async load(url) {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, img.width, img.height).data;
    const n = img.width;
    this.data = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) this.data[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 400 - 20 - this.baseASL;
    this.res = n;
    return this;
  }

  // raw elevation (world y), bilinear
  at(x, z) {
    const n = this.res, step = this.size / n;
    let fx = (x - (this.cx - this.size / 2)) / step - 0.5;
    let fz = (z - (this.cz - this.size / 2)) / step - 0.5;
    fx = clamp(fx, 0, n - 1.001); fz = clamp(fz, 0, n - 1.001);
    const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    const d = this.data, i = z0 * n + x0;
    return (d[i] * (1 - tx) + d[i + 1] * tx) * (1 - tz) + (d[i + n] * (1 - tx) + d[i + n + 1] * tx) * tz;
  }
}

// Grid lines from min to max: `fine` spacing between f0 and f1, growing
// steadily coarser (to at most 70 m) outside that band.
export function gridLines(min, max, f0, f1, fine) {
  const out = [];
  let x = f0;
  const left = [];
  let s = fine;
  while (x > min) { s = Math.min(s * 1.12, 70); x -= s; left.push(Math.max(x, min)); if (x <= min) break; }
  left.reverse().forEach((v) => out.push(v));
  for (x = f0; x <= f1; x += fine) out.push(x);
  s = fine; x = out[out.length - 1];
  while (x < max) { s = Math.min(s * 1.12, 70); x += s; out.push(Math.min(x, max)); if (x >= max) break; }
  return out.filter((v, i, a) => i === 0 || v - a[i - 1] > 0.01);
}

// Indexed ground mesh over the grid xs × zs.
export function gridGeometry(xs, zs, heightAt) {
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3;
    pos[k] = xs[i]; pos[k + 2] = zs[j]; pos[k + 1] = heightAt(xs[i], zs[j]);
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// A skirt from the edge of the grid out to the horizon: each edge point runs
// out radially from `center` to 2.5 km, then 26 km, sinking to yFar(x, z).
export function skirtGeometry(xs, zs, heightAt, { center, yFar }) {
  const nx = xs.length, nz = zs.length;
  const edge = [];
  for (let i = 0; i < nx; i++) edge.push([xs[i], zs[0]]);
  for (let j = 1; j < nz; j++) edge.push([xs[nx - 1], zs[j]]);
  for (let i = nx - 2; i >= 0; i--) edge.push([xs[i], zs[nz - 1]]);
  for (let j = nz - 2; j > 0; j--) edge.push([xs[0], zs[j]]);
  const step = Math.max(1, Math.floor(edge.length / 400));
  const ePts = edge.filter((_, i) => i % step === 0);
  const sp = [], si = [];
  ePts.forEach(([x, z], i) => {
    const y = heightAt(x, z);
    const ang = Math.atan2(z - center[1], x - center[0]);
    const far = [x + Math.cos(ang) * 26000, z + Math.sin(ang) * 26000];
    const mid = [x + Math.cos(ang) * 2500, z + Math.sin(ang) * 2500];
    const yf = yFar(x, z);
    sp.push(x, y - 0.05, z, mid[0], lerp(y, yf, 0.5), mid[1], far[0], yf, far[1]);
    const k = i * 3, k2 = ((i + 1) % ePts.length) * 3;
    si.push(k, k + 1, k2, k2, k + 1, k2 + 1, k + 1, k + 2, k2 + 1, k2 + 1, k + 2, k2 + 2);
  });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setIndex(si);
  sg.computeVertexNormals();
  const nrm = sg.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return sg;
}
