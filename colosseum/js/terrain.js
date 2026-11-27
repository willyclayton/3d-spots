// Ground around the Colosseum. The elevation tiles for Rome are coarse
// (~90 m) and see rooftops, so they give the hills (Palatine to the
// south-west, Caelian to the south-east, the Oppian to the north) but not the
// narrow valley the amphitheatre stands in. The valley floor is sculpted in:
// a level piazza round the building and the streets that leave it, each with
// its own gradient. Heights are approximate.
import * as THREE from 'three';
import { fbm2, smoothstep, clamp, lerp } from '../../shared/engine/util.js';
import { HeightField, gridLines, gridGeometry, skirtGeometry } from '../../shared/engine/heightfield.js';
import { TEX } from '../../shared/engine/materials.js';
import { SITE, PLAN, RINGS, HYPOGEUM } from './data/site.js';
import { ringCoords, toPlan, ovalPoint, toWorld } from './plan.js';

const HM = { cx: 0, cz: 0, size: 4096 };
const MASK = { x0: -800, z0: -800, size: 1600, px: 2048 };

// Streets (world x, z, floor height y) and half-widths: the valley floors.
export const STREETS = [
  // Via dei Fori Imperiali, down to the Forum and Piazza Venezia
  { id: 'fori', name: 'Via dei Fori Imperiali', hw: 15, blend: 45, asphalt: 11,
    pts: [[-112, -58, 0], [-260, -160, -1.5], [-480, -300, -4], [-760, -470, -6], [-1100, -690, -7]] },
  // Via di San Gregorio, between the Palatine and the Caelian to the Circus Maximus
  { id: 'gregorio', name: 'Via di San Gregorio', hw: 14, blend: 55, asphalt: 8,
    pts: [[-138, 54, 0], [-160, 200, -1.5], [-215, 420, -4.5], [-300, 700, -7], [-380, 950, -8]] },
  // Via Labicana, east past the Ludus Magnus
  { id: 'labicana', name: 'Via Labicana', hw: 12, blend: 30, asphalt: 7,
    pts: [[95, -10, 0], [260, 28, 1.0], [520, 92, 2.5], [900, 190, 5]] },
  // Via di San Giovanni in Laterano, up towards the Lateran
  { id: 'sangiovanni', name: 'Via di San Giovanni in Laterano', hw: 9, blend: 28, asphalt: 6,
    pts: [[90, 60, 0], [260, 120, 2.0], [520, 230, 5], [900, 400, 9]] },
  // Via Celio Vibenna, climbing the Caelian south of the Colosseum
  { id: 'celio', name: 'Via Celio Vibenna', hw: 6, blend: 20, asphalt: 5,
    pts: [[-40, 112, 0], [60, 150, 2.5], [150, 190, 6]] },
  // Via Nicola Salvi, up the Oppian to the north
  { id: 'salvi', name: 'Via Nicola Salvi', hw: 6, blend: 22, asphalt: 5,
    pts: [[10, -105, 0], [60, -200, 4], [110, -300, 9]] },
  // the Via Sacra up to the Arch of Titus on the Velia (an archaeological path)
  { id: 'sacra', name: 'Via Sacra', hw: 6, blend: 25, asphalt: 0,
    pts: [[-100, 0, 0], [-200, -20, 3], [-300, -30, 6]] },
].map((s) => ({ ...s, ...polyInfo(s.pts) }));

const PIAZZA = 70;          // level ground this far beyond the façade

export class Terrain {
  constructor() { this.uniforms = null; }

  async load(url) {
    this.hf = await new HeightField({ ...HM, baseASL: SITE.baseASL }).load(url);
    // the tiles run high in the valleys; bring the hills down to meet the floor
    this.hillDrop = 9;
  }

  dem(x, z) { return this.hf.at(x, z) - this.hillDrop; }

  // distance in from the façade (negative outside)
  ringD(x, z) { const [u, v] = toPlan(x, z); return ringCoords(u, v).d; }

  // Final ground height (world y).
  heightAt(x, z, detail = true) {
    let h = this.dem(x, z);
    let flat = 0;
    for (const s of STREETS) {
      const q = closestOnPoly(s, x, z);
      if (q.d < s.hw + s.blend) {
        const t = smoothstep(s.hw, s.hw + s.blend, q.d);
        h = lerp(q.y, h, t);
        flat = Math.max(flat, 1 - t);
      }
    }
    // the piazza, and the building's own floor: the pavement, then the
    // arena dropping to the floor of the basement (the arena is open today)
    const d = this.ringD(x, z);
    if (d > -PIAZZA - 60) {
      const t = smoothstep(-PIAZZA, -PIAZZA - 60, d);
      h = lerp(0, h, t);
      flat = Math.max(flat, 1 - t);
    }
    if (d > -PIAZZA) {
      const k = smoothstep(RINGS.podium[0] - 0.4, PLAN.cavea - 1.0, d);
      return -HYPOGEUM.depth * k;
    }
    if (detail) h += (fbm2(x * 0.05, z * 0.05, 3, 7) - 0.5) * 0.5 * (1 - flat * 0.9);
    return h;
  }

  // ---------------------------------------------------------- mesh -------
  build(quality = 'high') {
    const fine = quality === 'low' ? 4.5 : quality === 'medium' ? 3 : 2;
    const xs = gridLines(-2000, 2000, -360, 360, fine);
    const zs = gridLines(-2000, 2000, -360, 360, fine);
    const h = (x, z) => this.heightAt(x, z);
    const g = gridGeometry(xs, zs, h);
    const sg = skirtGeometry(xs, zs, h, { center: [0, 0], yFar: () => 10 });
    return { geometry: g, skirt: sg };
  }

  // ------------------------------------------------------- splat masks ---
  // maskA: R asphalt, G cobbles (sampietrini), B travertine paving
  // maskB: R soil (archaeological ground), G grass override, B unused
  buildMasks() {
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = MASK.px;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, MASK.px, MASK.px);
      ctx.globalCompositeOperation = 'lighter';
      return { cv, ctx };
    };
    const k = MASK.px / MASK.size;
    const tp = (x, z) => [(x - MASK.x0) * k, (z - MASK.z0) * k];
    const line = (ctx, pts, w, color, blur = 0) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = w * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (blur) ctx.filter = `blur(${blur * k}px)`;
      ctx.beginPath();
      pts.forEach((p, i) => { const [a, b] = tp(p[0], p[1]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      ctx.stroke(); ctx.restore();
    };
    // a ring between two offsets of the façade (d0 < d1, negative = outside)
    const ovalPath = (ctx, d) => {
      for (let i = 0; i <= 240; i++) {
        const al = (i / 240) * Math.PI * 2;
        const [u, v] = ovalPoint(al, d);
        const [x, z] = toWorld(u, v);
        const [a, b] = tp(x, z);
        i ? ctx.lineTo(a, b) : ctx.moveTo(a, b);
      }
      ctx.closePath();
    };
    const ring = (ctx, d0, d1, color, blur = 0) => {
      ctx.save(); ctx.fillStyle = color;
      if (blur) ctx.filter = `blur(${blur * k}px)`;
      ctx.beginPath(); ovalPath(ctx, d0); ovalPath(ctx, d1); ctx.fill('evenodd'); ctx.restore();
    };
    const A = mk(), Bm = mk();
    // streets: asphalt carriageway with cobbled pavements either side
    for (const s of STREETS) {
      const pts = s.pts.map(([x, z]) => [x, z]);
      if (s.asphalt) {
        line(A.ctx, pts, s.hw * 2, 'rgb(0,200,0)', 1);
        line(A.ctx, pts, s.asphalt * 2 - 2, 'rgb(255,0,0)', 0.5);
      } else line(Bm.ctx, pts, s.hw * 2, 'rgb(255,0,0)', 2);
    }
    // the piazza: cobbles, then the band of travertine paving round the
    // building (the Flavian pavement reached 17.5 m out) and the floor inside
    ring(A.ctx, -PIAZZA + 10, -17.5, 'rgb(0,255,0)', 2);
    ring(A.ctx, -17.5, 0.2, 'rgb(0,0,255)', 0.3);
    // the road round the north and east sides of the piazza
    {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const al = -0.55 + (i / 60) * 2.0;          // from the east end round to the north-west
        const [u, v] = ovalPoint(al, -52);
        pts.push(toWorld(u, v));
      }
      line(A.ctx, pts, 9, 'rgb(255,0,0)', 0.5);
    }
    // inside the building: bare earth and old paving
    ring(Bm.ctx, 0.2, RINGS.podium[1], 'rgb(255,0,0)', 0.3);
    // archaeological ground: between the Colosseum, the Meta Sudans and the Arch
    line(Bm.ctx, [[-95, 10], [-138, 54], [-170, 40], [-210, -10]], 50, 'rgb(255,0,0)', 8);
    const tex = (cv) => {
      const t = new THREE.CanvasTexture(cv);
      t.flipY = false; t.colorSpace = THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 4;
      return t;
    };
    this.maskA = tex(A.cv); this.maskB = tex(Bm.cv);
  }

  material() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const U = {
      uMaskA: { value: this.maskA }, uMaskB: { value: this.maskB },
      uMaskRect: { value: new THREE.Vector4(MASK.x0, MASK.z0, MASK.size, MASK.size) },
      uNoise: { value: TEX.noise }, uEra: { value: 0 },
      tSoil: { value: TEX.soil }, tSoilN: { value: TEX.soilN },
      tGrass: { value: TEX.grass }, tGrassN: { value: TEX.grassN },
      tCob: { value: TEX.cobble }, tCobN: { value: TEX.cobbleN },
      tTrav: { value: TEX.travertine }, tTravN: { value: TEX.travertineN },
      tAsph: { value: TEX.asphalt },
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
          uniform sampler2D uMaskA, uMaskB, uNoise, tSoil, tSoilN, tGrass, tGrassN, tCob, tCobN, tTrav, tTravN, tAsph;
          uniform vec4 uMaskRect; uniform float uEra;
          float grassW, roadW, cobW, travW;
          `)
        .replace('#include <map_fragment>', ALBEDO)
        .replace('#include <normal_fragment_maps>', NORMAL);
    };
    m.customProgramCacheKey = () => 'colosseum-terrain';
    return m;
  }
}

const ALBEDO = /* glsl */`
  vec2 wp = vWPos.xz;
  vec2 muv = (wp - uMaskRect.xy) / uMaskRect.zw;
  vec3 ma = vec3(0.0), mb = vec3(0.0);
  if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) { ma = texture2D(uMaskA, muv).rgb; mb = texture2D(uMaskB, muv).rgb; }
  vec4 nz = texture2D(uNoise, wp / 300.0);
  vec4 nz2 = texture2D(uNoise, wp / 41.0 + 0.37);
  float slope = 1.0 - clamp(normalize(vWNrm).y, 0.0, 1.0);
  vec3 soil = mix(texture2D(tSoil, wp / 3.0).rgb, texture2D(tSoil, wp * mat2(0.8, 0.6, -0.6, 0.8) / 9.0).rgb, 0.4);
  vec3 grass = mix(texture2D(tGrass, wp / 4.0).rgb, texture2D(tGrass, wp * mat2(0.6, -0.8, 0.8, 0.6) / 13.0).rgb, 0.5);
  // the hills are parks: grass above the valley floor and on slopes, worn to soil in places
  grassW = smoothstep(1.5, 4.5, vWPos.y + (nz.r - 0.5) * 4.0) + smoothstep(0.12, 0.3, slope);
  grassW = clamp(grassW, 0.0, 1.0) * (1.0 - clamp(mb.r * 1.2, 0.0, 1.0)) * mix(0.75, 1.0, smoothstep(0.3, 0.6, nz2.g));
  vec3 col = mix(soil, grass, grassW);
  cobW = clamp(ma.g, 0.0, 1.0);
  vec3 cob = texture2D(tCob, wp / 1.92).rgb * mix(0.9, 1.1, nz2.b);
  col = mix(col, mix(cob * 1.6, vec3(0.62, 0.58, 0.52), 0.25), cobW);
  travW = clamp(ma.b, 0.0, 1.0);
  vec3 trav = texture2D(tTrav, wp / 2.0).rgb * mix(0.85, 1.05, nz.g);
  col = mix(col, trav, travW);
  roadW = clamp(ma.r, 0.0, 1.0) * (1.0 - uEra);
  vec3 asph = texture2D(tAsph, wp / 5.0).rgb * mix(0.85, 1.1, nz2.b);
  col = mix(col, asph * 1.7, roadW);
  col *= mix(0.94, 1.06, nz.g) * 1.25;
  diffuseColor.rgb *= col;
`;
const NORMAL = /* glsl */`
  {
    vec2 wp2 = vWPos.xz;
    vec3 nS = texture2D(tSoilN, wp2 / 3.0).xyz * 2.0 - 1.0;
    vec3 nG = texture2D(tGrassN, wp2 / 4.0).xyz * 2.0 - 1.0;
    vec3 nC = texture2D(tCobN, wp2 / 1.92).xyz * 2.0 - 1.0;
    vec3 nT = texture2D(tTravN, wp2 / 2.0).xyz * 2.0 - 1.0;
    vec3 tn = mix(nS, nG, grassW);
    tn = mix(tn, nC, cobW);
    tn = mix(tn, nT, travW);
    tn = mix(tn, vec3(0.0, 0.0, 1.0), roadW * 0.85);
    vec3 Nw = normalize(normalize(vWNrm) + vec3(tn.x, 0.0, -tn.y) * 0.8);
    normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
  }
`;

// ---------------------------------------------------------------- helpers --
function polyInfo(pts) {
  const seg = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, ay, bx, bz, by, l, s0: L }); L += l;
  }
  return { seg, len: L };
}

// nearest point on a street: distance, and the floor height there
export function closestOnPoly(c, x, z) {
  let best = { d: 1e9, y: 0 };
  for (const s of c.seg) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    let u = ((x - s.ax) * dx + (z - s.az) * dz) / (s.l * s.l);
    u = clamp(u, 0, 1);
    const px = s.ax + dx * u, pz = s.az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, y: lerp(s.ay, s.by, u), px, pz };
  }
  return best;
}
