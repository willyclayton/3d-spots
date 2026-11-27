// Colosseum textures and materials. Every material shares the cutaway
// uniforms: while a cut is open the materials draw both sides, and a back
// face seen through the cut is painted as solid stone lit along the cutting
// plane, which makes closed walls read as sliced.
import * as THREE from 'three';
import { TEX, tex, addMacro, loadTextures as loadTex } from '../../shared/engine/materials.js';

export { TEX };

const TEX_DEFS = {
  travertine: ['travertine_albedo.jpg', 'travertine_normal.jpg'],
  brick: ['brick_albedo.jpg', 'brick_normal.jpg'],
  tuff: ['tuff_albedo.jpg', 'tuff_normal.jpg'],
  marble: ['marble_albedo.jpg', 'marble_normal.jpg'],
  cobble: ['cobble_albedo.jpg', 'cobble_normal.jpg'],
  grass: ['grass_albedo.jpg', 'grass_normal.jpg'],
  soil: ['soil_albedo.jpg', 'soil_normal.jpg'],
  planks: ['planks_albedo.jpg', 'planks_normal.jpg'],
  asphalt: ['asphalt_albedo.jpg', null],
};

export function loadTextures(manager, renderer, base = 'textures/') {
  return loadTex(TEX_DEFS, manager, renderer, base);
}

// cutaway state shared by all the amphitheatre's materials
export const CUT = {
  uCut: { value: 0 },
  uCutN: { value: new THREE.Vector3(1, 0, 0) },     // world normal of the cut face (towards the viewer)
  uCutCol: { value: new THREE.Color(0xd9ccb4) },
};

// Block joints drawn from the UVs (metres along the wall, height): courses
// of `course` m, blocks of `len` m, staggered; plus the clamp holes medieval
// builders dug at the joints to take out the iron (`holes`, 0..1).
const JOINTS = (course, len, dark, holes) => `
  {
    vec2 bw = vUv2;
    float row = floor(bw.y / ${course.toFixed(3)});
    float off = fract(sin(row * 12.9898) * 43758.5453) * ${len.toFixed(3)};
    float x = (bw.x + off) / ${len.toFixed(3)};
    float col = floor(x);
    float fy = fract(bw.y / ${course.toFixed(3)}), fx = fract(x);
    float wy = fwidth(bw.y / ${course.toFixed(3)}), wx = fwidth(x);
    float jy = 1.0 - smoothstep(0.0, max(0.03, wy * 1.5), min(fy, 1.0 - fy));
    float jx = 1.0 - smoothstep(0.0, max(0.02, wx * 1.5), min(fx, 1.0 - fx));
    float fade = 1.0 - smoothstep(0.08, 0.3, max(wx, wy));
    float h = fract(sin(dot(vec2(row, col), vec2(127.1, 311.7))) * 43758.5453);
    diffuseColor.rgb *= mix(1.0, mix(0.9, 1.08, h), fade);
    diffuseColor.rgb *= 1.0 - ${dark.toFixed(2)} * max(jx, jy) * fade;
    ${holes > 0 ? `
    // clamp holes: at some joint corners, a dark socket ~25 cm across
    vec2 cell = vec2(col, row);
    float hp = fract(sin(dot(cell, vec2(41.3, 289.1))) * 15731.743);
    vec2 cp = vec2(fx, fy) * vec2(${len.toFixed(3)}, ${course.toFixed(3)});
    float dh = length(cp - vec2(0.0, ${(course * 0.5).toFixed(3)}));
    float hole = (1.0 - smoothstep(0.1, 0.16, dh)) * step(hp, ${holes.toFixed(2)}) * fade;
    diffuseColor.rgb *= 1.0 - 0.75 * hole;` : ''}
  }`;

function stone({ key, tile, color = 0xffffff, roughness = 0.9, normalScale = 1.2, joints = null, macro = 0.18, lift = 1 }) {
  const m = new THREE.MeshStandardMaterial({
    map: tex(key, tile), normalMap: TEX[key + 'N'] ? tex(key + 'N', tile) : null,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color, roughness, metalness: 0, vertexColors: true,
  });
  addMacro(m, { scale: 40, amount: macro });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, CUT);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv2;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv2 = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv2;\nuniform float uCut; uniform vec3 uCutN; uniform vec3 uCutCol;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${joints ? JOINTS(...joints) : ''}
        ${lift !== 1 ? `diffuseColor.rgb = min(diffuseColor.rgb * ${lift.toFixed(2)}, vec3(1.0));` : ''}
        if (uCut > 0.5 && !gl_FrontFacing) diffuseColor.rgb = uCutCol * (0.92 + 0.08 * diffuseColor.r);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uCut > 0.5 && !gl_FrontFacing) normal = normalize((viewMatrix * vec4(uCutN, 0.0)).xyz);`);
  };
  const key0 = m.customProgramCacheKey;
  m.customProgramCacheKey = () => 'col-' + key + lift + (joints ? joints.join(',') : '') + key0();
  return m;
}

export const Mats = {
  travertine: () => stone({ key: 'travertine', tile: 2.0, color: 0xf2ece0, roughness: 0.88, joints: [0.92, 1.9, 0.35, 0.22] }),
  tuff: () => stone({ key: 'tuff', tile: 2.0, color: 0xe8e0d0, roughness: 0.95, joints: [0.6, 1.2, 0.25, 0] }),
  brick: () => stone({ key: 'brick', tile: 1.2, color: 0xffffff, roughness: 0.92, normalScale: 1.0, macro: 0.25 }),
  marble: () => stone({ key: 'marble', tile: 2.0, color: 0xffffff, roughness: 0.7, normalScale: 0.4, macro: 0.06 }),
  planks: () => stone({ key: 'planks', tile: 2.4, color: 0xe8d8c4, roughness: 0.85, normalScale: 0.8, macro: 0.12 }),
  arenaSand: () => stone({ key: 'soil', tile: 3.0, color: 0xffeccc, roughness: 1.0, normalScale: 0.5, macro: 0.1, lift: 1.45 }),
  basementFloor: () => stone({ key: 'soil', tile: 3.0, color: 0xc8b8a0, roughness: 1.0, normalScale: 0.8, macro: 0.2 }),
};
