// Web Worker: sculpts the Great Sphinx as a signed distance field and meshes
// it with naive surface nets.  Local frame: x forward (east), y up, z south;
// origin = middle of the body at floor level.  Self-contained (no imports).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); }
function smax(a, b, k) { return -smin(-a, -b, k); }
function box(px, py, pz, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r, qz = Math.abs(pz - cz) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function ell(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt(x * x / (rx * rx) + y * y / (ry * ry) + z * z / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
function cap(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  return mix(mix(mix(a, b, u), mix(c, d, u), v), mix(mix(e, f, u), mix(g, h, u), v), w);
}
function fbm(x, y, z, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }

// ------------------------------------------------------------------ shape --
function base(x, y, z, built) {
  const az = Math.abs(z);
  // torso (lion body), slightly tapering at the waist
  let d = box(x, y, z, -8.5, 6.0, 0, 26.5, 5.6, 5.7 - 0.6 * Math.exp(-((x + 6) * (x + 6)) / 120), 2.6);
  // shoulders and chest
  d = smin(d, ell(x, y, z, 14.5, 7.6, 0, 6.6, 6.6, 6.5), 2.5);
  // haunches (folded hind legs)
  d = smin(d, ell(x, y, az, -27.5, 4.4, 5.2, 8.6, 4.8, 3.4), 2.0);
  d = smin(d, ell(x, y, az, -19, 1.9, 6.6, 6.5, 1.9, 1.6), 1.2);           // hind paws tucked forward
  // front legs and paws
  d = smin(d, box(x, y, az, 21.5, 2.4, 4.4, 9.0, 2.4, 1.75, 0.9), 1.6);
  d = smin(d, box(x, y, az, 31.5, 1.2, 4.4, 5.0, 1.2, 1.85, 0.6), 0.8);
  // toes
  for (const tz of [-1.0, -0.35, 0.35, 1.0]) d = smin(d, ell(x, y, az, 36.2, 0.85, 4.4 + tz * 1.25, 0.7, 0.8, 0.42), 0.25);
  // neck
  d = smin(d, cap(x, y, z, 17.5, 10.5, 0, 20.5, 14.0, 0, 2.7), 1.5);
  // head: skull, face, headdress (nemes) with lappets
  let h = ell(x, y, z, 21.3, 16.9, 0, 3.4, 3.4, 2.35);
  h = smin(h, box(x, y, z, 23.5, 15.2, 0, 1.0, 2.55, 2.05, 0.65), 0.6);                 // face block
  h = smin(h, ell(x, y, z, 20.6, 18.4, 0, 3.7, 1.95, 3.35), 0.8);                       // nemes crown
  const lapW = 0.55 + clamp((17.5 - y) / 6.5, 0, 1) * 0.55;                              // flaring lappets
  h = smin(h, box(x, y, az, 21.9, 14.3, 2.95 + (17.5 - y) * 0.08, 1.35, 3.6, lapW, 0.35), 0.5);
  h = smin(h, ell(x, y, az, 22.85, 15.9, 2.42, 0.55, 1.05, 0.35), 0.2);                 // ears
  // brow and cheeks
  h = smin(h, ell(x, y, z, 24.1, 16.6, 0, 0.45, 0.35, 1.7), 0.3);
  if (built) h = smin(h, ell(x, y, z, 24.75, 15.15, 0, 0.55, 0.85, 0.5), 0.25);         // nose (intact)
  // eyes and mouth
  h = smax(h, -ell(x, y, az, 24.45, 16.05, 1.0, 0.35, 0.22, 0.55), 0.15);
  h = smax(h, -box(x, y, z, 24.6, 13.95, 0, 0.35, 0.07, 1.05, 0.04), 0.08);
  // nemes stripes
  const onNemes = az > 2.2 || y > 17.8;
  if (onNemes) h += (built ? 0.05 : 0.03) * Math.sin(y * 9.5 + (az > 2.2 ? 0 : x * 1.5));
  d = smin(d, h, 0.9);
  return d;
}

function sdf(x, y, z, built) {
  let d = base(x, y, z, built);
  if (d > 1.6 || d < -1.6) return Math.max(d, -y - 0.6);
  if (!built) {
    // soft Member II limestone (the body's middle layers) is deeply eroded
    const m2 = clamp((y - 2.2) / 0.8, 0, 1) * clamp((9.8 - y) / 0.8, 0, 1) * (y < 11 ? 1 : 0) * (x < 18.5 ? 1 : 0.35);
    const grooves = 0.5 + 0.5 * Math.sin(y * 4.6 + fbm(x * 0.15, y * 0.4, z * 0.15, 2) * 4.0);
    d += m2 * (0.35 + 0.45 * grooves);
    // rough weathering everywhere, gentler on the hard head layer
    const k = y > 11.5 && x > 15 ? 0.12 : 0.3;
    d += (fbm(x * 0.55, y * 0.55, z * 0.55, 3) - 0.5) * k;
    // missing nose: a flat broken scar
    d = Math.max(d, -box(x, y, z, 25.1, 15.0, 0, 0.65, 0.95, 0.75, 0.05));
    // fissure across the body
    d = Math.max(d, -box(x, y, z, -9.5, 9.5, 0, 0.18, 2.5, 7, 0.05));
    // lower body: restored masonry casing, slightly proud
    if (y < 3.2 && x < 30) d -= 0.12;
  } else {
    d += (fbm(x * 0.6, y * 0.6, z * 0.6, 2) - 0.5) * 0.04;
  }
  return Math.max(d, -y - 0.6);
}

// --------------------------------------------------------------- mesher --
function build(built, res) {
  const x0 = -38, x1 = 38.5, y0 = -0.6, y1 = 21.2, z0 = -9.2, z1 = 9.2;
  const nx = Math.ceil((x1 - x0) / res) + 1, ny = Math.ceil((y1 - y0) / res) + 1, nz = Math.ceil((z1 - z0) / res) + 1;
  const F = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    F[idx(i, j, k)] = sdf(x0 + i * res, y0 + j * res, z0 + k * res, built);
  }
  const vIndex = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = F[idx(i + C[c][0], j + C[c][1], k + C[c][2])]; val[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      const va = val[a], vb = val[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    vIndex[idx(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * res, y0 + (j + sy / n) * res, z0 + (k + sz / n) * res);
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F[idx(i, j, k)] < 0;
    if (i < nx - 1 && (F[idx(i + 1, j, k)] < 0) !== v0) {
      quad(vIndex[idx(i, j - 1, k - 1)], vIndex[idx(i, j, k - 1)], vIndex[idx(i, j, k)], vIndex[idx(i, j - 1, k)], !v0);
    }
    if (j < ny - 1 && (F[idx(i, j + 1, k)] < 0) !== v0) {
      quad(vIndex[idx(i - 1, j, k - 1)], vIndex[idx(i - 1, j, k)], vIndex[idx(i, j, k)], vIndex[idx(i, j, k - 1)], !v0);
    }
    if (k < nz - 1 && (F[idx(i, j, k + 1)] < 0) !== v0) {
      quad(vIndex[idx(i - 1, j - 1, k)], vIndex[idx(i, j - 1, k)], vIndex[idx(i, j, k)], vIndex[idx(i - 1, j, k)], !v0);
    }
  }
  const nv = pos.length / 3;
  const P = new Float32Array(pos), N = new Float32Array(nv * 3), Col = new Float32Array(nv * 3);
  const e = res * 0.5;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let gx = sdf(x + e, y, z, built) - sdf(x - e, y, z, built);
    let gy = sdf(x, y + e, z, built) - sdf(x, y - e, z, built);
    let gz = sdf(x, y, z + e, built) - sdf(x, y, z - e, built);
    const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
    // ambient occlusion from the distance field
    let occ = 0;
    for (const [dd, w] of [[0.35, 0.5], [0.9, 0.3], [1.8, 0.2], [3.4, 0.12]]) {
      const s = sdf(x + gx * dd, y + gy * dd, z + gz * dd, built);
      occ += w * Math.max(0, dd - s) / dd;
    }
    const ao = clamp(1 - occ * 1.25, 0.25, 1);
    // geological banding: Member I (dark, lower), II (yellow, banded), III (pale head)
    let r, g, b;
    if (y < 2.2) { r = 0.78; g = 0.68; b = 0.54; }
    else if (y < 10) {
      const band = 0.5 + 0.5 * Math.sin(y * 4.6 + fbm(x * 0.15, y * 0.4, z * 0.15, 2) * 4.0);
      r = mix(0.9, 0.78, band); g = mix(0.78, 0.66, band); b = mix(0.56, 0.48, band);
    } else { r = 0.93; g = 0.84; b = 0.66; }
    if (!built && y < 3.2 && x < 30) {
      // restored casing blocks
      const bx = Math.floor((x + z * 0.3) / 1.3), by = Math.floor(y / 0.55);
      const t = 0.88 + hash3(bx, by, 7) * 0.2;
      r = 0.95 * t; g = 0.88 * t; b = 0.74 * t;
    }
    if (built) { r = mix(r, 0.95, 0.3); g = mix(g, 0.87, 0.3); b = mix(b, 0.72, 0.3); }
    const vv = 0.92 + fbm(x * 0.9, y * 0.9, z * 0.9, 2) * 0.16;
    Col[v * 3] = r * ao * vv; Col[v * 3 + 1] = g * ao * vv; Col[v * 3 + 2] = b * ao * vv;
  }
  // make the winding agree with the outward SDF normals
  let agree = 0;
  for (let t = 0; t < Math.min(tris.length, 3000); t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    agree += Math.sign(cx * N[a] + cy * N[a + 1] + cz * N[a + 2]);
  }
  if (agree < 0) for (let t = 0; t < tris.length; t += 3) { const tmp = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = tmp; }
  const I = nv > 65535 ? new Uint32Array(tris) : new Uint16Array(tris);
  return { P, N, Col, I };
}

self.onmessage = (e) => {
  const { built, res } = e.data;
  const out = build(built, res);
  self.postMessage({ built, ...out }, [out.P.buffer, out.N.buffer, out.Col.buffer, out.I.buffer]);
};
