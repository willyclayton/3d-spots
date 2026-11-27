// Free flight over the whole site, like a drone.
//
//  Desktop: drag to look, W A S D / arrows to fly, Q / E down and up,
//           Shift for speed, wheel to glide forward and back.
//  Touch:   joystick (left) to fly, drag to look, the up/down buttons to
//           climb and descend.
//
// Speed grows with height above the ground, so crossing the plateau from
// high up is quick while skimming the stones stays controllable. Motion is
// smoothed (velocity eases in and out). `limit(pos)` keeps the camera clear
// of the ground and the monuments.
import * as THREE from 'three';

export class FlyController {
  constructor(camera, dom, { groundAt, limit, joystickEl, upEl, downEl, bounds } = {}) {
    this.camera = camera; this.dom = dom;
    this.groundAt = groundAt; this.limit = limit; this.bounds = bounds;
    this.enabled = false;
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false };
    this.climb = 0;          // -1 .. 1 from the touch buttons
    this.glide = 0;          // wheel impulse
    this._bind(joystickEl, upEl, downEl);
  }

  _bind(joyEl, upEl, downEl) {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag = null;
    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !this.enabled) return;
      const k = e.pointerType === 'touch' ? 0.005 : 0.0035;
      this.yaw -= (e.clientX - drag.x) * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - drag.y) * k, -1.5, 1.2);
      drag.x = e.clientX; drag.y = e.clientY;
      this.onUserMove?.();
    });
    addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
    addEventListener('pointercancel', () => { drag = null; });
    this.dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.glide = THREE.MathUtils.clamp(this.glide - Math.sign(e.deltaY) * 0.6, -3, 3);
    }, { passive: false });
    if (joyEl) {
      const knob = joyEl.querySelector('.knob');
      let jid = null, cx = 0, cy = 0;
      const R = 46;
      const move = (e) => {
        if (e.pointerId !== jid) return;
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy = { x: dx / R, y: dy / R, active: true };
      };
      joyEl.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.stopPropagation();
        jid = e.pointerId; const r = joyEl.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        joyEl.setPointerCapture(e.pointerId); move(e);
        this.onUserMove?.();
      });
      joyEl.addEventListener('pointermove', move);
      const end = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy = { x: 0, y: 0, active: false }; knob.style.transform = ''; };
      joyEl.addEventListener('pointerup', end);
      joyEl.addEventListener('pointercancel', end);
    }
    const hold = (el, v) => {
      if (!el) return;
      const on = (e) => { if (!this.enabled) return; e.preventDefault(); e.stopPropagation(); this.climb = v; this.onUserMove?.(); };
      const off = () => { if (this.climb === v) this.climb = 0; };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    };
    hold(upEl, 1); hold(downEl, -1);
  }

  // take over from wherever the camera is now
  enable() {
    this.enabled = true;
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = THREE.MathUtils.clamp(e.x, -1.5, 1.2);
    this.vel.set(0, 0, 0); this.glide = 0; this.climb = 0;
  }

  disable() { this.enabled = false; this.keys.clear(); this.vel.set(0, 0, 0); }

  height() { return this.camera.position.y - this.groundAt(this.camera.position.x, this.camera.position.z); }

  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    let f = 0, s = 0, u = this.climb;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (k.has('KeyE') || k.has('Space') || k.has('PageUp')) u += 1;
    if (k.has('KeyQ') || k.has('PageDown')) u -= 1;
    if (this.joy.active) { f -= this.joy.y; s += this.joy.x; }
    f += this.glide;
    this.glide *= Math.exp(-dt * 1.6);
    if (Math.abs(this.glide) < 0.02) this.glide = 0;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1;
    // cruising speed follows height above ground: 12 m/s low down, ~250 m/s high up
    const h = Math.max(1, this.height());
    const speed = THREE.MathUtils.clamp(h * 0.75, 12, 260) * boost;
    // fly where you look (forward includes pitch); strafe stays level
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = new THREE.Vector3(-sy * cp, sp, -cy * cp);
    const right = new THREE.Vector3(cy, 0, -sy);
    const want = new THREE.Vector3()
      .addScaledVector(fwd, f).addScaledVector(right, s)
      .multiplyScalar(speed);
    want.y += u * Math.max(8, speed * 0.6);
    // ease velocity towards the wanted one (smooth starts and stops)
    this.vel.lerp(want, 1 - Math.exp(-dt * 3.2));
    const p = this.camera.position;
    p.addScaledVector(this.vel, dt);
    if (this.bounds) {
      const b = this.bounds;
      p.x = THREE.MathUtils.clamp(p.x, b.x0, b.x1);
      p.z = THREE.MathUtils.clamp(p.z, b.z0, b.z1);
      p.y = Math.min(p.y, b.yMax);
    }
    this.limit?.(p);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
