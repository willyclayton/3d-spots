// First-person walking: mouse-look with pointer lock, WASD / arrow keys,
// Shift to run, and on touch screens a virtual joystick (left) plus drag to
// look (right).  Collision and floor height come from a site-specific world:
//   world.resolve(feet: Vector3, dx, dz) -> { x, z, floor, ceiling } | null
import * as THREE from 'three';

const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class WalkController {
  constructor(camera, dom, world, { onLockChange, joystickEl } = {}) {
    this.camera = camera; this.dom = dom; this.world = world;
    this.enabled = false;
    this.feet = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.62; this.eyeCur = 1.62;
    this.vy = 0;
    this.keys = new Set();
    this.onLockChange = onLockChange;
    this.speedWalk = 1.6; this.speedRun = 5.5;
    this.joy = { x: 0, y: 0, active: false };
    this.joyEl = joystickEl;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.dom.addEventListener('click', () => {
      if (this.enabled && !this.touch && document.pointerLockElement !== this.dom) this.dom.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => this.onLockChange?.(document.pointerLockElement === this.dom));
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.dom) return;
      this.look(e.movementX, e.movementY, 0.0022);
    });
    // drag-to-look without pointer lock (and on touch, right side of screen)
    let drag = null;
    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') this.touch = true;
      if (document.pointerLockElement === this.dom) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !this.enabled) return;
      this.look(e.clientX - drag.x, e.clientY - drag.y, e.pointerType === 'touch' ? 0.006 : 0.004);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
    addEventListener('pointercancel', () => { drag = null; });
    // joystick
    if (this.joyEl) {
      const knob = this.joyEl.querySelector('.knob');
      let jid = null, cx = 0, cy = 0;
      const R = 46;
      this.joyEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); this.touch = true;
        jid = e.pointerId; const r = this.joyEl.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        this.joyEl.setPointerCapture(e.pointerId); move(e);
      });
      const move = (e) => {
        if (e.pointerId !== jid) return;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy = { x: dx / R, y: dy / R, active: true };
      };
      this.joyEl.addEventListener('pointermove', move);
      const end = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy = { x: 0, y: 0, active: false }; knob.style.transform = ''; };
      this.joyEl.addEventListener('pointerup', end);
      this.joyEl.addEventListener('pointercancel', end);
    }
  }

  look(dx, dy, k) {
    if (this.auto) this.auto.lookHold = 2.5;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.45, 1.45);
  }

  enable(feet, yaw = 0, pitch = 0) {
    this.enabled = true;
    this.feet.copy(feet);
    this.yaw = yaw; this.pitch = pitch;
    this.vy = 0;
    const r = this.world.resolve(this.feet, 0, 0);
    if (r) { this.feet.y = r.floor; this.eyeCur = this.eyeFor(r); this.ceiling = r.ceiling; this.inside = r.inside; }
    this.apply();
  }

  disable() {
    this.cancelAuto(false);
    this.enabled = false;
    this.keys.clear();
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
  }

  eyeFor(r) { return Math.max(0.55, Math.min(1.62, (r.ceiling - r.floor) - 0.16)); }

  // Follow a list of waypoints (Vector3, y ignored) at a given speed.
  // Resolves when the last point is reached or the walk is interrupted.
  autoWalk(points, { speed = 2.6 } = {}) {
    this.cancelAuto();
    return new Promise((resolve) => {
      this.auto = { pts: points, i: 0, speed, resolve, best: Infinity, stall: 0, lookHold: 0, slope: 0 };
    });
  }

  cancelAuto(done = false) {
    if (this.auto) { const r = this.auto.resolve; this.auto = null; r(done); }
  }

  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (this.joy.active) { f -= this.joy.y; s += this.joy.x; }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.95);
    const len = Math.hypot(f, s);
    let dx, dz;
    if (this.auto && len > 0.05) { this.cancelAuto(false); this.onUserMove?.(); }
    if (this.auto && this.paused) { dx = 0; dz = 0; }
    else if (this.auto) {
      const a = this.auto;
      const t = a.pts[a.i];
      const ex = t.x - this.feet.x, ez = t.z - this.feet.z, d = Math.hypot(ex, ez);
      if (d < 0.3) {
        a.i++; a.best = Infinity; a.stall = 0;
        if (a.i >= a.pts.length) { this.cancelAuto(true); dx = dz = 0; }
        else { dx = dz = 0; }
      } else {
        const step = Math.min(d, a.speed * dt);
        dx = (ex / d) * step; dz = (ez / d) * step;
        // look where we are going, unless the user is looking around
        a.lookHold -= dt;
        if (a.lookHold <= 0) {
          const want = Math.atan2(-ex, -ez);
          let dy = want - this.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          this.yaw += dy * Math.min(1, dt * 2.5);
          this.pitch += (Math.atan(a.slope) * 0.85 - this.pitch) * Math.min(1, dt * 2);
        }
        // unstick: if we stop making progress, hop to the waypoint
        if (d < a.best - 0.02) { a.best = d; a.stall = 0; } else a.stall += dt;
        if (a.stall > 1.2) {
          this.unsticks = (this.unsticks || 0) + 1;      // (counted for tests)
          this.lastStuck = [this.feet.x, this.feet.y, this.feet.z];
          const r = this.world.resolve({ x: t.x, y: this.feet.y, z: t.z }, 0, 0);
          this.feet.x = t.x; this.feet.z = t.z; if (r) this.feet.y = r.floor;
          a.stall = 0;
        }
      }
    } else {
      if (len > 1) { f /= len; s /= len; }
      const sp = (run ? this.speedRun : this.speedWalk) * dt;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      dx = (-sin * f + cos * s) * sp;
      dz = (-cos * f - sin * s) * sp;
    }
    const y0 = this.feet.y, x0 = this.feet.x, z0 = this.feet.z;
    const r = this.world.resolve(this.feet, dx, dz);
    if (r) {
      this.feet.x = r.x; this.feet.z = r.z;
      const drop = this.feet.y - r.floor;
      if (drop <= 0.6) { this.feet.y = r.floor; this.vy = 0; }   // walk up and down slopes and steps
      else {
        this.vy -= 9.8 * dt;
        this.feet.y = Math.max(r.floor, this.feet.y + this.vy * dt);
        if (this.feet.y === r.floor) this.vy = 0;
      }
      this.ceiling = r.ceiling;
      const target = this.eyeFor(r);
      this.eyeCur += (target - this.eyeCur) * Math.min(1, dt * 8);
      this.inside = r.inside;
      // gait: phase advances with distance walked (about 0.75 m per step)
      const moved = Math.hypot(this.feet.x - x0, this.feet.z - z0);
      this.bobPhase = (this.bobPhase || 0) + moved * (Math.PI / 0.75);
      const gait = moved / dt > 0.3 && !REDUCED_MOTION ? 1 : 0;
      this.bobAmp = (this.bobAmp || 0) + (gait - (this.bobAmp || 0)) * Math.min(1, dt * 6);
      if (this.auto) {
        const h = Math.hypot(this.feet.x - x0, this.feet.z - z0);
        if (h > 1e-3) this.auto.slope += ((this.feet.y - y0) / h - this.auto.slope) * Math.min(1, dt * 3);
      }
    }
    this.apply();
  }

  apply() {
    let eye = this.eyeCur;
    // never let the eye poke through a low ceiling
    if (this.ceiling !== undefined && isFinite(this.ceiling)) eye = Math.min(eye, this.ceiling - this.feet.y - 0.12);
    const bob = (this.bobAmp || 0) * (Math.abs(Math.sin(this.bobPhase || 0)) * 0.035 - 0.0175);
    const sway = (this.bobAmp || 0) * Math.sin((this.bobPhase || 0) * 0.5) * 0.004;
    this.camera.position.set(this.feet.x, this.feet.y + Math.max(0.3, eye + bob), this.feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, sway, 'YXZ');
  }
}
