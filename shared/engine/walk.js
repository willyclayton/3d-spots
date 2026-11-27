// First-person walking: mouse-look with pointer lock, WASD / arrow keys,
// Shift to run, and on touch screens a virtual joystick (left) plus drag to
// look (right).  Collision and floor height come from a site-specific world:
//   world.resolve(feet: Vector3, dx, dz) -> { x, z, floor, ceiling } | null
import * as THREE from 'three';

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
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.45, 1.45);
  }

  enable(feet, yaw = 0, pitch = 0) {
    this.enabled = true;
    this.feet.copy(feet);
    this.yaw = yaw; this.pitch = pitch;
    this.vy = 0;
    const r = this.world.resolve(this.feet, 0, 0);
    if (r) { this.feet.y = r.floor; this.eyeCur = this.eyeFor(r); }
    this.apply();
  }

  disable() {
    this.enabled = false;
    this.keys.clear();
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
  }

  eyeFor(r) { return Math.max(0.55, Math.min(1.62, (r.ceiling - r.floor) - 0.16)); }

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
    if (len > 1) { f /= len; s /= len; }
    const sp = (run ? this.speedRun : this.speedWalk) * dt;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (-sin * f + cos * s) * sp;
    const dz = (-cos * f - sin * s) * sp;
    const r = this.world.resolve(this.feet, dx, dz);
    if (r) {
      this.feet.x = r.x; this.feet.z = r.z;
      if (r.floor > this.feet.y) { this.feet.y = r.floor; this.vy = 0; }
      else {
        this.vy -= 9.8 * dt;
        this.feet.y = Math.max(r.floor, this.feet.y + this.vy * dt);
        if (this.feet.y === r.floor) this.vy = 0;
      }
      const target = this.eyeFor(r);
      this.eyeCur += (target - this.eyeCur) * Math.min(1, dt * 8);
      this.inside = r.inside;
    }
    this.apply();
  }

  apply() {
    this.camera.position.set(this.feet.x, this.feet.y + this.eyeCur, this.feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
