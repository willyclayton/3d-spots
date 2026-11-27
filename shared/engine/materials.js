// Shared texture registry and material helpers.
//
// TEX holds the textures a site loaded (albedo as TEX[key], normal map as
// TEX[key + 'N']) plus TEX.noise, a tileable 4-octave value-noise texture.
// The helpers patch MeshStandardMaterial shaders: addMacro breaks up visible
// tiling with large-scale colour variation, addJoints darkens block joints
// and beds from a per-vertex 'aux' attribute.
import * as THREE from 'three';
import { vnoise2 } from './util.js';

export const TEX = {};

export function loadTextures(defs, manager, renderer, base = 'textures/') {
  const loader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const ps = [];
  for (const [key, [alb, nrm]] of Object.entries(defs)) {
    const setup = (t, srgb) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    if (alb) ps.push(loader.loadAsync(base + alb).then((t) => { TEX[key] = setup(t, true); }));
    if (nrm) ps.push(loader.loadAsync(base + nrm).then((t) => { TEX[key + 'N'] = setup(t, false); }));
  }
  TEX.noise = makeNoiseTexture();
  return Promise.all(ps);
}

// 256² tileable value-noise, 4 independent octave bands in RGBA.
function makeNoiseTexture() {
  const N = 256, data = new Uint8Array(N * N * 4);
  const per = (x, y, f, seed) => {
    // tileable by wrapping lattice coordinates
    const fx = x * f / N, fy = y * f / N;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const h = (i, j) => vnoise2(((i % f) + f) % f + 0.5, ((j % f) + f) % f + 0.5, seed);
    const s = (t) => t * t * (3 - 2 * t);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return (a * (1 - s(tx)) + b * s(tx)) * (1 - s(ty)) + (c * (1 - s(tx)) + d * s(tx)) * s(ty);
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const fb = (f0, seed) => (per(x, y, f0, seed) * 0.55 + per(x, y, f0 * 2, seed + 1) * 0.3 + per(x, y, f0 * 4, seed + 2) * 0.15);
    data[i] = fb(4, 1) * 255; data[i + 1] = fb(8, 5) * 255; data[i + 2] = fb(16, 9) * 255; data[i + 3] = fb(32, 13) * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export function tex(key, tile) {
  const t = TEX[key].clone();
  t.repeat.set(1 / tile, 1 / tile);
  t.needsUpdate = true;
  return t;
}

// Adds world position varying + large-scale colour variation driven by the
// noise texture, so tiled textures do not visibly repeat.
export function addMacro(mat, { scale = 60, amount = 0.22, extra = '' } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uNoise = { value: TEX.noise };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uNoise;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 mp = vWPos.xz / ${scale.toFixed(1)} + vec2(vWPos.y / ${(scale * 0.7).toFixed(1)}, 0.0);
          vec4 nz = texture2D(uNoise, mp);
          float m = nz.r * 0.6 + nz.g * 0.4;
          diffuseColor.rgb *= mix(1.0 - ${amount.toFixed(3)}, 1.0 + ${amount.toFixed(3)} * 0.6, m);
          ${extra}
        }`);
  };
  mat.customProgramCacheKey = () => 'macro' + scale + amount + hashStr(extra);
  return mat;
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }

// Dark mortar joints and occluded beds, from the per-vertex 'aux' attribute
// (distance to the left/right block joint and height above the bed, metres).
export function addJoints(mat, { width = 0.05, dark = 0.3 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aux;\nvarying vec3 vAux;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAux = aux;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAux;\nfloat gCornerAO = 1.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float e = min(vAux.x, vAux.y);
          float fw = fwidth(e);
          float j = smoothstep(0.0, max(${width.toFixed(3)}, fw * 1.5), e);
          float fade = 1.0 - smoothstep(0.015, 0.09, fw);
          float cz = max(vAux.z, 0.0);
          float fb = fwidth(cz);
          float bed = smoothstep(0.0, max(0.16, fb * 1.5), cz);
          float fadeB = 1.0 - smoothstep(0.03, 0.2, fb);
          diffuseColor.rgb *= mix(1.0, mix(${dark.toFixed(2)}, 1.0, j), fade) * mix(1.0, mix(0.7, 1.0, bed), fadeB);
          // inside corners and joints see less sky: occlude the indirect light there
          float corner = smoothstep(0.0, 0.5, cz);
          gCornerAO = mix(0.85, mix(0.3, 1.0, corner) * mix(0.7, 1.0, j), fadeB);
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= gCornerAO;
        reflectedLight.indirectSpecular *= gCornerAO;`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => 'joints2' + width + dark + (prevKey ? prevKey() : '');
  return mat;
}

