// Cutaway: one vertical plane through the amphitheatre, across the long axis
// (plane 'x': constant u) or along it (plane 'z': constant v). Everything on
// the far side is clipped; the cut faces are the back faces of the closed
// walls, painted as solid stone by the materials (see materials.js CUT).
// Same interface as Giza's SectionTool (see shared/app/shell.js).
import * as THREE from 'three';
import { CUT } from './materials.js';
import { dirWorld, toWorld } from './plan.js';
import { PLAN } from './data/site.js';

export class SectionTool {
  constructor({ groups }) {
    this.groups = groups;           // amphitheatre groups (both eras)
    this.enabled = false;
    this.target = 'amph'; this.plane = 'x'; this.offset = null; this.flip = false; this.era = 'today';
    this.clip = new THREE.Plane();
  }

  defaultOffset(id, plane) { return plane === 'x' ? 6.5 : 3.0; }

  range() { return this.plane === 'x' ? [-PLAN.a + 1, PLAN.a - 1] : [-PLAN.b + 1, PLAN.b - 1]; }

  set(opts) {
    Object.assign(this, opts);
    if (this.offset === null || opts.plane) {
      if (!('offset' in opts)) this.offset = this.defaultOffset(this.target, this.plane);
    }
    this.update();
  }

  // the cut keeps u <= offset ('x') or v <= offset ('z'), or the other side when flipped
  axis() {
    const [x, z] = this.plane === 'x' ? dirWorld(1, 0) : dirWorld(0, 1);
    const s = this.flip ? -1 : 1;
    return new THREE.Vector3(x * s, 0, z * s);
  }

  update() {
    const a = this.axis();
    const c = (this.offset ?? this.defaultOffset(this.target, this.plane)) * (this.flip ? -1 : 1);
    this.clip.set(a.clone().negate(), c);
    CUT.uCutN.value.copy(a);
    CUT.uCutT.value.set(-a.z, 0, a.x);
  }

  materials() {
    const out = new Set();
    for (const g of this.groups) g.traverse((m) => { if (m.isMesh && !m.userData.noClip) out.add(m.material); });
    return out;
  }

  setEnabled(on) {
    this.enabled = on;
    this.update();
    CUT.uCut.value = on ? 1 : 0;
    for (const m of this.materials()) {
      m.clippingPlanes = on ? [this.clip] : null;
      m.clipShadows = on;
      m.side = on ? THREE.DoubleSide : THREE.FrontSide;
      m.needsUpdate = true;
    }
  }

  // look at the cut face from the open side
  viewpoint() {
    const a = this.axis();
    // a point on the cut, and the camera out on the open side, a little to one side
    const [cx, cz] = this.plane === 'x' ? toWorld(this.offset, 0) : toWorld(0, this.offset);
    const side = this.plane === 'x' ? dirWorld(0, 1) : dirWorld(1, 0);
    const far = this.plane === 'x' ? 150 : 175;
    return {
      pos: [cx + a.x * far + side[0] * 40, 55, cz + a.z * far + side[1] * 40],
      target: [cx, 14, cz],
    };
  }
}
