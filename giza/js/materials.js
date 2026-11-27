// Textures and material factories.  Every factory returns a fresh material so
// each pyramid can carry its own clipping planes for the cross-section tool.
import * as THREE from 'three';
import { TEX, tex, addMacro, addJoints, loadTextures as loadTex } from '../../shared/engine/materials.js';

export { TEX, addMacro, addJoints };

const TEX_DEFS = {
  sand: ['sand_albedo.jpg', 'sand_normal.jpg'],
  gravel: ['gravel_albedo.jpg', 'gravel_normal.jpg'],
  limestone: ['limestone_albedo.jpg', 'limestone_normal.jpg'],
  casing: ['casing_albedo.jpg', 'casing_normal.jpg'],
  granite: ['granite_albedo.jpg', 'granite_normal.jpg'],
  rock: ['rock_albedo.jpg', 'rock_normal.jpg'],
  asphalt: ['asphalt_albedo.jpg', null],
  water: [null, 'water_normal.jpg'],
};

export function loadTextures(manager, renderer, base = 'textures/') {
  return loadTex(TEX_DEFS, manager, renderer, base);
}

// Weathering on exposed stone: vertical run-off streaks, large tonal patches,
// dust low down and wind-blown sand caught on the steps.
const WEATHER = (streakAmt, sandAmt) => `
  {
    float streak = texture2D(uNoise, vec2((vWPos.x + vWPos.z) * 0.021, vWPos.y * 0.0021)).b;
    float patchW = texture2D(uNoise, vWPos.xz * 0.0031 + vec2(vWPos.y * 0.0047, 0.0)).g;
    diffuseColor.rgb *= mix(0.87, 1.09, patchW) * mix(1.0 - ${streakAmt}, 1.0 + ${streakAmt} * 0.5, streak);
    float low = 1.0 - smoothstep(4.0, 30.0, vWPos.y);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 0.99, 0.9), low * 0.6);
    float upw = dot(normalize(vNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float sandOn = smoothstep(0.55, 0.95, upw) * smoothstep(0.3, 0.8, texture2D(uNoise, vWPos.xz * 0.11).a + low * 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.45, 0.27), sandOn * ${sandAmt});
  }`;

export const Mats = {
  coreStone() {
    const m = new THREE.MeshStandardMaterial({
      map: tex('limestone', 2.2), normalMap: tex('limestoneN', 2.2),
      normalScale: new THREE.Vector2(1.6, 1.6),
      vertexColors: true, roughness: 0.93, metalness: 0,
      color: new THREE.Color(0xf2e6d2),
    });
    addMacro(m, { scale: 45, amount: 0.2, extra: WEATHER('0.1', '0.55') });
    return addJoints(m);
  },
  // generic ashlar masonry: courses and staggered joints drawn in world space
  masonry({ course = 1.15, color = 0xead9bd, joint = 0.35 } = {}) {
    const m = new THREE.MeshStandardMaterial({
      map: tex('limestone', 2.0), normalMap: tex('limestoneN', 2.0), normalScale: new THREE.Vector2(1.3, 1.3),
      vertexColors: true, roughness: 0.93, color: new THREE.Color(color),
    });
    addMacro(m, { scale: 25, amount: 0.22 });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMN;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvMN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMN;\nfloat mh(float n){return fract(sin(n*127.1)*43758.5453);}')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 n = normalize(vMN);
            if (abs(n.y) < 0.6) {
              float cy = vWPos.y / ${course.toFixed(2)};
              float ci = floor(cy), fy = fract(cy);
              float s = abs(n.x) > abs(n.z) ? vWPos.z : vWPos.x;
              float L = 1.6 + mh(ci) * 1.4;
              float u = (s + mh(ci + 3.0) * 10.0) / L;
              float fu = fract(u);
              float aw = fwidth(u) * 1.5, ay = fwidth(cy) * 1.5;
              float hj = 1.0 - smoothstep(0.0, 0.03 + ay, min(fy, 1.0 - fy));
              float vj = 1.0 - smoothstep(0.0, 0.02 + aw, min(fu, 1.0 - fu));
              float fade = 1.0 - smoothstep(0.15, 0.5, max(aw, ay));
              diffuseColor.rgb *= 1.0 - ${joint.toFixed(2)} * max(hj, vj) * fade;
              diffuseColor.rgb *= 0.9 + mh(ci * 7.0 + floor(u)) * 0.18;
            }
          }`);
    };
    m.customProgramCacheKey = () => 'masonry' + course + joint;
    return m;
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
    }), { scale: 30, amount: 0.25, extra: WEATHER('0.22', '0.3') });
  },
  roughGranite() {
    return addMacro(new THREE.MeshStandardMaterial({
      map: tex('granite', 1.6), normalMap: tex('rockN', 2.5),
      normalScale: new THREE.Vector2(1.2, 1.2),
      vertexColors: true, roughness: 0.78, color: new THREE.Color(0xe8cabf),
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
    return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 1.6, roughness: 0.4 });
  },
};
