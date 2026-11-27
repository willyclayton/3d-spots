// The crowd, c. 90 CE: seated spectators on every row, one instanced mesh.
// Dress follows rank: senators in white togas on the podium, equestrians in
// white in the first tier, citizens in togas and tunics above, and on the
// wooden benches at the top the poor, slaves and women in coloured clothes.
// They lift out of their seats and sway with the excitement of the games
// (uExcite, driven by games.js).
import * as THREE from 'three';
import { mulberry32 } from '../../shared/engine/util.js';
import { PLAN, RINGS } from './data/site.js';
import { BAY, alphaAt, ovalPoint, ovalNormal } from './plan.js';
import { TIERS, tierSteps, VOM, isStairBay } from './layout.js';
import { bayScale } from './geom.js';
import { stairHalf } from './cavea.js';

// a seated figure: torso and thighs forward (faces +z), or its head; boxes
// without their hidden undersides, 30 triangles in all
function seatedGeometry(part) {
  const pos = [], nor = [];
  const box = (w, h, d, x, y, z) => {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2, z0 = z - d / 2, z1 = z + d / 2;
    const quad = (a, b, c, e, n) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); for (let i = 0; i < 6; i++) nor.push(...n); };
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  };
  if (part !== 'head') {
    box(0.36, 0.58, 0.22, 0, 0.29, -0.06);     // torso
    box(0.32, 0.14, 0.42, 0, 0.06, 0.17);      // thighs
  } else box(0.17, 0.2, 0.19, 0, 0.69, -0.04); // head
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const PALETTE = {
  podium: [0xf4f1ea, 0xf2eee4, 0xeee8dc, 0x8a2440],
  primum: [0xf1ece2, 0xece4d6, 0xe8e0d0, 0xd8cfbf],
  imum: [0xe9e2d4, 0xd9cfbd, 0xb89a6c, 0x9a7b54, 0x7c6a52, 0xc4b494],
  summum: [0xa8743e, 0x7a5a3a, 0x5c6e7a, 0x8a3a2a, 0x6a7a4a, 0xc49a5a, 0x8c8478],
  ligneis: [0x7a3a5a, 0x3a5a7a, 0x9a6a2a, 0x5a3a2a, 0x6a6a5a, 0x8a5a6a],
};
const SKIN = [0xc69072, 0xa8765a, 0xd4a587, 0x8a5a3c];

export function buildCrowd(quality = 'high') {
  const rnd = mulberry32(80);
  const density = quality === 'low' ? 0.2 : quality === 'medium' ? 0.36 : 0.55;
  const spots = [];
  const row = (tier, d, y, k) => {
    const sa = (k - 0.5) * BAY, sb = (k + 0.5) * BAY, sc = k * BAY;
    const sc2 = bayScale(sc, d);
    const step = 0.52 / sc2;
    for (let s = sa + step / 2; s < sb; s += step) {
      if (rnd() > density) continue;
      // keep clear of the vomitoria, and of the boxes
      if (tier === 'imum' && isStairBay(k) && d > VOM.d0 - 0.3 && Math.abs(s - sc) < (stairHalf(k) + 0.4) / sc2) continue;
      if ((k >= 18 && k <= 22) || (k >= 58 && k <= 62)) { if (d > 45 && Math.abs(s - (k >= 58 ? 60 : 20) * BAY) < 1.4 * BAY) continue; }
      spots.push({ s, d, y, tier });
    }
  };
  for (let k = 0; k < PLAN.bays; k++) {
    row('podium', RINGS.podium[0] + 1.6, 4.45, k);
    for (const m of TIERS) {
      const { rise, tread, n } = tierSteps(m);
      for (let i = 0; i < n; i++) row(m.id, m.d0 - tread * (i + 0.55), m.y0 + rise * (i + 1), k);
    }
  }
  const geo = seatedGeometry('body'), headGeo = seatedGeometry('head');
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const U = { uTime: { value: 0 }, uExcite: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uExcite;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float h = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
          float up = smoothstep(0.15, 0.4, transformed.y);
          float wave = max(0.0, sin(uTime * (3.0 + 3.0 * h) + h * 40.0));
          transformed.y += up * (uExcite * uExcite * (0.25 + 0.2 * h) * (0.4 + 0.6 * wave) + 0.01 * sin(uTime * 1.3 + h * 20.0));
          transformed.z -= up * uExcite * 0.08 * wave;
        }`);
  };
  mat.customProgramCacheKey = () => 'crowd';
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, mat, spots.length);
  im.name = 'crowd'; heads.name = 'crowd-heads';
  im.castShadow = false; im.receiveShadow = true; heads.receiveShadow = true;
  im.add(heads);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color(), skin = new THREE.Color();
  spots.forEach((p, i) => {
    const al = alphaAt(p.s);
    const [u, v] = ovalPoint(al, p.d);
    const [nu, nv] = ovalNormal(al);
    q.setFromAxisAngle(up, Math.atan2(-nu, -nv) + (rnd() - 0.5) * 0.3);
    const k = 0.92 + rnd() * 0.16;
    scl.set(k, k, k);
    m4.compose(new THREE.Vector3(u, p.y + 0.02, v), q, scl);
    im.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
    const pal = PALETTE[p.tier];
    col.setHex(pal[Math.floor(rnd() * pal.length)]);
    im.setColorAt(i, col.multiplyScalar(0.85 + rnd() * 0.2));
    skin.setHex(SKIN[Math.floor(rnd() * SKIN.length)]);
    if (rnd() < 0.35) skin.lerp(new THREE.Color(0x3a2a1e), 0.6);          // dark hair seen from above
    heads.setColorAt(i, skin);
  });
  for (const m of [im, heads]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  return { mesh: im, uniforms: U, count: spots.length };
}
