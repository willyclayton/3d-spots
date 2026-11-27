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
  uCutT: { value: new THREE.Vector3(0, 0, 1) },     // horizontal direction along the cut face
};

// What the inside of each material looks like where the cut passes through
// it: a colour and a pattern drawn in the plane of the cut (a = metres along
// the cut, vWPos.y up).
const CUT_PATTERNS = {
  // squared travertine blocks in courses
  blocks: (c) => `
    vec3 cc = ${c};
    float row = floor(vWPos.y / 0.92);
    float bx = (a + fract(sin(row * 7.13) * 91.7) * 1.9) / 1.9;
    float fy = fract(vWPos.y / 0.92), fx = fract(bx);
    float j = 1.0 - smoothstep(0.0, 0.035, min(min(fy, 1.0 - fy) * 0.92, min(fx, 1.0 - fx) * 1.9));
    cc *= 0.92 + 0.12 * fract(sin(dot(vec2(row, floor(bx)), vec2(12.9, 78.2))) * 43758.5);
    cc *= 1.0 - 0.45 * j;`,
  // smaller tuff blocks, porous
  tuff: (c) => `
    vec3 cc = ${c};
    float row = floor(vWPos.y / 0.6);
    float bx = (a + fract(sin(row * 3.7) * 51.3) * 1.2) / 1.2;
    float fy = fract(vWPos.y / 0.6), fx = fract(bx);
    float j = 1.0 - smoothstep(0.0, 0.03, min(min(fy, 1.0 - fy) * 0.6, min(fx, 1.0 - fx) * 1.2));
    float pore = texture2D(uNoise, vec2(a, vWPos.y) * 0.9).a;
    cc *= (0.9 + 0.14 * fract(sin(dot(vec2(row, floor(bx)), vec2(12.9, 78.2))) * 43758.5)) * mix(1.0, 0.7, step(0.72, pore));
    cc *= 1.0 - 0.4 * j;`,
  // Roman concrete: lumps of tuff and broken brick in grey mortar
  concrete: (c) => `
    vec3 cc = ${c};
    vec4 n1 = texture2D(uNoise, vec2(a, vWPos.y) * 0.55);
    vec4 n2 = texture2D(uNoise, vec2(a, vWPos.y) * 1.7 + 0.3);
    float lump = step(0.62, n1.b * 0.7 + n2.a * 0.5);
    float brk = step(0.7, n2.g) * (1.0 - lump);
    cc = mix(cc, vec3(0.5, 0.44, 0.33), lump * 0.8);
    cc = mix(cc, vec3(0.52, 0.27, 0.19), brk * 0.7);
    cc *= 0.9 + 0.15 * n2.r;`,
  marble: (c) => `
    vec3 cc = ${c};
    float vn = texture2D(uNoise, vec2(a, vWPos.y) * 0.3).r;
    cc *= 1.0 - 0.12 * smoothstep(0.02, 0.0, abs(fract(vn * 6.0) - 0.5) - 0.46);`,
  wood: (c) => `
    vec3 cc = ${c};
    float g = texture2D(uNoise, vec2(a * 0.4, vWPos.y * 6.0)).r;
    cc *= 0.85 + 0.25 * g;`,
  plain: (c) => `vec3 cc = ${c};`,
};
const glc = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; };

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

function stone({ key, tile, color = 0xffffff, roughness = 0.9, metalness = 0, normalScale = 1.2, joints = null, macro = 0.18, lift = 1, cut = ['plain', 0xd9ccb4] }) {
  const m = new THREE.MeshStandardMaterial({
    map: key ? tex(key, tile) : null, normalMap: key && TEX[key + 'N'] ? tex(key + 'N', tile) : null,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color, roughness, metalness, vertexColors: true,
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
      .replace('#include <common>', '#include <common>\nvarying vec2 vUv2;\nuniform float uCut; uniform vec3 uCutN; uniform vec3 uCutT;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${joints ? JOINTS(...joints) : ''}
        ${lift !== 1 ? `diffuseColor.rgb = min(diffuseColor.rgb * ${lift.toFixed(2)}, vec3(1.0));` : ''}
        if (uCut > 0.5 && !gl_FrontFacing) {
          float a = dot(vWPos, uCutT);
          ${CUT_PATTERNS[cut[0]](glc(cut[1]))}
          diffuseColor.rgb = cc;
          diffuseColor.a = 1.0;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uCut > 0.5 && !gl_FrontFacing) normal = normalize((viewMatrix * vec4(uCutN, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uCut > 0.5 && !gl_FrontFacing) totalEmissiveRadiance += diffuseColor.rgb * 0.14;`);
  };
  const key0 = m.customProgramCacheKey;
  m.customProgramCacheKey = () => 'col-' + key + lift + cut.join(',') + (joints ? joints.join(',') : '') + key0();
  return m;
}

export const Mats = {
  travertine: () => stone({ key: 'travertine', tile: 2.0, color: 0xf2ece0, roughness: 0.88, joints: [0.92, 1.9, 0.35, 0.22], cut: ['blocks', 0xe8dcc2] }),
  tuff: () => stone({ key: 'tuff', tile: 2.0, color: 0xe8e0d0, roughness: 0.95, joints: [0.6, 1.2, 0.25, 0], cut: ['tuff', 0xc6b48a] }),
  brick: () => stone({ key: 'brick', tile: 1.2, color: 0xffffff, roughness: 0.92, normalScale: 1.0, macro: 0.25, cut: ['concrete', 0x6a6258] }),
  marble: () => stone({ key: 'marble', tile: 2.0, color: 0xf4ede0, roughness: 0.86, normalScale: 0.4, macro: 0.08, cut: ['marble', 0xf4f1ea] }),
  planks: () => stone({ key: 'planks', tile: 2.4, color: 0xe8d8c4, roughness: 0.85, normalScale: 0.8, macro: 0.12, cut: ['wood', 0xb08a62] }),
  timber: () => stone({ key: 'planks', tile: 1.2, color: 0xa88c70, roughness: 0.9, normalScale: 0.8, macro: 0.1, cut: ['wood', 0x8a6a48] }),
  plaster: () => stone({ key: 'marble', tile: 3.0, color: 0xffffff, roughness: 0.85, normalScale: 0.2, macro: 0.1, cut: ['concrete', 0x9d958a] }),
  bronze: () => stone({ key: null, tile: 1, color: 0xb88a4a, roughness: 0.35, metalness: 0.85, normalScale: 0, macro: 0.15, cut: ['plain', 0x8a6a3a] }),
  iron: () => stone({ key: null, tile: 1, color: 0x55565a, roughness: 0.55, metalness: 0.7, normalScale: 0, macro: 0.1, cut: ['plain', 0x3a3b3e] }),
  arenaSand: () => stone({ key: 'soil', tile: 3.0, color: 0xffeccc, roughness: 1.0, normalScale: 0.5, macro: 0.1, lift: 1.45 }),
  basementFloor: () => stone({ key: 'soil', tile: 3.0, color: 0xc8b8a0, roughness: 1.0, normalScale: 0.8, macro: 0.2 }),
};
