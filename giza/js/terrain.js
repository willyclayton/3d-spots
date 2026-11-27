// Terrain: real SRTM-derived elevation (see tools/gen_terrain.py) plus
// sculpted archaeology (levelled pyramid courts, the Sphinx enclosure,
// causeway beds, Khufu's quarry), textured with a splat shader.
import * as THREE from 'three';
import { fbm2, smoothstep, clamp, lerp, mulberry32 } from '../../shared/engine/util.js';
import { SITE, PYRAMIDS, SMALL_PYRAMIDS, SPHINX, COMPLEX } from './data/site.js';
import { TEX } from './materials.js';

const HM = { cx: -100, cz: 350, size: 5120, res: 512 };
const MASK = { x0: -1100, z0: -600, size: 1900, px: 2048 };

export class Terrain {
  constructor() {
    this.data = null;
    this.causeways = [
      { pts: COMPLEX.khafreCauseway, y0: 9.8, y1: -39.6, hw: 7.5, blend: 14 },
      { pts: COMPLEX.khufuCauseway, y0: 0, y1: -40.5, hw: 6.5, blend: 14 },
      { pts: COMPLEX.menkaureCauseway, y0: 7.8, y1: -33.5, hw: 6, blend: 12 },
    ].map((c) => ({ ...c, ...polyInfo(c.pts) }));
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
    for (let i = 0; i < n * n; i++) {
      this.data[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 400 - 20 - SITE.baseASL;
    }
    this.res = n;
    // Precompute flatten targets for temples that sit on natural ground
    this.pads = [];
    const P = PYRAMIDS;
    this.pads.push({ x0: COMPLEX.khufuTemple.x0 - 2, x1: COMPLEX.khufuTemple.x1 + 4, z0: COMPLEX.khufuTemple.z0 - 4, z1: COMPLEX.khufuTemple.z1 + 4, y: 0, blend: 16 });
    this.pads.push({ ...grow(COMPLEX.khafreTemple, 4), y: P.khafre.baseY - 0.2, blend: 18 });
    this.pads.push({ ...grow(COMPLEX.menkaureTemple, 4), y: P.menkaure.baseY - 0.3, blend: 16 });
    this.pads.push({ ...grow(COMPLEX.khafreValleyTemple, 6), y: -40.6, blend: 14 });
    this.pads.push({ ...grow(COMPLEX.sphinxTemple, 6), y: -40.6, blend: 14 });
    this.pads.push({ x0: 360, x1: 470, z0: 396, z1: 505, y: -40.8, blend: 30 });
    const mv = COMPLEX.menkaureValleyTemple;
    this.pads.push({ ...grow(mv, 5), y: this.dem((mv.x0 + mv.x1) / 2, (mv.z0 + mv.z1) / 2) - 1, blend: 16 });
    const kt = COMPLEX.khentkausTomb;
    this.pads.push({ ...grow(kt, 6), y: this.dem((kt.x0 + kt.x1) / 2, (kt.z0 + kt.z1) / 2) - 1.5, blend: 14 });
    for (const sp of SMALL_PYRAMIDS) {
      const h = sp.base / 2 + 5;
      this.pads.push({ x0: sp.cx - h, x1: sp.cx + h, z0: sp.cz - h, z1: sp.cz + h, y: sp.baseY, blend: 18 });
    }
  }

  // raw DEM (world y), bilinear
  dem(x, z) {
    const n = this.res, step = HM.size / n;
    let fx = (x - (HM.cx - HM.size / 2)) / step - 0.5;
    let fz = (z - (HM.cz - HM.size / 2)) / step - 0.5;
    fx = clamp(fx, 0, n - 1.001); fz = clamp(fz, 0, n - 1.001);
    const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    const d = this.data, i = z0 * n + x0;
    return (d[i] * (1 - tx) + d[i + 1] * tx) * (1 - tz) + (d[i + n] * (1 - tx) + d[i + n + 1] * tx) * tz;
  }

  // Final ground height (world y) incl. sculpting and fine detail.
  heightAt(x, z, detail = true) {
    let h = this.dem(x, z);
    let flat = 0; // 1 where the ground is man-made level

    // large pyramid courts
    for (const P of Object.values(PYRAMIDS)) {
      const half = P.base / 2;
      const d = Math.max(Math.abs(x - P.cx) - half, Math.abs(z - P.cz) - half);
      const m1 = P.id === 'menkaure' ? 14 : 22;
      const cut = h > P.baseY + 1.5;
      const m2 = cut ? (P.id === 'khafre' ? 9 : 22) : 60;
      if (d < m1 + m2) {
        const t = smoothstep(m1, m1 + m2, d);
        h = lerp(P.baseY, h, t);
        flat = Math.max(flat, 1 - t);
      }
    }
    for (const p of this.pads) {
      const d = Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1);
      if (d < p.blend) {
        const t = smoothstep(0, p.blend, d);
        h = lerp(p.y, h, t);
        flat = Math.max(flat, 1 - t);
      }
    }
    // causeway beds
    for (const c of this.causeways) {
      const q = closestOnPoly(c, x, z);
      if (q.d < c.hw + c.blend) {
        const y = lerp(c.y0, c.y1, easeCause(q.t));
        const t = smoothstep(c.hw, c.hw + c.blend, q.d);
        h = lerp(y, h, t);
        flat = Math.max(flat, 1 - t);
      }
    }
    // Khufu's quarry (Central Field), an irregular rock-cut basin
    {
      const qx = (x - 135) / 115, qz = (z - 262) / 78;
      const r = Math.sqrt(qx * qx + qz * qz) + (fbm2(x * 0.02, z * 0.02, 2, 9) - 0.5) * 0.35;
      if (r < 1.05) h -= 7.5 * (1 - smoothstep(0.75, 1.05, r));
    }
    // Sphinx enclosure: rim raised on N, W, S; floor levelled
    {
      const E = SPHINX.enclosure;
      const dOut = Math.max(E.x0 - x, x - E.x1, E.z0 - z, z - E.z1);
      if (x < E.x1 - 4 && dOut > -2 && dOut < 32) {
        const rim = Math.max(h, E.rim + (fbm2(x * 0.08, z * 0.08, 2, 4) - 0.5) * 2.5);
        h = lerp(rim, h, smoothstep(6, 32, dOut));
      }
      if (dOut < 2.0) {
        const t = smoothstep(-1.5, 2.0, dOut);
        h = lerp(SPHINX.baseY - 0.2, h, x > E.x1 - 6 ? smoothstep(-1, 8, dOut) : t);
        flat = Math.max(flat, 1 - t);
      }
    }
    if (detail) {
      const dune = (fbm2(x * 0.012, z * 0.012, 3, 21) - 0.5) * 0.9;
      const bumps = (fbm2(x * 0.09, z * 0.09, 3, 33) - 0.5) * 0.35;
      h += (dune + bumps) * (1 - flat * 0.9);
    }
    return h;
  }

  // ---------------------------------------------------------- mesh -------
  build(quality = 'high') {
    const fine = quality === 'low' ? 7 : quality === 'medium' ? 5 : 3.6;
    const xs = gridLines(-2560, 2380, -1050, 760, fine);
    const zs = gridLines(-2130, 2840, -520, 1240, fine);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = xs[i]; pos[k + 2] = zs[j]; pos[k + 1] = this.heightAt(xs[i], zs[j]);
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
    this.grid = { xs, zs };

    // distant skirt out to the horizon
    const ring = [];
    const edge = [];
    for (let i = 0; i < nx; i++) edge.push([xs[i], zs[0]]);
    for (let j = 1; j < nz; j++) edge.push([xs[nx - 1], zs[j]]);
    for (let i = nx - 2; i >= 0; i--) edge.push([xs[i], zs[nz - 1]]);
    for (let j = nz - 2; j > 0; j--) edge.push([xs[0], zs[j]]);
    const step = Math.max(1, Math.floor(edge.length / 400));
    const ePts = edge.filter((_, i) => i % step === 0);
    const sp = [], si = [];
    ePts.forEach(([x, z], i) => {
      const y = this.heightAt(x, z);
      const ang = Math.atan2(z - 350, x + 100);
      const far = [x + Math.cos(ang) * 26000, z + Math.sin(ang) * 26000];
      const mid = [x + Math.cos(ang) * 2500, z + Math.sin(ang) * 2500];
      const yFar = x > 300 ? -42 : -10;
      sp.push(x, y - 0.05, z, mid[0], lerp(y, yFar, 0.5), mid[1], far[0], yFar, far[1]);
      const k = i * 3, k2 = ((i + 1) % ePts.length) * 3;
      si.push(k, k + 1, k2, k2, k + 1, k2 + 1, k + 1, k + 2, k2 + 1, k2 + 1, k + 2, k2 + 2);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(si);
    sg.computeVertexNormals();
    const nrm = sg.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    return { geometry: g, skirt: sg };
  }

  // ------------------------------------------------------- splat masks ---
  buildMasks() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = MASK.px;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, MASK.px, MASK.px);
    const k = MASK.px / MASK.size;
    const tp = (x, z) => [(x - MASK.x0) * k, (z - MASK.z0) * k];
    ctx.globalCompositeOperation = 'lighter';
    const line = (pts, w, color, blur = 0) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = w * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (blur) ctx.filter = `blur(${blur * k}px)`;
      ctx.beginPath();
      pts.forEach((p, i) => { const [a, b] = tp(p[0], p[1]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.stroke(); ctx.restore();
    };
    const rect = (x0, z0, x1, z1, color, blur = 0) => {
      ctx.save(); ctx.fillStyle = color;
      if (blur) ctx.filter = `blur(${blur * k}px)`;
      const [a, b] = tp(x0, z0), [c, d] = tp(x1, z1);
      ctx.fillRect(a, b, c - a, d - b); ctx.restore();
    };
    const ell = (x, z, rx, rz, color, blur = 0) => {
      ctx.save(); ctx.fillStyle = color;
      if (blur) ctx.filter = `blur(${blur * k}px)`;
      const [a, b] = tp(x, z);
      ctx.beginPath(); ctx.ellipse(a, b, rx * k, rz * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    // ---- modern roads (red)
    const R = 'rgb(255,0,0)';
    ROADS.forEach((r) => line(r, 8.5, R, 0.6));
    rect(170, -150, 245, -95, 'rgb(200,0,0)', 2);       // Khufu north-east coach park
    rect(-700, 1300, -620, 1360, 'rgb(200,0,0)', 2);    // panorama terrace
    // ---- bedrock (green)
    for (const P of Object.values(PYRAMIDS)) {
      const h = P.base / 2;
      rect(P.cx - h - 16, P.cz - h - 16, P.cx + h + 16, P.cz + h + 16, 'rgb(0,120,0)', 8);
    }
    ell(135, 262, 112, 76, 'rgb(0,200,0)', 10);         // quarry
    const E = SPHINX.enclosure;
    rect(E.x0 - 4, E.z0 - 4, E.x1 + 2, E.z1 + 4, 'rgb(0,255,0)', 2);
    rect(-470, 200, -200, 240, 'rgb(0,140,0)', 10);       // Khafre's rock-cut trench (north)
    rect(-470, 220, -430, 470, 'rgb(0,140,0)', 10);       // and west
    // ---- pavement (blue)
    {
      const h = PYRAMIDS.khufu.base / 2;
      rect(-h - 10, -h - 11, h + 10, -h + 1, 'rgb(0,0,170)', 2);   // north pavement remains
      rect(h - 1, -h, h + 11, h, 'rgb(0,0,130)', 2);               // east
      const k2 = PYRAMIDS.khafre, h2 = k2.base / 2;
      rect(k2.cx - h2 - 12, k2.cz - h2 - 12, k2.cx + h2 + 12, k2.cz + h2 + 12, 'rgb(0,0,120)', 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(cv);
    t.flipY = false; t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    this.maskTex = t;

    // valley / urban zone, on the heightmap grid
    const n = this.res;
    const zone = new Uint8Array(n * n * 4);
    const step = HM.size / n;
    const tmp = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = HM.cx - HM.size / 2 + (i + 0.5) * step;
      const z = HM.cz - HM.size / 2 + (j + 0.5) * step;
      const asl = this.data[j * n + i] + SITE.baseASL;
      const low = smoothstep(33, 28, asl);
      const inside = insidePoly(SITE_POLY, x, z) ? 1 : 0;
      tmp[j * n + i] = low * (1 - inside);
    }
    // blur a little
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = clamp(i + di, 0, n - 1), jj = clamp(j + dj, 0, n - 1);
        s += tmp[jj * n + ii]; c++;
      }
      const v = s / c;
      zone[(j * n + i) * 4] = v * 255; zone[(j * n + i) * 4 + 3] = 255;
    }
    this.zoneData = tmp;
    const zt = new THREE.DataTexture(zone, n, n, THREE.RGBAFormat);
    zt.magFilter = THREE.LinearFilter; zt.minFilter = THREE.LinearFilter;
    zt.needsUpdate = true;
    this.zoneTex = zt;
  }

  // rectangular holes in the ground (pits, shafts, passage mouths)
  setHoles(list) {
    const U = this.uniforms;
    list.slice(0, 16).forEach((h, i) => { U.uHoles.value[i].set(h.cx, h.cz, h.hx, h.hz); U.uHoleAng.value[i] = h.ang || 0; });
  }

  zoneAt(x, z) {
    const n = this.res, step = HM.size / n;
    const i = Math.floor((x - (HM.cx - HM.size / 2)) / step), j = Math.floor((z - (HM.cz - HM.size / 2)) / step);
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    return this.zoneData[j * n + i];
  }

  material() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
    const U = {
      uMask: { value: this.maskTex }, uMaskRect: { value: new THREE.Vector4(MASK.x0, MASK.z0, MASK.size, MASK.size) },
      uZone: { value: this.zoneTex }, uZoneRect: { value: new THREE.Vector4(HM.cx - HM.size / 2, HM.cz - HM.size / 2, HM.size, HM.size) },
      uNoise: { value: TEX.noise }, uEra: { value: 0 },
      tGravel: { value: TEX.gravel }, tGravelN: { value: TEX.gravelN },
      tSand: { value: TEX.sand }, tSandN: { value: TEX.sandN },
      tRock: { value: TEX.rock }, tRockN: { value: TEX.rockN },
      tLime: { value: TEX.limestone }, tAsph: { value: TEX.asphalt },
      uHoles: { value: Array.from({ length: 16 }, () => new THREE.Vector4(1e6, 1e6, 0, 0)) },
      uHoleAng: { value: new Array(16).fill(0) },
    };
    this.uniforms = U;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWNrm;
          uniform sampler2D uMask, uZone, uNoise, tGravel, tGravelN, tSand, tSandN, tRock, tRockN, tLime, tAsph;
          uniform vec4 uMaskRect, uZoneRect; uniform float uEra;
          uniform vec4 uHoles[16]; uniform float uHoleAng[16];
          float sandW, rockW, paveW, roadW, zoneW, slopeW;
          `)
        .replace('#include <map_fragment>', TERRAIN_ALBEDO)
        .replace('#include <normal_fragment_maps>', TERRAIN_NORMAL);
    };
    m.customProgramCacheKey = () => 'giza-terrain';
    return m;
  }
}

const TERRAIN_ALBEDO = /* glsl */`
  vec2 wp = vWPos.xz;
  for (int i = 0; i < 16; i++) {
    vec4 hh = uHoles[i];
    vec2 dd = wp - hh.xy;
    float ca = cos(uHoleAng[i]), sa = sin(uHoleAng[i]);
    vec2 rr = vec2(ca * dd.x + sa * dd.y, -sa * dd.x + ca * dd.y);
    if (abs(rr.x) < hh.z && abs(rr.y) < hh.w) discard;
  }
  vec2 muv = (wp - uMaskRect.xy) / uMaskRect.zw;
  vec3 mk = vec3(0.0);
  if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) mk = texture2D(uMask, muv).rgb;
  vec2 zuv = (wp - uZoneRect.xy) / uZoneRect.zw;
  zoneW = texture2D(uZone, clamp(zuv, 0.001, 0.999)).r;
  vec4 nz = texture2D(uNoise, wp / 420.0);
  vec4 nz2 = texture2D(uNoise, wp / 57.0 + 0.31);
  slopeW = 1.0 - clamp(normalize(vWNrm).y, 0.0, 1.0);
  vec3 g1 = texture2D(tGravel, wp / 3.1).rgb;
  vec3 g2 = texture2D(tGravel, wp * mat2(0.8, 0.6, -0.6, 0.8) / 8.3).rgb;
  vec3 gravel = mix(g1, g2, 0.4) * 1.08;
  vec3 s1 = texture2D(tSand, wp / 4.3).rgb;
  vec3 s2 = texture2D(tSand, wp * mat2(0.6, -0.8, 0.8, 0.6) / 13.0).rgb;
  vec3 sand = mix(s1, s2, 0.45);
  sandW = smoothstep(0.38, 0.72, nz.r * 0.62 + nz2.g * 0.5 - mk.g * 0.5 - mk.b * 0.6);
  sandW = clamp(max(sandW, 0.22 - mk.g * 0.2), 0.0, 1.0);
  vec3 col = mix(gravel, sand, sandW);
  rockW = clamp(max(mk.g * 0.95, smoothstep(0.16, 0.40, slopeW)), 0.0, 1.0);
  vec3 r1 = texture2D(tRock, vec2(wp.x * 0.7 + wp.y * 0.7, vWPos.y * 1.6) / 9.0).rgb;
  vec3 r2 = texture2D(tRock, wp / 7.0).rgb;
  vec3 rock = mix(r2, r1, smoothstep(0.15, 0.45, slopeW)) * vec3(1.0, 0.97, 0.93);
  col = mix(col, rock, rockW);
  paveW = clamp(mk.b * 1.4, 0.0, 1.0);
  col = mix(col, texture2D(tLime, wp / 1.7).rgb * vec3(1.05, 1.0, 0.92), paveW * 0.85);
  roadW = clamp(mk.r, 0.0, 1.0) * (1.0 - uEra);
  vec3 asph = texture2D(tAsph, wp / 5.0).rgb * mix(0.85, 1.1, nz2.b);
  col = mix(col, mix(asph * 1.25, sand, 0.3), roadW);
  vec3 urban = mix(vec3(0.36, 0.31, 0.25), vec3(0.48, 0.42, 0.34), nz2.b);
  vec2 plot = floor(wp / vec2(41.0, 23.0) + nz.ba * 1.5);
  float ph = fract(sin(dot(plot, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 field = mix(vec3(0.07, 0.15, 0.03), vec3(0.20, 0.24, 0.06), ph);
  field = mix(field, vec3(0.22, 0.16, 0.10), step(0.78, ph));
  field *= mix(0.8, 1.15, texture2D(uNoise, wp / 9.0).a);
  col = mix(col, mix(urban, field, uEra), smoothstep(0.15, 0.6, zoneW));
  col *= mix(0.95, 1.07, nz.g) * 1.3;
  diffuseColor.rgb *= col;
`;

const TERRAIN_NORMAL = /* glsl */`
  {
    vec2 wp2 = vWPos.xz;
    vec3 nG = texture2D(tGravelN, wp2 / 3.1).xyz * 2.0 - 1.0;
    vec3 nS = texture2D(tSandN, wp2 / 4.3).xyz * 2.0 - 1.0;
    vec3 nR = texture2D(tRockN, wp2 / 7.0).xyz * 2.0 - 1.0;
    vec3 tn = mix(mix(nG, nS, sandW), nR, rockW);
    tn = mix(tn, vec3(0.0, 0.0, 1.0), max(roadW * 0.8, zoneW * 0.7));
    vec3 Nw = normalize(normalize(vWNrm) + vec3(tn.x, 0.0, -tn.y) * 0.9);
    normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  }
`;

// approximate modern tourist roads on the plateau
const ROADS = [
  [[-240, -720], [-205, -520], [-150, -360], [-75, -215], [60, -168], [170, -128], [215, -118]],
  [[-75, -215], [-165, -165], [-182, -40], [-180, 110], [-160, 200], [-60, 236], [80, 305], [190, 352], [262, 380], [296, 392]],
  [[-180, 110], [-330, 150], [-470, 190], [-505, 330], [-520, 480], [-640, 620], [-700, 700], [-720, 820], [-735, 960], [-700, 1120], [-670, 1300]],
  [[-640, 620], [-470, 655], [-360, 700], [-240, 735]],
];

// outline of the protected plateau (no modern buildings inside)
const SITE_POLY = [
  [-2700, -700], [-500, -520], [-100, -430], [260, -330], [330, -200], [345, 60], [430, 300],
  [452, 390], [470, 520], [440, 700], [480, 900], [520, 1200], [-200, 2000], [-2700, 2000],
];

function insidePoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function grow(r, m) { return { x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m }; }

function polyInfo(pts) {
  const seg = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, bx, bz, l, s0: L }); L += l;
  }
  return { seg, len: L };
}

export function closestOnPoly(c, x, z) {
  let best = { d: 1e9, t: 0 };
  for (const s of c.seg) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    let u = ((x - s.ax) * dx + (z - s.az) * dz) / (s.l * s.l);
    u = clamp(u, 0, 1);
    const px = s.ax + dx * u, pz = s.az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, t: (s.s0 + u * s.l) / c.len, px, pz };
  }
  return best;
}

// causeways keep the plateau level, then drop down the escarpment
function easeCause(t) { return smoothstep(0.0, 1.0, t) * 0.5 + t * 0.5; }

function gridLines(min, max, f0, f1, fine) {
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

export function causewayY(c, t) { return lerp(c.y0, c.y1, easeCause(t)); }
