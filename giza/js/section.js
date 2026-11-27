// Cross-section ("cutaway") tool.
//
// A vertical plane cuts one pyramid and the bedrock beneath it.  Everything
// inside the pyramid's footprint box on the far side of the plane is clipped
// (one shared set of clipping planes with clipIntersection), and the cut
// faces are rebuilt analytically: pyramid outline minus the rooms, plus a
// bedrock face and an excavation pit so the underground chambers show.
import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { GeoBuilder } from '../../shared/engine/geo.js';
import { steppedProfile, casingProfile } from './pyramid.js';
import { TEX } from './materials.js';

const PIT_DEPTH = 48;

export class SectionTool {
  constructor({ scene, pyr, interiors, terrain }) {
    this.scene = scene; this.pyr = pyr; this.interiors = interiors; this.terrain = terrain;
    this.enabled = false;
    this.target = 'khufu'; this.plane = 'x'; this.offset = null; this.flip = false; this.era = 'today';
    this.planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
    this.group = new THREE.Group(); this.group.name = 'section-caps';
    scene.add(this.group);
    const tCap = TEX.limestone.clone(); tCap.repeat.set(1 / 2.2, 1 / 2.2); tCap.needsUpdate = true;
    const tRock = TEX.rock.clone(); tRock.repeat.set(1 / 9, 1 / 9); tRock.needsUpdate = true;
    this.capMat = new THREE.MeshStandardMaterial({ map: tCap, color: 0xf6ead6, roughness: 0.9, emissive: 0x8a7558, emissiveIntensity: 0.55, vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.rockMat = new THREE.MeshStandardMaterial({ map: tRock, color: 0xdcc9a8, roughness: 0.95, emissive: 0x5a4834, emissiveIntensity: 0.5, vertexColors: true, side: THREE.DoubleSide });
    // course lines and block joints drawn on the cut face
    this.courseTex = new THREE.DataTexture(new Uint8Array(4096 * 4), 4096, 1, THREE.RGBAFormat);
    this.courseTex.magFilter = THREE.NearestFilter; this.courseTex.minFilter = THREE.NearestFilter;
    this.capU = { uCourses: { value: this.courseTex }, uH: { value: 150 }, uBaseY: { value: 0 }, uPlane: { value: 0 } };
    this.capMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.capU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform sampler2D uCourses; uniform float uH, uBaseY, uPlane;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float y = vWPos.y - uBaseY;
            vec4 c = texture2D(uCourses, vec2(clamp(y / uH, 0.0, 1.0), 0.5));
            float dist = c.r * 2.55;                       // metres to the nearest course joint
            float fw = fwidth(y);
            float hl = 1.0 - smoothstep(0.02, 0.02 + fw * 1.5, dist);
            float s = mix(vWPos.z, vWPos.x, uPlane);
            float L = 1.2 + c.g * 1.1;
            float u = (s + c.b * 9.0) / L;
            float fu = abs(fract(u) - 0.5) * 2.0;
            float vl = smoothstep(1.0 - (0.04 + fwidth(u) * 1.5) , 1.0, fu);
            float fade = 1.0 - smoothstep(0.03, 0.12, fw);
            diffuseColor.rgb *= 1.0 - 0.45 * max(hl, vl) * fade;
            diffuseColor.rgb *= 0.93 + c.g * 0.12;
          }`);
    };
    this.capMat.customProgramCacheKey = () => 'section-cap';
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x2b1d10, transparent: true, opacity: 0.85 });
    this.capMeshes = [];
  }

  defaultOffset(id, plane) {
    if (id === 'khufu') return plane === 'x' ? 7.29 : 11.0;
    if (id === 'khafre') return plane === 'x' ? 6.0 : 0.0;
    return plane === 'x' ? 0.0 : -2.0;
  }

  range() {
    const info = this.pyr.info[this.target];
    return [-info.half + 0.5, info.half - 0.5];
  }

  set(opts) {
    Object.assign(this, opts);
    if (this.offset === null || opts.target || opts.plane) {
      if (!('offset' in opts)) this.offset = this.defaultOffset(this.target, this.plane);
    }
    this.update();
  }

  setEnabled(on) {
    this.enabled = on;
    this.group.visible = on;
    this.applyClipping(on);
    if (on) this.update();
  }

  // world position of the cut plane and the removed side
  frame() {
    const info = this.pyr.info[this.target];
    const P = info.P;
    const c = this.offset ?? this.defaultOffset(this.target, this.plane);
    const half = info.half + 0.6;
    return { info, P, c, half, sign: this.flip ? -1 : 1 };
  }

  updateCourseTex(info) {
    if (this._courseFor === info.P.id + this.era) return;
    this._courseFor = info.P.id + this.era;
    const ys = this.era === 'built' ? info.bys : info.ys;
    const H = ys[ys.length - 1] + 1;
    const d = this.courseTex.image.data;
    let k = 0;
    for (let j = 0; j < 4096; j++) {
      const y = (j + 0.5) / 4096 * H;
      while (k < ys.length - 2 && ys[k + 1] < y) k++;
      const dist = Math.min(y - ys[k], (ys[k + 1] ?? 1e9) - y);
      const hsh = (Math.sin(k * 91.7) * 43758.5453) % 1;
      d[j * 4] = Math.min(255, Math.round(Math.max(0, dist) * 100));
      d[j * 4 + 1] = Math.abs(hsh) * 255;
      d[j * 4 + 2] = Math.abs((Math.sin(k * 12.9) * 9631.1) % 1) * 255;
      d[j * 4 + 3] = 255;
    }
    this.courseTex.needsUpdate = true;
    this.capU.uH.value = H;
  }

  update() {
    if (!this.enabled) return;
    const { info, P, c, half, sign } = this.frame();
    this.updateCourseTex(info);
    this.capU.uBaseY.value = P.baseY;
    this.capU.uPlane.value = this.plane === 'x' ? 0 : 1;
    const [p0, p1, p2, p3] = this.planes;
    if (this.plane === 'x') {
      const xc = P.cx + c;
      // removed: sign*(x - xc) > 0, within the footprint box
      p0.set(new THREE.Vector3(-sign, 0, 0), sign * xc);
      p1.set(new THREE.Vector3(sign, 0, 0), -sign * (P.cx + sign * half));
      p2.set(new THREE.Vector3(0, 0, -1), P.cz - half);
      p3.set(new THREE.Vector3(0, 0, 1), -(P.cz + half));
    } else {
      const zc = P.cz + c;
      p0.set(new THREE.Vector3(0, 0, -sign), sign * zc);
      p1.set(new THREE.Vector3(0, 0, sign), -sign * (P.cz + sign * half));
      p2.set(new THREE.Vector3(-1, 0, 0), P.cx - half);
      p3.set(new THREE.Vector3(1, 0, 0), -(P.cx + half));
    }
    this.rebuildCaps();
  }

  applyClipping(on) {
    this.scene.traverse((o) => {
      if (!o.material || o.userData.noClip) return;
      let n = o;
      while (n) { if (n === this.group || n.userData?.noClip) return; n = n.parent; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.isShaderMaterial && !m.isMeshStandardMaterial && m.uniforms?.sunPosition) continue; // sky
        m.clippingPlanes = on ? this.planes : null;
        m.clipIntersection = true;
        m.clipShadows = true;
        m.needsUpdate = true;
      }
    });
  }

  // ------------------------------------------------------------- caps ----
  rebuildCaps() {
    for (const m of this.capMeshes) { this.group.remove(m); m.geometry.dispose(); }
    this.capMeshes = [];
    const { info, P, c, half, sign } = this.frame();
    const it = this.interiors[this.target];
    const holes = it.section(this.plane, c, this.era).map((p) => ring(p));
    const pyrOutline = this.pyramidOutline(info, c);
    const yBot = -PIT_DEPTH;
    // terrain profile along the cut line (local coords)
    const s0 = -half, s1 = half;
    const N = 120;
    const ground = [];
    for (let i = 0; i <= N; i++) {
      const s = s0 + (s1 - s0) * (i / N);
      const [wx, wz] = this.plane === 'x' ? [P.cx + c, P.cz + s] : [P.cx + s, P.cz + c];
      ground.push([s, this.terrain.heightAt(wx, wz) - P.baseY]);
    }
    const groundPoly = [[s1, yBot], [s0, yBot], ...ground];
    let pyrCap = [], rockCap = [];
    try {
      pyrCap = pyrOutline ? polygonClipping.difference([ring(pyrOutline)], ...holes.map((h) => [h])) : [];
      const rockMinusPyr = pyrOutline ? polygonClipping.difference([ring(groundPoly)], [ring(pyrOutline)]) : [[ring(groundPoly)]];
      rockCap = polygonClipping.difference(rockMinusPyr, ...holes.map((h) => [h]));
    } catch (e) { console.warn('section', e); }
    const eps = 0.012 * -sign; // nudge caps onto the kept side
    const basis = this.basis(P, c + (this.plane === 'x' ? eps : eps), sign);
    const gP = new GeoBuilder(), gR = new GeoBuilder();
    const lines = [];
    const emit = (gb, mp, col) => {
      for (const poly of mp) {
        const outer = poly[0].slice(0, -1);
        const hs = poly.slice(1).map((h) => h.slice(0, -1));
        if (outer.length >= 3) gb.polyHoles(outer, hs, basis, col, 1);
        for (const r of poly) for (let i = 0; i < r.length - 1; i++) lines.push(r[i], r[i + 1]);
      }
    };
    emit(gP, pyrCap, [1, 1, 1]);
    emit(gR, rockCap, [1, 1, 1]);
    const add = (gb, mat) => {
      if (!gb.count) return;
      const m = new THREE.Mesh(gb.build(), mat);
      m.receiveShadow = true; m.userData.noClip = true;
      this.group.add(m); this.capMeshes.push(m);
    };
    add(gP, this.capMat);
    add(gR, this.rockMat);
    // outline
    if (lines.length) {
      const pos = [];
      const to3 = (q) => basis.o.clone().addScaledVector(basis.u, q[0]).addScaledVector(basis.v, q[1]).addScaledVector(basis.n, 0.01);
      for (const q of lines) { const v = to3(q); pos.push(v.x, v.y, v.z); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const l = new THREE.LineSegments(lg, this.lineMat);
      l.userData.noClip = true;
      this.group.add(l); this.capMeshes.push(l);
    }
    // pit walls and floor (the excavated half of the bedrock)
    const gW = new GeoBuilder();
    const wallLine = (fixed, from, to) => {
      // wall along the box edge at s = fixed, running from the plane to the far end
      const pts = [];
      const M = 40;
      for (let i = 0; i <= M; i++) {
        const t = from + (to - from) * (i / M);
        const [wx, wz] = this.plane === 'x' ? [P.cx + t, P.cz + fixed] : [P.cx + fixed, P.cz + t];
        pts.push([t, this.terrain.heightAt(wx, wz) - P.baseY]);
      }
      return pts;
    };
    const far = sign * half;
    for (const fixed of [-half, half]) {
      const top = wallLine(fixed, c, far);
      const poly = [[top[0][0], yBot], [top[top.length - 1][0], yBot], ...top.slice().reverse()];
      const b = this.sideBasis(P, fixed, fixed < 0 ? 1 : -1);
      gW.polyHoles(poly, [], b, [0.85, 0.82, 0.78], 1);
    }
    // floor
    {
      const a = Math.min(c, far), bnd = Math.max(c, far);
      const pts = this.plane === 'x'
        ? [[P.cx + a, P.baseY + yBot, P.cz - half], [P.cx + bnd, P.baseY + yBot, P.cz - half], [P.cx + bnd, P.baseY + yBot, P.cz + half], [P.cx + a, P.baseY + yBot, P.cz + half]]
        : [[P.cx - half, P.baseY + yBot, P.cz + a], [P.cx + half, P.baseY + yBot, P.cz + a], [P.cx + half, P.baseY + yBot, P.cz + bnd], [P.cx - half, P.baseY + yBot, P.cz + bnd]];
      gW.poly(pts, [0, 1, 0], [0.7, 0.66, 0.6]);
    }
    if (gW.count) {
      const m = new THREE.Mesh(gW.build(), this.rockMat);
      m.receiveShadow = true; m.userData.noClip = true;
      this.group.add(m); this.capMeshes.push(m);
    }
  }

  pyramidOutline(info, c) {
    if (this.era === 'built') {
      return casingProfile(info.half, info.tanA, c);
    }
    let out = steppedProfile(info.ys, info.S, c, info.cfg.concavity);
    if (this.target === 'khafre' && out) {
      // the surviving casing cap
      const capY = 103.5;
      const cas = casingProfile(info.half, info.tanA, c);
      if (cas) {
        const capPoly = [[-info.half, capY], [info.half, capY], [info.half, 400], [-info.half, 400]];
        try {
          const top = polygonClipping.intersection([ring(cas)], [ring(capPoly)]);
          const u = polygonClipping.union([ring(out)], ...top);
          if (u.length) out = u[0][0].slice(0, -1);
        } catch (e) { /* keep stepped */ }
      }
    }
    return out;
  }

  // basis for the cut plane: (s, y) -> world
  basis(P, c, sign) {
    if (this.plane === 'x') {
      return { o: new THREE.Vector3(P.cx + c, P.baseY, P.cz), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(sign, 0, 0) };
    }
    return { o: new THREE.Vector3(P.cx, P.baseY, P.cz + c), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, sign) };
  }

  sideBasis(P, fixed, inward) {
    if (this.plane === 'x') {
      return { o: new THREE.Vector3(P.cx, P.baseY, P.cz + fixed), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, inward) };
    }
    return { o: new THREE.Vector3(P.cx + fixed, P.baseY, P.cz), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(inward, 0, 0) };
  }

  // a good camera position to look at the cut face
  viewpoint() {
    const { P, c, sign, info } = this.frame();
    const h = info.P.heightNow;
    if (this.plane === 'x') {
      const x = P.cx + c + sign * (h * 1.9);
      return { pos: [x, P.baseY + h * 0.35, P.cz + 25], target: [P.cx + c, P.baseY + h * 0.22, P.cz] };
    }
    const z = P.cz + c + sign * (h * 1.9);
    return { pos: [P.cx - 25, P.baseY + h * 0.35, z], target: [P.cx, P.baseY + h * 0.22, P.cz + c] };
  }
}

function ring(pts) {
  const r = pts.map((p) => [p[0], p[1]]);
  const a = r[0], b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return r;
}
