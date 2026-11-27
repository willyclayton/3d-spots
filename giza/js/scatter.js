// Ground clutter and vegetation: loose stones over the plateau, rubble
// around the ruined tombs and temples, and date palms in the Nile valley.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, fbm2, smoothstep, clamp } from '../../shared/engine/util.js';
import { Mats } from './materials.js';
import { SPHINX } from './data/site.js';

export function rockGeometry(seed = 4, detail = 0) {
  const base = new THREE.IcosahedronGeometry(0.5, detail);
  base.deleteAttribute('normal');
  const merged = BufferGeometryUtils.mergeVertices(base);
  const pa = merged.attributes.position;
  const r0 = mulberry32(seed);
  for (let i = 0; i < pa.count; i++) {
    const f = 0.7 + r0() * 0.55;
    pa.setXYZ(i, pa.getX(i) * f * 1.2, pa.getY(i) * f * 0.7, pa.getZ(i) * f);
  }
  const g = merged.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

// Loose stones on the plateau and rubble heaped around ruins (today only).
export function buildScatter(terrain, { blocked, ruins, quality = 'high' }) {
  const k = quality === 'low' ? 0.3 : quality === 'medium' ? 0.55 : 1;
  const rnd = mulberry32(911);
  const geo = rockGeometry(7, 0);
  const mat = Mats.rubble();
  const max = Math.round(15000 * k);
  const im = new THREE.InstancedMesh(geo, mat, max);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  const E = SPHINX.enclosure;
  const isBlocked = (x, z, m = 0.6) => {
    if (x > E.x0 - 2 && x < E.x1 + 2 && z > E.z0 - 2 && z < E.z1 + 2) return true;
    for (const b of blocked) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true;
    return false;
  };
  const place = (x, z, size, flat = 0.65) => {
    if (n >= max) return;
    const y = terrain.heightAt(x, z);
    p.set(x, y + size * 0.12, z);
    e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5); q.setFromEuler(e);
    sc.set(size * (0.8 + rnd() * 0.5), size * (flat + rnd() * 0.3), size * (0.8 + rnd() * 0.5));
    m4.compose(p, q, sc); im.setMatrixAt(n, m4);
    const r = rnd();
    const flint = r < 0.05;
    const v = flint ? 0.6 + rnd() * 0.15 : 0.9 + rnd() * 0.25;          // a few darker flints
    col.setRGB(v, v * 0.96, v * (flint ? 0.92 : 0.88));
    im.setColorAt(n, col);
    n++;
  };
  // rubble around ruined walls and tombs
  for (const r of ruins) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w * d < 3) continue;
    const per = 2 * (w + d);
    const cnt = Math.min(28, Math.round(per / 3.2 * k));
    for (let i = 0; i < cnt; i++) {
      const t = rnd() * per;
      let x, z;
      const off = 0.3 + Math.pow(rnd(), 1.5) * 2.6;
      if (t < w) { x = r.x0 + t; z = r.z0 - off; }
      else if (t < w + d) { x = r.x1 + off; z = r.z0 + (t - w); }
      else if (t < 2 * w + d) { x = r.x1 - (t - w - d); z = r.z1 + off; }
      else { x = r.x0 - off; z = r.z1 - (t - 2 * w - d); }
      if (terrain.isRoad(x, z)) continue;
      place(x, z, 0.18 + Math.pow(rnd(), 2) * 0.75, 0.55);
    }
  }
  // loose stones across the desert, clustered, thicker near the monuments
  let tries = 0;
  while (n < max && tries < max * 8) {
    tries++;
    const x = -1050 + rnd() * 1800, z = -520 + rnd() * 1770;
    const cl = fbm2(x * 0.012, z * 0.012, 3, 77);
    let pAcc = smoothstep(0.42, 0.72, cl) * 0.8;
    const dK = Math.max(Math.abs(x) - 115, Math.abs(z) - 115), dKh = Math.max(Math.abs(x + 340) - 108, Math.abs(z - 340) - 108);
    if (Math.min(dK, dKh) < 70) pAcc += 0.35;
    if (rnd() > pAcc) continue;
    if (terrain.zoneAt(x, z) > 0.15 || terrain.isRoad(x, z) || isBlocked(x, z)) continue;
    place(x, z, 0.07 + Math.pow(rnd(), 3.2) * 1.0);
  }
  im.count = n;
  im.castShadow = true; im.receiveShadow = true;
  im.computeBoundingSphere();
  im.name = 'scatter';
  return im;
}

// --------------------------------------------------------------- palms ---
function frondTexture() {
  const W = 256, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);
  // bark strip (u < 0.125)
  const g = c.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, '#5a4630'); g.addColorStop(0.5, '#7b6244'); g.addColorStop(1, '#594431');
  c.fillStyle = g; c.fillRect(0, 0, 32, H);
  c.strokeStyle = 'rgba(40,28,18,.55)'; c.lineWidth = 3;
  for (let y = 6; y < H; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(32, y + 5); c.stroke(); }
  // frond: rib up the middle of u in [0.125, 1], leaflets angled forward
  const cx = 32 + (W - 32) / 2;
  const rand = mulberry32(3);
  for (let y = H - 10; y > 8; y -= 6) {
    const t = 1 - y / H;                                  // 0 at base, 1 at tip
    const len = (W - 32) / 2 * (0.25 + 0.75 * Math.sin(Math.PI * clamp(t * 1.05, 0, 1))) * (0.85 + rand() * 0.2);
    for (const s of [-1, 1]) {
      const gr = 60 + Math.floor(rand() * 40), rr = 70 + Math.floor(rand() * 40);
      c.strokeStyle = `rgb(${rr},${gr + 50},${30 + Math.floor(rand() * 25)})`;
      c.lineWidth = 4 + rand() * 2;
      c.beginPath(); c.moveTo(cx, y); c.lineTo(cx + s * len, y - len * 0.55); c.stroke();
    }
  }
  c.strokeStyle = '#6b5a32'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(cx, H); c.lineTo(cx, 0); c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function palmGeometry() {
  const parts = [];
  // trunk, unit height, slight taper; uv in the bark strip
  const trunk = new THREE.CylinderGeometry(0.018, 0.028, 1, 7, 4, true);
  trunk.translate(0, 0.5, 0);
  const uv = trunk.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.12, uv.getY(i) * 6);
  parts.push(trunk);
  // fronds
  const nF = 15, segs = 5;
  for (let f = 0; f < nF; f++) {
    const ang = (f / nF) * Math.PI * 2 + (f % 2) * 0.2;
    const lift = (f % 3) * 0.06 - 0.02;
    const L = 0.34 + (f % 4) * 0.025;
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = t * L;
      const y = 1.0 + (Math.sin(t * Math.PI * 0.85) * (0.07 + lift) - t * t * 0.2) * L * 2.2;
      const w = 0.085 * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)));
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const px = ca * r, pz = sa * r;
      const tx = -sa * w, tz = ca * w;
      pos.push(px - tx, y + 0.01, pz - tz, px + tx, y + 0.01, pz + tz);
      uvs.push(0.13, t, 1.0, t);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  }
  const all = parts.map((g) => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('normal'); return q; });
  const merged = BufferGeometryUtils.mergeGeometries(all, false);
  merged.computeVertexNormals();
  return merged;
}

export function buildPalms(terrain, { quality = 'high' } = {}) {
  const k = quality === 'low' ? 0.35 : quality === 'medium' ? 0.65 : 1;
  const rnd = mulberry32(5150);
  const geo = palmGeometry();
  const mat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const make = (count, accept) => {
    const im = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let n = 0, tries = 0;
    while (n < count && tries < count * 60) {
      tries++;
      const x = 250 + rnd() * 2300, z = -1700 + rnd() * 4300;
      if (!accept(x, z)) continue;
      const H = 9 + rnd() * 8;
      const y = terrain.heightAt(x, z, false) - 0.3;
      p.set(x, y, z);
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.12, rnd() * 6.28, (rnd() - 0.5) * 0.12));
      s.set(H, H, H);
      m4.compose(p, q, s); im.setMatrixAt(n, m4);
      const v = 0.8 + rnd() * 0.3; col.setRGB(v, v, v * (0.9 + rnd() * 0.15)); im.setColorAt(n, col);
      n++;
    }
    im.count = n; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    return im;
  };
  // today: palms among the houses near the plateau edge
  const today = make(Math.round(420 * k), (x, z) => {
    const zn = terrain.zoneAt(x, z);
    if (zn < 0.55) return false;
    const d = Math.hypot(x - 430, z - 250);
    if (d > 1300) return false;
    return fbm2(x * 0.008, z * 0.008, 2, 41) > 0.52 && rnd() < 0.5;
  });
  // 2560 BCE: groves on the levees just above the flood
  const built = make(Math.round(1100 * k), (x, z) => {
    const zn = terrain.zoneAt(x, z);
    if (zn < 0.35) return false;
    const h = terrain.heightAt(x, z, false);
    if (h < -40.9 || h > -35) return false;
    return fbm2(x * 0.01, z * 0.01, 2, 43) > 0.46;
  });
  today.name = 'palms-today'; built.name = 'palms-built'; built.visible = false;
  return { today, built };
}
