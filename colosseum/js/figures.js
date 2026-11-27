// Articulated figures for the games: people (gladiators, a referee, beast
// fighters, attendants, the men at the capstans) and animals (a lion, a
// bear). Built from simple solids on a hierarchy of joints, posed
// procedurally each frame: a gait from speed, plus actions (guard, strike,
// thrust, block, throw, salute, kneel, appeal, push, roar, pounce).
// Figures face local +z; root.rotation.y = heading turns +z to (sin h, cos h).
import * as THREE from 'three';

// geometry factories; `low` for figures that are many and far (statues)
let LOW = false;
const G = {
  limb: (r, len) => new THREE.CapsuleGeometry(r, len, LOW ? 1 : 3, LOW ? 5 : 8),
  sphere: (r) => new THREE.SphereGeometry(r, LOW ? 6 : 12, LOW ? 4 : 9),
  box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
  cyl: (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, LOW ? Math.min(n, 6) : n),
};
const matCache = new Map();
export function figMat(color, { metal = 0, rough = 0.8 } = {}) {
  const k = `${color}-${metal}-${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
  return matCache.get(k);
}
const BRONZE = () => figMat(0xb3864a, { metal: 0.85, rough: 0.35 });
const STEEL = () => figMat(0xb8bcc2, { metal: 0.9, rough: 0.3 });
const WOOD = () => figMat(0x7a5a3a);
const SKINS = [0xc69072, 0xa8765a, 0xd4a587, 0x8a5a3c, 0xbf8a68];

function mesh(geo, mat, pos = [0, 0, 0], rot = null, scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  return m;
}
const grp = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

// ---------------------------------------------------------------- people --
export class Human {
  // kind: secutor | retiarius | referee | venator | attendant | worker | statue
  constructor(kind, { seed = 1, tunic = null, material = null, low = false } = {}) {
    this.kind = kind;
    LOW = low;
    const skin = material || figMat(SKINS[seed % SKINS.length], { rough: 0.7 });
    const cloth = material || figMat(tunic ?? ({ referee: 0xf2efe6, venator: 0xb08a4e, attendant: 0x8c6b4a, worker: 0x6e5a44, statue: 0xffffff }[kind] ?? 0xe8e0cc));
    const bare = kind === 'secutor' || kind === 'retiarius';
    const root = this.root = new THREE.Group();
    const hips = this.hips = grp(root, [0, 0.95, 0]);
    // torso and loincloth / tunic
    hips.add(mesh(G.cyl(0.165, 0.14, 0.52, 10), bare ? skin : cloth, [0, 0.27, 0], null, [1, 1, 0.62]));
    hips.add(mesh(G.cyl(0.15, 0.17, 0.2, 10), cloth, [0, 0.0, 0], null, [1, 1, 0.7]));
    if (!bare && kind !== 'statue') hips.add(mesh(G.cyl(0.17, 0.24, 0.32, 10), cloth, [0, -0.2, 0], null, [1, 1, 0.72]));     // tunic skirt
    if (bare) hips.add(mesh(G.cyl(0.165, 0.165, 0.07, 10), figMat(0x6b4a2a), [0, 0.1, 0], null, [1, 1, 0.66]));                // belt
    if (kind === 'referee') for (const x of [-0.07, 0.07]) hips.add(mesh(G.box(0.03, 0.5, 0.01), figMat(0x8a1f1f), [x, 0.25, 0.105]));  // clavi
    const neck = this.neck = grp(hips, [0, 0.55, 0]);
    neck.add(mesh(G.sphere(0.105), skin, [0, 0.13, 0.01]));
    this.headTop = neck;
    const mk = (side) => {
      const sh = grp(hips, [side * 0.2, 0.48, 0]);
      sh.add(mesh(G.limb(0.048, 0.2), skin, [0, -0.14, 0]));
      const el = grp(sh, [0, -0.29, 0]);
      el.add(mesh(G.limb(0.042, 0.19), skin, [0, -0.13, 0]));
      const hand = grp(el, [0, -0.27, 0]);
      hand.add(mesh(G.sphere(0.045), skin));
      const hip = grp(hips, [side * 0.09, -0.03, 0]);
      hip.add(mesh(G.limb(0.064, 0.28), skin, [0, -0.21, 0]));
      const kn = grp(hip, [0, -0.44, 0]);
      kn.add(mesh(G.limb(0.05, 0.3), skin, [0, -0.2, 0]));
      kn.add(mesh(G.box(0.09, 0.05, 0.22), figMat(0x5a4030), [0, -0.44, 0.05]));
      return { sh, el, hand, hip, kn };
    };
    this.L = mk(-1); this.R = mk(1);
    this.dress(kind);
    this.phase = Math.random() * 6; this.speed = 0; this.action = null; this.actionT = 0; this.actionDur = 1;
    this.kneel = 0; this.lean = 0;
    LOW = false;
  }

  dress(kind) {
    const { L, R } = this;
    if (kind === 'secutor') {
      // smooth egg-shaped helmet with two small eye holes, a big curved shield, a short sword
      const h = mesh(G.sphere(0.16), BRONZE(), [0, 0.15, 0.0], null, [0.95, 1.12, 1.12]);
      this.neck.add(h);
      this.neck.add(mesh(G.box(0.03, 0.05, 0.3), BRONZE(), [0, 0.3, -0.02]));
      for (const x of [-0.05, 0.05]) this.neck.add(mesh(G.sphere(0.018), figMat(0x111111), [x, 0.17, 0.165]));
      // the scutum: a curved rectangle carried in front of the left side
      const shield = this.shield = new THREE.Group();
      const face = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.95, 14, 1, true, -0.75, 1.5), figMat(0x8a2a22, { rough: 0.6 }), [0, 0, -0.2], null, [0.9, 1, 0.6]);
      face.material.side = THREE.DoubleSide;
      shield.add(face, mesh(G.sphere(0.07), BRONZE(), [0, 0, 0.12]));
      shield.position.set(-0.16, 0.2, 0.3);
      this.hips.add(shield);
      this.sword(R.hand, 0.5);
      R.el.add(mesh(G.limb(0.056, 0.2), figMat(0xd8d4cc), [0, -0.13, 0]));          // manica (padded sleeve)
      L.kn.add(mesh(G.limb(0.062, 0.22), BRONZE(), [0, -0.18, 0.02]));              // greave
      this.weapon = 'sword';
    } else if (kind === 'retiarius') {
      // no helmet; a shoulder guard (galerus) on the left, a net, a trident
      this.neck.add(mesh(G.sphere(0.108), figMat(0x2a1a10), [0, 0.15, -0.01], null, [1, 0.8, 1]));
      L.sh.add(mesh(G.box(0.05, 0.2, 0.16), BRONZE(), [-0.06, 0.08, 0], [0, 0, 0.25]));
      L.el.add(mesh(G.limb(0.054, 0.2), figMat(0xd8d4cc), [0, -0.13, 0]));
      const tri = new THREE.Group();
      tri.add(mesh(G.cyl(0.018, 0.018, 1.7, 6), WOOD(), [0, 0, 0.2]));
      for (const x of [-0.06, 0, 0.06]) tri.add(mesh(G.box(0.012, 0.22, 0.012), STEEL(), [x, 0.95, 0.2]));
      tri.add(mesh(G.box(0.14, 0.02, 0.02), STEEL(), [0, 0.85, 0.2]));
      tri.rotation.x = Math.PI / 2; tri.position.set(0, -0.02, 0.15);
      R.hand.add(tri);
      this.trident = tri;
      const net = mesh(G.sphere(0.13), figMat(0x9c8a64, { rough: 1 }), [0, -0.08, 0], null, [1, 1.3, 1]);
      L.hand.add(net); this.netBall = net;
      this.weapon = 'trident';
    } else if (kind === 'referee') {
      const staff = mesh(G.cyl(0.016, 0.016, 1.2, 6), WOOD(), [0, -0.02, 0.1], [Math.PI / 2.4, 0, 0]);
      R.hand.add(staff);
    } else if (kind === 'venator') {
      const spear = new THREE.Group();
      spear.add(mesh(G.cyl(0.02, 0.02, 2.2, 6), WOOD(), [0, 0, 0]));
      spear.add(mesh(G.cyl(0.0, 0.05, 0.3, 6), STEEL(), [0, 1.25, 0]));
      spear.add(mesh(G.box(0.22, 0.03, 0.03), STEEL(), [0, 1.05, 0]));
      spear.rotation.x = Math.PI / 2; spear.position.set(0, -0.02, 0.3);
      R.hand.add(spear); this.spear = spear;
      for (const kn of [L.kn, R.kn]) kn.add(mesh(G.limb(0.058, 0.24), figMat(0x8a7656), [0, -0.2, 0]));   // leg wrappings
      this.weapon = 'spear';
    } else if (kind === 'attendant') {
      R.hand.add(mesh(G.cyl(0.02, 0.02, 1.8, 6), WOOD(), [0, -0.02, 0.4], [Math.PI / 2.2, 0, 0]));
    }
  }

  sword(hand, len) {
    const s = new THREE.Group();
    s.add(mesh(G.box(0.05, len, 0.012), STEEL(), [0, len / 2 + 0.07, 0]));
    s.add(mesh(G.box(0.12, 0.03, 0.04), BRONZE(), [0, 0.06, 0]));
    s.add(mesh(G.cyl(0.02, 0.02, 0.1, 6), WOOD(), [0, 0, 0]));
    s.rotation.x = Math.PI / 2; s.position.set(0, -0.03, 0.02);
    hand.add(s);
  }

  act(name, dur = 1) { this.action = name; this.actionT = 0; this.actionDur = dur; }

  // set the joints for this frame; dt advances the gait and the action
  update(dt) {
    const { L, R } = this;
    const v = this.speed;
    this.phase += dt * (2.2 + v * 2.6);
    const a = Math.min(1, v / 1.6);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    // gait
    L.hip.rotation.x = -0.55 * a * s; R.hip.rotation.x = 0.55 * a * s;
    L.kn.rotation.x = 0.9 * a * Math.max(0, -c); R.kn.rotation.x = 0.9 * a * Math.max(0, c);
    L.sh.rotation.set(0.45 * a * s, 0, -0.08); R.sh.rotation.set(-0.45 * a * s, 0, 0.08);
    L.el.rotation.x = -0.3 - 0.2 * a; R.el.rotation.x = -0.3 - 0.2 * a;
    let lean = 0.06 * a, bob = Math.abs(s) * 0.03 * a, drop = 0, twist = 0;
    this.neck.rotation.set(0, 0, 0);
    // a fighter's guard between actions
    if (this.guard) {
      drop += 0.05;
      L.kn.rotation.x += 0.25; R.kn.rotation.x += 0.25; L.hip.rotation.x -= 0.2; R.hip.rotation.x -= 0.1;
      if (this.weapon === 'sword') { L.sh.rotation.x = -0.9; L.el.rotation.x = -0.9; R.sh.rotation.x = -0.6; R.el.rotation.x = -1.1; }
      else if (this.weapon === 'trident' || this.weapon === 'spear') { R.sh.rotation.x = -0.5; R.el.rotation.x = -1.3; L.sh.rotation.x = -0.8; L.el.rotation.x = -0.9; L.sh.rotation.z = 0.3; }
    }
    if (this.action) {
      this.actionT += dt / this.actionDur;
      const t = Math.min(1, this.actionT);
      const up = (a0, a1, t0, t1) => a0 + (a1 - a0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      switch (this.action) {
        case 'strike': {      // overhead cut
          const k = t < 0.4 ? up(0, 1, 0, 0.4) : up(1, 0, 0.4, 0.62);
          R.sh.rotation.x = -0.6 - 1.9 * k + (t > 0.4 && t < 0.75 ? 0.5 : 0); R.el.rotation.x = -1.1 + 0.8 * (t > 0.4 ? up(0, 1, 0.4, 0.6) : 0);
          lean += t > 0.4 && t < 0.8 ? 0.25 : 0; twist = 0.3 * Math.sin(t * Math.PI);
          break;
        }
        case 'thrust': {      // a jab with the trident or spear
          const k = t < 0.45 ? up(0, -0.3, 0, 0.45) : t < 0.6 ? up(-0.3, 1, 0.45, 0.6) : up(1, 0, 0.7, 1);
          R.sh.rotation.x = -0.5 - 0.9 * k; R.el.rotation.x = -1.3 + 1.2 * k; L.sh.rotation.x = -0.8 - 0.5 * k; L.el.rotation.x = -0.9 + 0.6 * k;
          lean += 0.3 * Math.max(0, k);
          break;
        }
        case 'block':
          L.sh.rotation.x = -1.5 * Math.sin(Math.min(1, t * 1.4) * Math.PI / 2); L.el.rotation.x = -0.3; lean -= 0.1;
          break;
        case 'throw': {       // the net, overarm
          const k = t < 0.5 ? up(0, 1, 0, 0.5) : up(1, -0.3, 0.5, 0.7);
          L.sh.rotation.x = -0.4 - 2.4 * k; L.el.rotation.x = -0.4; lean += t > 0.5 ? 0.2 : -0.1; twist = -0.4 * k;
          break;
        }
        case 'salute':
          R.sh.rotation.x = -2.9 * Math.min(1, t * 3); R.el.rotation.x = 0;
          break;
        case 'roar': break;
        case 'push':
          L.sh.rotation.x = -1.35; R.sh.rotation.x = -1.35; L.el.rotation.x = -0.5; R.el.rotation.x = -0.5; lean += 0.45;
          break;
        default: break;
      }
      if (this.actionT >= 1 && !this.holdAction) this.action = null;
    }
    // the shield rides higher in guard, up in front of the face to block
    if (this.shield) {
      const blk = this.action === 'block' ? Math.sin(Math.min(1, this.actionT * 1.4) * Math.PI / 2) : 0;
      const g = this.guard ? 1 : 0;
      this.shield.position.set(-0.16 + 0.08 * blk, 0.12 + 0.12 * g + 0.22 * blk, 0.26 + 0.1 * g + 0.12 * blk);
      this.shield.rotation.set(-0.15 * blk, 0.25 * (1 - blk) * g, 0);
    }
    // kneeling: down on the right knee
    if (this.kneel > 0) {
      const k = this.kneel;
      drop += 0.42 * k;
      R.hip.rotation.x = 0.1 * k; R.kn.rotation.x = 1.55 * k;
      L.hip.rotation.x = -1.45 * k; L.kn.rotation.x = 1.5 * k;
      if (this.appeal) { L.sh.rotation.x = -2.8 * k; L.el.rotation.x = -0.2; }
    }
    this.hips.position.y = 0.95 + bob - drop;
    this.hips.rotation.x = lean + this.lean;
    this.hips.rotation.y = twist;
  }
}

// --------------------------------------------------------------- animals --
export class Beast {
  constructor(kind) {
    this.kind = kind;
    const lion = kind === 'lion';
    const fur = figMat(lion ? 0xc09253 : 0x4a3424, { rough: 0.95 });
    const dark = figMat(lion ? 0x6a4320 : 0x2e2016, { rough: 1 });
    const root = this.root = new THREE.Group();
    const H = this.H = lion ? 0.95 : 0.85;
    const body = this.body = grp(root, [0, H, 0]);
    body.add(mesh(G.sphere(1), fur, [0, 0, 0], null, lion ? [0.3, 0.33, 0.85] : [0.42, 0.42, 0.78]));
    body.add(mesh(G.sphere(1), fur, [0, 0.03, 0.45], null, lion ? [0.32, 0.36, 0.42] : [0.46, 0.5, 0.45]));
    const head = this.head = grp(body, [0, lion ? 0.2 : 0.16, lion ? 0.85 : 0.82]);
    if (lion) head.add(mesh(G.sphere(0.36), dark, [0, -0.02, -0.12], null, [1, 1.05, 0.95]));    // mane
    head.add(mesh(G.sphere(lion ? 0.2 : 0.22), fur, [0, 0, 0.08]));
    head.add(mesh(G.box(lion ? 0.16 : 0.15, 0.13, 0.2), fur, [0, -0.06, 0.24]));
    head.add(mesh(G.sphere(0.035), figMat(0x1a1410), [0, -0.02, 0.35]));
    for (const x of [-1, 1]) head.add(mesh(G.sphere(0.06), lion ? fur : dark, [x * 0.12, 0.17, 0.03]));
    this.legs = [];
    const z0 = lion ? 0.55 : 0.5;
    for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = grp(body, [x * (lion ? 0.17 : 0.24), -0.08, z * z0]);
      hip.add(mesh(G.limb(lion ? 0.085 : 0.11, 0.32), fur, [0, -0.22, 0]));
      const kn = grp(hip, [0, -0.44, 0]);
      kn.add(mesh(G.limb(lion ? 0.06 : 0.085, 0.3), fur, [0, -0.2, 0]));
      kn.add(mesh(G.sphere(lion ? 0.075 : 0.095), fur, [0, -0.4, 0.04], null, [1, 0.6, 1.3]));
      this.legs.push({ hip, kn, front: z > 0, side: x });
    }
    const tail = this.tail = grp(body, [0, 0.08, -0.82]);
    let t = tail;
    for (let i = 0; i < (lion ? 4 : 1); i++) {
      t.add(mesh(G.limb(0.03, 0.16), fur, [0, 0, -0.1], [Math.PI / 2, 0, 0]));
      t = grp(t, [0, 0, -0.2]);
      this.tailEnd = t;
    }
    if (lion) t.add(mesh(G.sphere(0.06), dark));
    this.phase = 0; this.speed = 0; this.action = null; this.actionT = 0; this.actionDur = 1; this.leap = 0;
  }

  act(name, dur = 1) { this.action = name; this.actionT = 0; this.actionDur = dur; }

  update(dt) {
    const v = this.speed;
    const run = v > 3.2;
    this.phase += dt * (run ? 2 + v * 1.3 : 3 + v * 3);
    const a = Math.min(1, v / 1.5);
    let pitch = 0, lift = 0;
    for (const L of this.legs) {
      // walk: diagonal pairs; gallop: front pair, then hind pair
      const off = run ? (L.front ? 0 : Math.PI) + (L.side > 0 ? 0.35 : 0) : (L.front === (L.side > 0) ? 0 : Math.PI);
      const s = Math.sin(this.phase + off);
      L.hip.rotation.x = (run ? 0.75 : 0.42) * a * s;
      L.kn.rotation.x = (L.front ? -1 : 1) * (run ? 0.9 : 0.5) * a * Math.max(0, Math.cos(this.phase + off));
    }
    if (run) { pitch = 0.12 * Math.sin(this.phase); lift = 0.06 * Math.abs(Math.sin(this.phase)); }
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(0.5 + 0.2 * Math.sin(this.phase * 0.5), 0.3 * Math.sin(this.phase * 0.7), 0);
    if (this.action) {
      this.actionT += dt / this.actionDur;
      const t = Math.min(1, this.actionT);
      if (this.action === 'roar') { this.head.rotation.x = -0.5 * Math.sin(t * Math.PI); pitch -= 0.15 * Math.sin(t * Math.PI); }
      if (this.action === 'pounce') {
        // crouch, spring, land
        if (t < 0.3) { lift -= 0.25 * (t / 0.3); pitch += 0.1; }
        else { const k = (t - 0.3) / 0.7; lift += Math.sin(k * Math.PI) * 1.1; pitch -= 0.35 * Math.cos(k * Math.PI); for (const L of this.legs) L.hip.rotation.x = L.front ? -0.9 : 0.8; }
      }
      if (this.action === 'crouch') { lift -= 0.2; this.head.rotation.x = 0.2; }
      if (this.actionT >= 1) this.action = null;
    }
    this.body.position.y = this.H + lift;
    this.body.rotation.x = pitch;
  }
}

// A static figure as one geometry (for instancing statues): pose it, then
// merge its meshes.
export function figureGeometry(fig) {
  fig.update(0);
  fig.root.updateMatrixWorld(true);
  const geos = [];
  fig.root.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    geos.push(g.index ? g.toNonIndexed() : g);
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
