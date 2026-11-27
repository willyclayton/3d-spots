// Textures and material factories.  Every factory returns a fresh material so
// each pyramid can carry its own clipping planes for the cross-section tool.
import * as THREE from 'three';
import { vnoise2 } from '../../shared/engine/util.js';

export const TEX = {};

const TEX_DEFS = {
  sand: ['sand_albedo.jpg', 'sand_normal.jpg'],
  gravel: ['gravel_albedo.jpg', 'gravel_normal.jpg'],
  limestone: ['limestone_albedo.jpg', 'limestone_normal.jpg'],
  casing: ['casing_albedo.jpg', 'casing_normal.jpg'],
  granite: ['granite_albedo.jpg', 'granite_normal.jpg'],
  rock: ['rock_albedo.jpg', 'rock_normal.jpg'],
  asphalt: ['asphalt_albedo.jpg', null],
};

export function loadTextures(manager, renderer, base = 'textures/') {
  const loader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const ps = [];
  for (const [key, [alb, nrm]] of Object.entries(TEX_DEFS)) {
    const setup = (t, srgb) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    ps.push(loader.loadAsync(base + alb).then((t) => { TEX[key] = setup(t, true); }));
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

function tex(key, tile) {
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
  mat.customProgramCacheKey = () => 'macro' + scale + amount + extra.length;
  return mat;
}

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
      .replace('#include <common>', '#include <common>\nvarying vec3 vAux;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float e = min(vAux.x, vAux.y);
          float fw = fwidth(e);
          float j = smoothstep(0.0, max(${width.toFixed(3)}, fw * 1.5), e);
          float fade = 1.0 - smoothstep(0.015, 0.09, fw);
          float fb = fwidth(vAux.z);
          float bed = smoothstep(0.0, max(0.16, fb * 1.5), vAux.z);
          float fadeB = 1.0 - smoothstep(0.03, 0.2, fb);
          diffuseColor.rgb *= mix(1.0, mix(${dark.toFixed(2)}, 1.0, j), fade) * mix(1.0, mix(0.55, 1.0, bed), fadeB);
        }`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => 'joints' + width + dark + (prevKey ? prevKey() : '');
  return mat;
}

export const Mats = {
  coreStone() {
    const m = new THREE.MeshStandardMaterial({
      map: tex('limestone', 2.2), normalMap: tex('limestoneN', 2.2),
      normalScale: new THREE.Vector2(1.6, 1.6),
      vertexColors: true, roughness: 0.93, metalness: 0,
      color: new THREE.Color(0xf2e6d2),
    });
    addMacro(m, { scale: 45, amount: 0.2 });
    return addJoints(m);
  },
  rubble() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('limestone', 1.0), normalMap: tex('limestoneN', 1.0),
      normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, color: new THREE.Color(0xd9cdb8),
    }), { scale: 30, amount: 0.2 });
  },
  weatheredCasing() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('casing', 3), normalMap: tex('limestoneN', 3),
      normalScale: new THREE.Vector2(0.5, 0.5),
      vertexColors: true, roughness: 0.82, color: new THREE.Color(0xc9b99c),
    }), { scale: 30, amount: 0.25 });
  },
  roughGranite() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('granite', 1.6), normalMap: tex('rockN', 2.5),
      normalScale: new THREE.Vector2(1.2, 1.2),
      vertexColors: true, roughness: 0.78, color: new THREE.Color(0xd8b8ac),
    }), { scale: 25, amount: 0.15 });
  },
  polishedGranite() {
    return new THREE.MeshStandardMaterial({
      map: tex('granite', 1.4), normalMap: tex('graniteN', 1.4),
      normalScale: new THREE.Vector2(0.3, 0.3),
      vertexColors: true, roughness: 0.32, color: new THREE.Color(0xe0c4b8),
    });
  },
  // Smooth Tura limestone casing with drawn joints (uses 'course' attribute)
  tura({ color = 0xf4eddc, granite = false } = {}) {
    const m = new THREE.MeshStandardMaterial({
      map: tex(granite ? 'granite' : 'casing', granite ? 1.6 : 5),
      normalMap: tex(granite ? 'graniteN' : 'casingN', 5),
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: granite ? 0.35 : 0.55, color: new THREE.Color(color),
    });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float course;\nvarying float vCourse;\nvarying vec2 vFace;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCourse = course; vFace = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vCourse;\nvarying vec2 vFace;\nfloat hh(float n){return fract(sin(n*91.345)*47453.5453);}')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float f = vFace.y;
            float hf = fwidth(f);
            float hj = 1.0 - smoothstep(0.0, hf * 1.5 + 0.004, min(f, 1.0 - f));
            float L = 1.3 + hh(vCourse) * 0.9;
            float uu = (vFace.x + hh(vCourse + 7.0) * 9.0) / L;
            float fu = fract(uu);
            float wu = fwidth(uu);
            float vj = 1.0 - smoothstep(0.0, wu * 1.5 + 0.002, min(fu, 1.0 - fu));
            float tint = 0.95 + hh(vCourse * 3.1 + floor(uu)) * 0.08;
            diffuseColor.rgb *= tint * (1.0 - 0.35 * max(hj, vj));
          }`);
    };
    m.customProgramCacheKey = () => 'tura' + (granite ? 'g' : 'l');
    return m;
  },
  interiorLimestone() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('casing', 2.5), normalMap: tex('limestoneN', 2.5),
      normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true,
      roughness: 0.85, color: new THREE.Color(0xd8cbb0),
    }), { scale: 12, amount: 0.18 });
  },
  interiorGranite() {
    return new THREE.MeshStandardMaterial({
      map: tex('granite', 1.4), normalMap: tex('graniteN', 1.4),
      normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true,
      roughness: 0.34, color: new THREE.Color(0xa88a80),
    });
  },
  interiorRock() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('rock', 4), normalMap: tex('rockN', 4),
      normalScale: new THREE.Vector2(1.6, 1.6), vertexColors: true,
      roughness: 0.95, color: new THREE.Color(0xcbb89c),
    }), { scale: 10, amount: 0.25 });
  },
  rock({ tile = 8 } = {}) {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('rock', tile), normalMap: tex('rockN', tile),
      normalScale: new THREE.Vector2(1.5, 1.5), vertexColors: true,
      roughness: 0.95, color: new THREE.Color(0xe8d8bc),
    }), { scale: 50, amount: 0.22 });
  },
  mudbrick() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('sand', 3), normalMap: tex('gravelN', 2),
      normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true,
      roughness: 0.97, color: new THREE.Color(0xb7976e),
    }), { scale: 20, amount: 0.2 });
  },
  plaster() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('casing', 4), vertexColors: true, roughness: 0.8, color: new THREE.Color(0xf1ead8),
    }), { scale: 30, amount: 0.08 });
  },
  basalt() {
    return new THREE.MeshStandardMaterial({
      map: tex('gravel', 1.2), normalMap: tex('gravelN', 1.2),
      normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true,
      roughness: 0.7, color: new THREE.Color(0x3d3a38),
    });
  },
  wood() {
    return new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8, vertexColors: true });
  },
  metal() {
    return new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.45, metalness: 0.7, vertexColors: true });
  },
  lamp() {
    return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 3.0, roughness: 0.4 });
  },
};
