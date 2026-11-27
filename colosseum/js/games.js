// A day at the games, c. 90 CE, played in a loop while the era is "As built":
//
//   1. A beast hunt (venatio). In the basement, two men turn a capstan and a
//      lion is winched up in its cage; the trapdoors over the shaft swing
//      open, the cage reaches the arena floor and its gate slides up. A
//      venator with a hunting spear comes in by the eastern gate. They circle;
//      the lion charges and he sidesteps. Attendants drive the lion out.
//      (The next time round it is a bear.)
//   2. A gladiator bout: a secutor (helmet, big shield, short sword) against
//      a retiarius (net, trident), with a referee. They salute the emperor's
//      box, then trade attacks; the retiarius casts his net and misses.
//      In the end he goes down on one knee and raises a finger to appeal; the
//      referee steps between them, and the appeal is granted: both leave.
//
// The fights are stylised: no one is hurt. Everything here lives in the plan
// frame of the 90 CE amphitheatre (u along the long axis, v across).
import * as THREE from 'three';
import { Human, Beast } from './figures.js';
import { setLift, HYP, HYP_FLOOR, HYP_DECK } from './hypogeum.js';

const EAST = [43.5, 0], WEST = [-43.5, 0];
const smooth = (t) => t * t * (3 - 2 * t);

export class Games {
  constructor(amph) {
    this.group = new THREE.Group();
    this.group.name = 'games';
    amph.group.add(this.group);
    this.lifts = amph.hyp.lifts;
    this.excite = 0;
    this.time = 0;
    this.tasks = [];
    this.round = 0;
    // the cast
    const add = (f) => { this.group.add(f.root); f.root.visible = false; return f; };
    this.lion = add(new Beast('lion'));
    this.bear = add(new Beast('bear'));
    this.venator = add(new Human('venator', { seed: 3 }));
    this.secutor = add(new Human('secutor', { seed: 1 }));
    this.retiarius = add(new Human('retiarius', { seed: 4 }));
    this.referee = add(new Human('referee', { seed: 2 }));
    this.handlers = [add(new Human('attendant', { seed: 0 })), add(new Human('attendant', { seed: 5, tunic: 0x7a5236 }))];
    this.workers = [add(new Human('worker', { seed: 1 })), add(new Human('worker', { seed: 3, tunic: 0x5e4a36 }))];
    // gladiators waiting in the cells below, and their attendants
    this.waiting = [];
    const cells = HYP.cells.filter((c) => c.u0 > 8 && c.u0 < 28).slice(0, 4);
    for (const [i, c] of cells.entries()) {
      const g = add(new Human(i % 2 ? 'retiarius' : 'secutor', { seed: 6 + i }));
      g.guard = i === 2;
      this.waiting.push(g);
    }
    // the net, once thrown
    const netG = new THREE.CircleGeometry(1.1, 10);
    netG.rotateX(-Math.PI / 2);
    this.net = new THREE.Mesh(netG, new THREE.MeshStandardMaterial({ color: 0x9c8a64, roughness: 1, wireframe: true }));
    this.net.visible = false;
    this.group.add(this.net);
    this.actors = [this.lion, this.bear, this.venator, this.secutor, this.retiarius, this.referee, ...this.handlers, ...this.workers, ...this.waiting];
    for (const a of this.actors) Object.assign(a, { pos: new THREE.Vector2(), y: 0, heading: 0, target: null, want: 0 });
    cells.forEach((c, i) => {
      const v = (c.v0 + c.v1) / 2;
      this.place(this.waiting[i], [c.u1 + 1.2, v > 0 ? c.v1 - 0.4 : c.v0 + 0.4], v > 0 ? Math.PI : 0, HYP_FLOOR);
    });
    this.spawn(this.programme());
  }

  // ----------------------------------------------------------- scheduler
  spawn(gen) { this.tasks.push({ gen, wait: 0, until: null }); }
  step(dt) {
    for (const t of this.tasks.slice()) {
      if (t.wait > 0) { t.wait -= dt; if (t.wait > 0) continue; }
      if (t.until && !t.until()) continue;
      t.until = null;
      const r = t.gen.next();
      if (r.done) { this.tasks.splice(this.tasks.indexOf(t), 1); continue; }
      if (typeof r.value === 'number') t.wait = r.value;
      else if (typeof r.value === 'function') t.until = r.value;
    }
  }
  *tween(dur, fn) { let t = 0; while (t < 1) { t = Math.min(1, t + this.dt / dur); fn(t); yield () => true; } }

  // ------------------------------------------------------------ movement
  place(a, [u, v], heading = 0, y = 0) { a.pos.set(u, v); a.y = y; a.heading = heading; a.target = null; a.speed = 0; a.root.visible = true; }
  goTo(a, [u, v], speed = 1.4) { a.target = new THREE.Vector2(u, v); a.want = speed; return () => !a.target; }
  face(a, [u, v]) { a.faceAt = new THREE.Vector2(u, v); }
  move(a, dt) {
    if (a.target) {
      const d = a.target.clone().sub(a.pos), L = d.length();
      if (L < 0.12) { a.target = null; a.speed *= 0.5; }
      else {
        const want = Math.atan2(d.x, d.y);
        let dh = want - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        a.heading += dh * Math.min(1, dt * (a.strafe ? 0 : 6));
        const k = Math.max(0, Math.cos(dh));
        a.speed += (a.want * (a.strafe ? 1 : k) - a.speed) * Math.min(1, dt * 4);
        const st = Math.min(L, a.speed * dt);
        a.pos.addScaledVector(d.normalize(), st);
      }
    } else a.speed *= Math.max(0, 1 - dt * 6);
    if (a.faceAt && (!a.target || a.strafe)) {
      const d = a.faceAt.clone().sub(a.pos);
      if (d.lengthSq() > 0.01) { let dh = Math.atan2(d.x, d.y) - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.heading += dh * Math.min(1, dt * 5); }
    }
    a.root.position.set(a.pos.x, a.y, a.pos.y);
    a.root.rotation.y = a.heading;
    a.update(dt);
  }

  update(dt) {
    this.dt = Math.min(dt, 0.05);
    this.time += this.dt;
    this.step(this.dt);
    for (const a of this.actors) if (a.root.visible) this.move(a, this.dt);
    this.excite += ((this.exciteTarget || 0.15) - this.excite) * Math.min(1, this.dt * 2);
    if (this.netFly) this.netFly(this.dt);
  }

  // ------------------------------------------------------------- the day
  *programme(from = 'venatio') {
    yield 1.5;
    let skip = from === 'bout';
    for (;;) {
      if (!skip) { yield* this.venatio(this.round % 2 ? this.bear : this.lion); yield 3; }
      skip = false;
      yield* this.bout();
      yield 4;
      this.round++;
    }
  }

  // the middle of whatever is happening in the arena (plan u, v), or null
  actionCentre() {
    const on = [this.lion, this.bear, this.venator, this.secutor, this.retiarius].filter((a) => a.root.visible && a.y > -0.5);
    if (!on.length) return null;
    const c = new THREE.Vector2();
    for (const a of on) c.add(a.pos);
    return c.multiplyScalar(1 / on.length);
  }

  // start the programme again at 'venatio' or 'bout' (the guided tour cues them)
  startAt(from, { beast = 'lion' } = {}) {
    this.tasks = [];
    for (const a of this.actors) if (!this.waiting.includes(a)) { a.root.visible = false; a.target = null; a.action = null; a.holdAction = false; a.guard = false; a.kneel = 0; a.appeal = false; a.strafe = false; }
    for (const L of this.lifts) setLift(L, 0, 0, 0);
    this.net.visible = false; this.netFly = null;
    this.round = beast === 'bear' ? 1 : 0;
    this.spawn(this.programme(from));
  }

  // raise a beast through the floor in lift L
  *raise(L, beast) {
    const into = [-L.n[0], -L.n[1]];                 // towards the middle of the arena
    this.place(beast, [L.u, L.v], Math.atan2(into[0], into[1]), HYP_FLOOR + 0.1);
    beast.speed = 0;
    const [w1, w2] = this.workers;
    const C = L.capPos;
    let spin = L.cap.rotation.y;
    // the two men walk round the capstan pushing its bars
    const orbit = () => {
      [w1, w2].forEach((w, i) => {
        const a = spin + i * Math.PI + 0.6;
        w.pos.set(C[0] + Math.cos(a) * 1.05, C[1] - Math.sin(a) * 1.05);
        w.y = HYP_DECK; w.heading = Math.atan2(-Math.sin(a), -Math.cos(a)); w.target = null;
        w.speed = 1.0;
        if (w.action !== 'push') { w.act('push', 10); w.holdAction = true; }
      });
    };
    w1.root.visible = w2.root.visible = true;
    yield* this.tween(8.5, (t) => {
      spin += this.dt * 1.1;
      const rise = smooth(t);
      setLift(L, rise, smooth(Math.min(1, Math.max(0, (t - 0.7) / 0.18))), 0, spin);
      beast.y = L.y + 0.1;
      orbit();
      this.exciteTarget = 0.3 + 0.3 * t;
    });
    for (const w of [w1, w2]) { w.speed = 0; w.holdAction = false; w.action = null; }
    yield 0.4;
    yield* this.tween(1.2, (t) => setLift(L, 1, 1, smooth(t)));
    beast.y = 0;
  }

  // lower the empty cage and close the trapdoors
  *lower(L) {
    yield* this.tween(1.0, (t) => setLift(L, 1, 1, 1 - smooth(t)));
    let spin = L.cap.rotation.y;
    yield* this.tween(7, (t) => { spin -= this.dt * 1.1; setLift(L, 1 - smooth(t), 1 - smooth(Math.min(1, t * 4)), 0, spin); });
  }

  *venatio(beast) {
    const lion = beast === this.lion;
    // a lift on the north side for the lion, on the south for the bear
    const want = lion ? [6, -21] : [-6, 21];
    const L = this.lifts.reduce((b, l) => (Math.hypot(l.u - want[0], l.v - want[1]) < Math.hypot(b.u - want[0], b.v - want[1]) ? l : b), this.lifts[0]);
    const V = this.venator;
    this.place(V, [EAST[0] + 3, EAST[1]], -Math.PI / 2);
    yield* this.raise(L, beast);
    // the venator comes in as the gate opens
    this.goTo(V, [16, lion ? -4 : 4], 1.6);
    // out of the cage, a roar
    const out = [L.u - L.n[0] * 4.5, L.v - L.n[1] * 4.5];
    yield this.goTo(beast, out, 1.3);
    beast.act('roar', 1.6); this.exciteTarget = 0.7;
    yield 1.6;
    this.spawn(this.lower(L));
    V.guard = true; this.face(V, [beast.pos.x, beast.pos.y]);
    // three passes: circle, charge, sidestep and jab
    for (let i = 0; i < 3; i++) {
      // circle at a distance
      const c = V.pos.clone();
      for (let k = 0; k < 6; k++) {
        const ang = Math.atan2(beast.pos.x - c.x, beast.pos.y - c.y) + 0.45;
        this.goTo(beast, [c.x + Math.sin(ang) * 7, c.y + Math.cos(ang) * 7], 1.8);
        this.face(V, [beast.pos.x, beast.pos.y]);
        yield 0.55;
      }
      // crouch and charge
      this.exciteTarget = 0.9;
      beast.act('crouch', 0.6); beast.target = null; yield 0.6;
      const dir = V.pos.clone().sub(beast.pos).normalize();
      const past = V.pos.clone().addScaledVector(dir, 5);
      this.goTo(beast, [past.x, past.y], 7.5);
      if (i === 1) beast.act('pounce', 1.1);
      yield () => beast.pos.distanceTo(V.pos) < 3.2 || !beast.target;
      // the venator steps aside and jabs
      const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(i % 2 ? -1.6 : 1.6);
      V.strafe = true; this.goTo(V, [V.pos.x + side.x, V.pos.y + side.y], 3.5);
      V.act('thrust', 0.7);
      yield () => !beast.target;
      V.strafe = false;
      this.exciteTarget = 0.6;
      beast.act('roar', 1.2); this.face(V, [beast.pos.x, beast.pos.y]);
      yield 1.3;
    }
    // attendants come in from the west and drive the beast out by the east gate
    const [h1, h2] = this.handlers;
    this.place(h1, [WEST[0] - 3, -1.2], Math.PI / 2); this.place(h2, [WEST[0] - 3, 1.2], Math.PI / 2);
    this.goTo(h1, [beast.pos.x - 6, beast.pos.y - 2], 2.2); this.goTo(h2, [beast.pos.x - 6, beast.pos.y + 2], 2.2);
    yield 2.5;
    this.goTo(beast, [EAST[0] - 4, 0], 4.5);
    yield () => !beast.target;
    this.goTo(beast, [EAST[0] + 6, 0], 4.5);
    yield () => !beast.target;
    beast.root.visible = false;
    // the venator salutes the emperor's box, all leave
    V.guard = false;
    this.goTo(V, [2, 12], 1.5); yield () => !V.target;
    this.face(V, [0, 40]); yield 0.6;
    V.act('salute', 2); this.exciteTarget = 0.8; yield 2;
    this.exciteTarget = 0.2;
    this.goTo(V, [EAST[0] + 4, 0], 1.6); this.goTo(h1, [WEST[0] - 4, -1], 1.6); this.goTo(h2, [WEST[0] - 4, 1], 1.6);
    yield () => !V.target && !h1.target && !h2.target;
    for (const a of [V, h1, h2]) a.root.visible = false;
  }

  *bout() {
    const S = this.secutor, Rt = this.retiarius, Rf = this.referee;
    S.kneel = Rt.kneel = 0; Rt.appeal = false;
    Rt.netBall.visible = true; this.net.visible = false;
    this.place(S, [WEST[0] - 3, -1], Math.PI / 2); this.place(Rt, [WEST[0] - 3, 1], Math.PI / 2); this.place(Rf, [WEST[0] - 5, 0], Math.PI / 2);
    // the parade in, and the salute to the emperor's box
    this.goTo(S, [-3, 6], 1.3); this.goTo(Rt, [3, 6], 1.3); this.goTo(Rf, [0, 1], 1.2);
    yield () => !S.target && !Rt.target;
    for (const g of [S, Rt]) this.face(g, [0, 40]);
    yield 0.8;
    S.act('salute', 2.2); Rt.act('salute', 2.2); this.exciteTarget = 0.75;
    yield 2.4;
    // to their marks, face to face
    this.goTo(S, [-1.6, 0], 1.2); this.goTo(Rt, [1.6, 0], 1.2); this.goTo(Rf, [0, -5], 1.2);
    yield () => !S.target && !Rt.target;
    S.guard = Rt.guard = true;
    let ang = 0;
    for (let round = 0; round < 8; round++) {
      // circle round each other
      for (let k = 0; k < 4; k++) {
        ang += 0.22;
        const mid = S.pos.clone().add(Rt.pos).multiplyScalar(0.5);
        const r = round === 3 ? 2.6 : 1.55;
        S.strafe = Rt.strafe = true;
        this.goTo(S, [mid.x - Math.cos(ang) * r, mid.y - Math.sin(ang) * r], 1.1);
        this.goTo(Rt, [mid.x + Math.cos(ang) * r, mid.y + Math.sin(ang) * r], 1.1);
        this.goTo(Rf, [mid.x + Math.sin(ang) * 4.5, mid.y - Math.cos(ang) * 4.5], 1.0);
        this.face(S, [Rt.pos.x, Rt.pos.y]); this.face(Rt, [S.pos.x, S.pos.y]); this.face(Rf, [mid.x, mid.y]);
        yield 0.45;
      }
      S.strafe = Rt.strafe = false;
      this.exciteTarget = 0.85;
      if (round === 3) {
        // the retiarius casts his net, and misses
        Rt.act('throw', 0.9); yield 0.45;
        Rt.netBall.visible = false;
        this.throwNet(Rt, S);
        S.act('block', 0.8);
        yield 1.2;
      } else if (round % 2) {
        // the secutor cuts; the retiarius gives ground
        S.act('strike', 0.9);
        const back = Rt.pos.clone().sub(S.pos).normalize().multiplyScalar(1.1);
        Rt.strafe = true; this.goTo(Rt, [Rt.pos.x + back.x, Rt.pos.y + back.y], 2.4);
        yield 1.0;
      } else {
        // the retiarius jabs with the trident; the secutor blocks with his shield
        Rt.act('thrust', 0.8); S.act('block', 0.9);
        yield 1.0;
      }
      Rt.strafe = false;
      this.exciteTarget = 0.5;
      yield 0.4;
    }
    // the appeal: down on one knee, a finger raised
    S.guard = Rt.guard = false;
    this.exciteTarget = 1;
    yield* this.tween(0.8, (t) => { Rt.kneel = smooth(t); });
    Rt.appeal = true;
    const mid = S.pos.clone().add(Rt.pos).multiplyScalar(0.5);
    this.goTo(Rf, [mid.x, mid.y], 2.2);
    yield 2.5;
    // the editor grants missio
    this.face(S, [0, 40]); S.act('salute', 2); yield 2.2;
    Rt.appeal = false;
    yield* this.tween(0.8, (t) => { Rt.kneel = 1 - smooth(t); });
    this.exciteTarget = 0.3;
    this.goTo(S, [WEST[0] - 4, -1], 1.4); this.goTo(Rt, [WEST[0] - 4, 1], 1.3); this.goTo(Rf, [WEST[0] - 6, 0], 1.3);
    yield () => !S.target && !Rt.target && !Rf.target;
    for (const a of [S, Rt, Rf]) a.root.visible = false;
    this.net.visible = false;
  }

  // the net flies in an arc and falls short of the secutor
  throwNet(from, to) {
    const p0 = from.pos.clone(), p1 = to.pos.clone().sub(from.pos).multiplyScalar(0.75).add(from.pos);
    let t = 0;
    this.net.visible = true;
    this.netFly = (dt) => {
      t = Math.min(1, t + dt / 0.9);
      const p = p0.clone().lerp(p1, t);
      this.net.position.set(p.x, 1.6 * Math.sin(t * Math.PI) + 0.03 + (1 - t) * 1.2, p.y);
      this.net.scale.setScalar(0.3 + 0.7 * t);
      if (t >= 1) this.netFly = null;
    };
  }
}
